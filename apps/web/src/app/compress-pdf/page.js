"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";

export default function CompressPdf() {
  const [originalFile, setOriginalFile] = useState(null);
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedBytes, setCompressedBytes] = useState(null);
  const [compressedSize, setCompressedSize] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isDeepCompressing, setIsDeepCompressing] = useState(false);
  const [showAd, setShowAd] = useState(false);
  const [adCountdown, setAdCountdown] = useState(3);
  const [errorMsg, setErrorMsg] = useState("");
  const [usedDeepCompress, setUsedDeepCompress] = useState(false);

  const compressionLevels = {
    light: { scale: 2, quality: 0.8, label: "Light (best quality)" },
    recommended: { scale: 1.5, quality: 0.6, label: "Recommended" },
    extreme: { scale: 1.0, quality: 0.4, label: "Extreme (smallest size)" },
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setErrorMsg("");
    setOriginalFile(file);
    setOriginalSize(file.size);
    setCompressedBytes(null);
    setUsedDeepCompress(false);
    setIsCompressing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, {
        updateMetadata: false,
      });

      const compressed = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
      });

      setCompressedBytes(compressed);
      setCompressedSize(compressed.byteLength);
    } catch (error) {
      setErrorMsg("Couldn't process this PDF. It may be encrypted or corrupted.");
      console.error(error);
    } finally {
      setIsCompressing(false);
    }
  };

  const runDeepCompress = async (level) => {
    setIsDeepCompressing(true);
    setErrorMsg("");

    try {
      const { scale, quality } = compressionLevels[level];
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://unpkg.com/pdfjs-dist@4.7.76/legacy/build/pdf.worker.mjs";

      const arrayBuffer = await originalFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const newPdfDoc = await PDFDocument.create();

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");

        await page.render({ canvasContext: ctx, viewport }).promise;

        const jpegDataUrl = canvas.toDataURL("image/jpeg", quality);
        const jpegBytes = await fetch(jpegDataUrl).then((r) => r.arrayBuffer());
        const jpegImage = await newPdfDoc.embedJpg(jpegBytes);

        const newPage = newPdfDoc.addPage([viewport.width, viewport.height]);
        newPage.drawImage(jpegImage, {
          x: 0,
          y: 0,
          width: viewport.width,
          height: viewport.height,
        });
      }

      const bytes = await newPdfDoc.save();
      setCompressedBytes(bytes);
      setCompressedSize(bytes.byteLength);
      setUsedDeepCompress(true);
    } catch (error) {
      setErrorMsg("Deep compression failed on this file. Try a different level or the regular compression.");
      console.error(error);
    } finally {
      setIsDeepCompressing(false);
    }
  };

  const startAdThenDownload = () => {
    setShowAd(true);
    setAdCountdown(3);

    const interval = setInterval(() => {
      setAdCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const downloadFile = () => {
    const blob = new Blob([compressedBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "compressed-" + originalFile.name;
    link.click();
    URL.revokeObjectURL(url);
    setShowAd(false);
  };

  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const percentSaved = originalSize && compressedSize
    ? Math.max(0, Math.round((1 - compressedSize / originalSize) * 100))
    : 0;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-gray-900">ClearFile</a>
          <span className="text-sm text-gray-500">100% Private &middot; No Sign-up</span>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Compress PDF</h1>
        <p className="text-gray-600 mb-8">
          Upload a PDF. It's processed entirely on your device — nothing is uploaded anywhere.
        </p>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 mb-6">
            {errorMsg}
          </div>
        )}

        {!compressedBytes && !isCompressing && (
          <label className="block border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition bg-white">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <p className="text-gray-700 font-medium mb-1">Click to choose a PDF</p>
            <p className="text-gray-400 text-sm">PDF files only</p>
          </label>
        )}

        {isCompressing && (
          <div className="border border-gray-200 rounded-xl p-12 text-center bg-white">
            <p className="text-gray-700 font-medium">Compressing your PDF&hellip;</p>
            <p className="text-gray-400 text-sm mt-1">This happens locally on your device</p>
          </div>
        )}

        {compressedBytes && !showAd && (
          <div className="border border-gray-200 rounded-xl p-8 bg-white">
            <div className="grid grid-cols-2 gap-4 mb-2 text-center">
              <div>
                <p className="text-sm text-gray-500">Original</p>
                <p className="text-xl font-semibold text-gray-900">{formatSize(originalSize)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Compressed</p>
                <p className="text-xl font-semibold text-green-600">{formatSize(compressedSize)}</p>
              </div>
            </div>
            <p className="text-center text-sm text-gray-500 mb-6">
              {percentSaved > 0 ? `${percentSaved}% smaller` : "This PDF was already well-optimized"}
            </p>

            <button
              onClick={startAdThenDownload}
              className="w-full bg-gray-900 text-white font-medium py-3 rounded-lg hover:bg-gray-800 transition mb-3"
            >
              Get Compressed PDF
            </button>

            {!isDeepCompressing && (
              <div className="border-t border-gray-100 pt-4 mt-2">
                <p className="text-sm text-gray-600 mb-3">
                  {usedDeepCompress
                    ? "Want a different result? Pick another compression level:"
                    : "Barely shrank? Common for scanned or image-heavy PDFs. Try Deep Compress \u2014 re-processes each page as an optimized image. Best for scans/photos; text becomes non-selectable."}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(compressionLevels).map(([key, level]) => (
                    <button
                      key={key}
                      onClick={() => runDeepCompress(key)}
                      className="border border-gray-300 text-gray-800 text-sm font-medium py-2.5 rounded-lg hover:border-gray-900 hover:bg-gray-50 transition"
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {isDeepCompressing && (
          <div className="border border-gray-200 rounded-xl p-12 text-center bg-white">
            <p className="text-gray-700 font-medium">Deep compressing&hellip;</p>
            <p className="text-gray-400 text-sm mt-1">This may take a bit longer for large PDFs</p>
          </div>
        )}

        {showAd && (
          <div className="border border-gray-200 rounded-xl p-8 bg-white text-center">
            <div className="bg-gray-100 border border-gray-200 rounded-lg py-16 mb-6">
              <p className="text-gray-400 text-sm">[ Ad space ]</p>
            </div>
            {adCountdown > 0 ? (
              <p className="text-gray-500">Your download will be ready in {adCountdown}&hellip;</p>
            ) : (
              <button
                onClick={downloadFile}
                className="w-full bg-green-600 text-white font-medium py-3 rounded-lg hover:bg-green-700 transition"
              >
                Download Now
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}