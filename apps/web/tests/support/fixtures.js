/**
 * Generates disposable binary test files (image / PDF) used by the upload-driven
 * specs. Nothing here is committed to git — files are written under tests/.tmp
 * at run time so the repo never carries multi-MB binary fixtures.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { Document, Packer, Paragraph } = require("docx");

const TMP_DIR = path.join(__dirname, "..", ".tmp");

function ensureTmpDir() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  return TMP_DIR;
}

/**
 * Inserts a random suffix before the extension so parallel tests never race
 * to write/read the same fixture path, even when two specs pass the same
 * base name (tests run fullyParallel, so this isn't hypothetical).
 */
function uniqueName(baseName) {
  const ext = path.extname(baseName);
  const stem = baseName.slice(0, -ext.length || undefined);
  return `${stem}-${crypto.randomBytes(4).toString("hex")}${ext}`;
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

/**
 * Builds a valid, uncompressed (store-mode deflate) RGB PNG of the given
 * pixel dimensions. Using level 0 keeps the output size close to the raw
 * pixel size, so callers can reliably hit a target file size (e.g. >2 MB
 * for CF-W03's oversized-upload case) without depending on how compressible
 * pseudo-random pixel data happens to be.
 */
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

  const compressed = zlib.deflateSync(raw, { level: 0 });
  const idat = pngChunk("IDAT", compressed);
  const iend = pngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * Writes a PNG at least `minBytes` in size to tests/.tmp and returns its path.
 * Defaults to ~3 MB, comfortably over CF-W03's ">2 MB" upload requirement.
 */
function createOversizedImageFile(minBytes = 3 * 1024 * 1024) {
  const dir = ensureTmpDir();
  // 3 bytes/pixel + ~1 filter byte/row; 1000x1000 already clears 3 MB.
  const side = Math.ceil(Math.sqrt(minBytes / 3));
  const png = buildPng(side, side);
  if (png.length < minBytes) {
    throw new Error(`Generated fixture PNG (${png.length}B) is smaller than requested (${minBytes}B)`);
  }
  const filePath = path.join(dir, uniqueName("oversized-sample.png"));
  fs.writeFileSync(filePath, png);
  return filePath;
}

/** Writes a small (few KB) valid PNG, for cases that don't need bulk. */
function createSmallImageFile(name = "sample-small.png") {
  const dir = ensureTmpDir();
  const png = buildPng(64, 64);
  const filePath = path.join(dir, uniqueName(name));
  fs.writeFileSync(filePath, png);
  return filePath;
}

/** Builds a real multi-page PDF via pdf-lib and writes it to tests/.tmp. */
async function createMultiPagePdf(pageCount = 4, name = "sample-multipage.pdf") {
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
    page.drawRectangle({
      x: 50,
      y: 400,
      width: 400,
      height: 250,
      borderColor: rgb(0.2, 0.4, 0.8),
      borderWidth: 2,
    });
  }

  const bytes = await pdfDoc.save();
  const filePath = path.join(dir, uniqueName(name));
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

/** Writes a plain .txt fixture file with the given paragraphs (one per line). */
function createTextFile(paragraphs, name = "sample.txt") {
  const dir = ensureTmpDir();
  const filePath = path.join(dir, uniqueName(name));
  fs.writeFileSync(filePath, paragraphs.join("\n"));
  return filePath;
}

/** Builds a real minimal .docx via the `docx` package and writes it to tests/.tmp. */
async function createDocxFile(paragraphs, name = "sample.docx") {
  const dir = ensureTmpDir();
  const doc = new Document({
    sections: [
      {
        children: paragraphs.map((text) => new Paragraph({ text })),
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  const filePath = path.join(dir, uniqueName(name));
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

module.exports = {
  TMP_DIR,
  ensureTmpDir,
  createOversizedImageFile,
  createSmallImageFile,
  createMultiPagePdf,
  createTextFile,
  createDocxFile,
};
