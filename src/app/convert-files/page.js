"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

export default function ConvertFiles() {
  const [activeTab, setActiveTab] = useState("imageFormat");

  const [imageFile, setImageFile] = useState(null);
  const [targetFormat, setTargetFormat] = useState("jpeg");

  const [multiImages, setMultiImages] = useState([]);

  const [pdfFile, setPdfFile] = useState(null);
  const [pdfExportFormat, setPdfExportFormat] = useState("jpeg");

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [outputBlob, setOutputBlob] = useState(null);
  const [outputFilename, setOutputFilename] = useState("");
  const [showAd, setShowAd] = useState(false);
  const [adCountdown, setAdCountdown] = useState(3);

  const resetOutput = () => {
    setOutputBlob(null);
    setOutputFilename("");
    setErrorMsg("");
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    resetOutput();
    setImageFile(null);
    setMultiImages([]);
    setPdfFile(null);
  };

  // ---------- Tab 1: Image format conversion ----------
  const convertImageFormat = async () => {
    if (!imageFile) return;
    setIsProcessing(true);
    setErrorMsg("");

    try {
      const bitmap = await createImageBitmap(imageFile);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");

      if (targetFormat === "jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(bitmap, 0, 0);

      const mime = targetFormat === "jpeg" ? "image/jpeg" : `image/${targetFormat}`;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.92));

      const baseName = imageFile.name.replace(/\.[^/.]+$/, "");
      setOutputBlob(blob);
      setOutputFilename(`${baseName}.${targetFormat === "jpeg" ? "jpg" : targetFormat}`);
    } catch (error) {
      setErrorMsg("Couldn't convert this image. Try a different file.");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  // ---------- Tab 2: Images to PDF ----------
  const convertToPdfBytes = async (file) => {
    if (file.type === "image/jpeg" || file.type === "image/png") {
      return { bytes: await file.arrayBuffer(), type: file.type };
    }
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    return { bytes: await blob.arrayBuffer(), type: "image/jpeg" };
  };

  const imagesToPdf = async () => {
    if (multiImages.length === 0) return;
    setIsProcessing(true);
    setErrorMsg("");

    try {
      const pdfDoc = await PDFDocument.create();

      for (const file of multiImages) {
        const { bytes, type } = await convertToPdfBytes(file);
        const image = type === "image/png"
          ? await pdfDoc.embedPng(bytes)
          : await pdfDoc.embedJpg(bytes);

        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }

      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      setOutputBlob(blob);
      setOutputFilename("combined.pdf");
    } catch (error) {
      setErrorMsg("Couldn't combine these images. Make sure they're valid image files.");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  // ---------- Tab 3: PDF to Images ----------
  const pdfToImages = async () => {
    if (!pdfFile) return;
    setIsProcessing(true);
    setErrorMsg("");

    try {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://unpkg.com/pdfjs-dist@4.7.76/legacy/build/pdf.worker.mjs";

      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const mime = pdfExportFormat === "jpeg" ? "image/jpeg" : "image/png";
      const ext = pdfExportFormat === "jpeg" ? "jpg" : "png";
      const pageBlobs = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.9));
        pageBlobs.push(blob);
      }

      if (pageBlobs.length === 1) {
        setOutputBlob(pageBlobs[0]);
        setOutputFilename(`page-1.${ext}`);
      } else {
        const zip = new JSZip();
        pageBlobs.forEach((blob, index) => {
          zip.file(`page-${index + 1}.${ext}`, blob);
        });
        const zipBlob = await zip.generateAsync({ type: "blob" });
        setOutputBlob(zipBlob);
        setOutputFilename("pages.zip");
      }
    } catch (error) {
      setErrorMsg("Couldn't process this PDF. It may be encrypted or corrupted.");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const runConversion = () => {
    if (activeTab === "imageFormat") convertImageFormat();
    else if (activeTab === "imagesToPdf") imagesToPdf();
    else if (activeTab === "pdfToImages") pdfToImages();
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
    const url = URL.createObjectURL(outputBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = outputFilename;
    link.click();
    URL.revokeObjectURL(url);
    setShowAd(false);
    resetOutput();
    setImageFile(null);
    setMultiImages([]);
    setPdfFile(null);
  };

  const canRun =
    (activeTab === "imageFormat" && imageFile) ||
    (activeTab === "imagesToPdf" && multiImages.length > 0) ||
    (activeTab === "pdfToImages" && pdfFile);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-gray-900">ClearFile</a>
          <span className="text-sm text-gray-500">100% Private &middot; No Sign-up</span>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Convert Files</h1>
        <p className="text-gray-600 mb-8">
          Everything happens on your device — nothing is uploaded anywhere.
        </p>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          <button
            onClick={() => switchTab("imageFormat")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "imageFormat" ? "bg-gray-900 text-white" : "bg-white border border-gray-300 text-gray-700"
            }`}
          >
            Image Format
          </button>
          <button
            onClick={() => switchTab("imagesToPdf")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "imagesToPdf" ? "bg-gray-900 text-white" : "bg-white border border-gray-300 text-gray-700"
            }`}
          >
            Images &rarr; PDF
          </button>
          <button
            onClick={() => switchTab("pdfToImages")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "pdfToImages" ? "bg-gray-900 text-white" : "bg-white border border-gray-300 text-gray-700"
            }`}
          >
            PDF &rarr; Images
          </button>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 mb-6">
            {errorMsg}
          </div>
        )}

        {!outputBlob && !isProcessing && !showAd && (
          <div className="bg-white border border-gray-200 rounded-xl p-8">
            {activeTab === "imageFormat" && (
              <>
                <label className="block border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition mb-6">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setImageFile(e.target.files[0])}
                    className="hidden"
                  />
                  <p className="text-gray-700 font-medium">
                    {imageFile ? imageFile.name : "Click to choose an image"}
                  </p>
                </label>
                <p className="text-sm text-gray-600 mb-3">Convert to:</p>
                <div className="grid grid-cols-3 gap-2 mb-6">
                  {["jpeg", "png", "webp"].map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setTargetFormat(fmt)}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition ${
                        targetFormat === fmt
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-300 text-gray-700 hover:border-gray-900"
                      }`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </>
            )}

            {activeTab === "imagesToPdf" && (
              <label className="block border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition mb-6">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => setMultiImages(Array.from(e.target.files))}
                  className="hidden"
                />
                <p className="text-gray-700 font-medium">
                  {multiImages.length > 0
                    ? `${multiImages.length} image(s) selected`
                    : "Click to choose one or more images"}
                </p>
                <p className="text-gray-400 text-sm mt-1">They'll be combined in the order selected</p>
              </label>
            )}

            {activeTab === "pdfToImages" && (
              <>
                <label className="block border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition mb-6">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setPdfFile(e.target.files[0])}
                    className="hidden"
                  />
                  <p className="text-gray-700 font-medium">
                    {pdfFile ? pdfFile.name : "Click to choose a PDF"}
                  </p>
                </label>
                <p className="text-sm text-gray-600 mb-3">Export pages as:</p>
                <div className="grid grid-cols-2 gap-2 mb-6">
                  {["jpeg", "png"].map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setPdfExportFormat(fmt)}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition ${
                        pdfExportFormat === fmt
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-300 text-gray-700 hover:border-gray-900"
                      }`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mb-6">
                  Multiple pages will be delivered as a .zip file.
                </p>
              </>
            )}

            <button
              onClick={runConversion}
              disabled={!canRun}
              className="w-full bg-gray-900 text-white font-medium py-3 rounded-lg hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Convert
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="border border-gray-200 rounded-xl p-12 text-center bg-white">
            <p className="text-gray-700 font-medium">Converting&hellip;</p>
            <p className="text-gray-400 text-sm mt-1">This happens locally on your device</p>
          </div>
        )}

        {outputBlob && !showAd && (
          <div className="border border-gray-200 rounded-xl p-8 bg-white text-center">
            <p className="text-gray-700 font-medium mb-6">Your file is ready: {outputFilename}</p>
            <button
              onClick={startAdThenDownload}
              className="w-full bg-gray-900 text-white font-medium py-3 rounded-lg hover:bg-gray-800 transition"
            >
              Get File
            </button>
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