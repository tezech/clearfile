/**
 * Generates disposable binary test files (image / PDF) used by the
 * file-upload specs. Nothing here is committed to git — files are written
 * under tests/.tmp at run time.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const QRCode = require("qrcode");

const TMP_DIR = path.join(__dirname, "..", ".tmp");

function ensureTmpDir() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  return TMP_DIR;
}

// --- Minimal hand-rolled PNG encoder (no external image deps needed) -------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function buildPng(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: truecolor (RGB)
  const ihdr = pngChunk("IHDR", ihdrData);

  const bytesPerPixel = 3;
  const rowBytes = 1 + width * bytesPerPixel;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * bytesPerPixel;
      raw[px] = (x * 131 + y * 7) & 0xff;
      raw[px + 1] = (x * 17 + y * 251) & 0xff;
      raw[px + 2] = (x ^ y) & 0xff;
    }
  }

  // level 0 keeps output size close to raw size, so callers can hit a
  // target file size deterministically.
  const compressed = zlib.deflateSync(raw, { level: 0 });
  const idat = pngChunk("IDAT", compressed);
  const iend = pngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/** Writes a small (few KB) valid PNG, for cases that don't need bulk. */
function createSmallImageFile(name = "sample-small.png") {
  const dir = ensureTmpDir();
  const png = buildPng(64, 64);
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, png);
  return filePath;
}

/**
 * Writes a PNG at least `minBytes` in size, for compression-target tests
 * (e.g. CF-M06 shrinking a file down to a target KB).
 */
function createSizedImageFile(minBytes, name = "sized-sample.png") {
  const dir = ensureTmpDir();
  const side = Math.max(32, Math.ceil(Math.sqrt(minBytes / 3)));
  const png = buildPng(side, side);
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, png);
  return filePath;
}

/** Builds a real multi-page PDF via pdf-lib and writes it to tests/.tmp. */
async function createMultiPagePdf(pageCount = 2, name = "sample-multipage.pdf") {
  const dir = ensureTmpDir();
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([612, 792]);
    page.drawText(`Clearfile QA fixture - page ${i + 1} of ${pageCount}`, {
      x: 50,
      y: 720,
      size: 18,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const bytes = await pdfDoc.save();
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

/** Renders `text` as a QR code and returns a data:image/png;base64 URL. */
function generateQrDataUrl(text) {
  return QRCode.toDataURL(text, { width: 500, margin: 2 });
}

module.exports = {
  TMP_DIR,
  ensureTmpDir,
  createSmallImageFile,
  createSizedImageFile,
  createMultiPagePdf,
  generateQrDataUrl,
};
