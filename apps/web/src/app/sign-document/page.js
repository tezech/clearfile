"use client";

import { useState, useRef, useLayoutEffect } from "react";
import { PDFDocument } from "pdf-lib";

const INK_COLORS = ["#000000", "#002b80", "#008037"];

export default function SignDocument() {
  const [docFile, setDocFile] = useState(null);
  const [isPdf, setIsPdf] = useState(false);
  const [docBytes, setDocBytes] = useState(null);
  const [docPreviewUrl, setDocPreviewUrl] = useState(null);
  // Sized to the real document's aspect ratio (not a fixed box) so the
  // preview fills edge-to-edge with zero letterboxing — a tap here maps
  // exactly to the final signed position. Computed to explicit pixel
  // dimensions in JS (see previewSize effect below) rather than relying on
  // CSS aspect-ratio, which doesn't reliably shrink width to match a
  // max-height clamp across flex/box-sizing combinations.
  const [docAspectRatio, setDocAspectRatio] = useState(8.5 / 11);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const previewWrapRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [inkColor, setInkColor] = useState("#000000");
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState(null);
  const [sigPos, setSigPos] = useState({ x: 50, y: 80 });
  const sigCanvasRef = useRef(null);

  const [isSigning, setIsSigning] = useState(false);
  const [outputBlob, setOutputBlob] = useState(null);
  const [outputFilename, setOutputFilename] = useState("");
  const [showAd, setShowAd] = useState(false);
  const [adCountdown, setAdCountdown] = useState(3);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setErrorMsg("");
    setDocFile(file);
    setOutputBlob(null);

    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      setIsPdf(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        setDocBytes(arrayBuffer);

        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://unpkg.com/pdfjs-dist@4.7.76/legacy/build/pdf.worker.mjs";

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
        const page = await pdf.getPage(1);
        const unscaled = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 900 / unscaled.width });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;

        setDocAspectRatio(viewport.width / viewport.height);
        setDocPreviewUrl(canvas.toDataURL("image/png"));
      } catch (error) {
        setErrorMsg("Couldn't preview this PDF. It may be encrypted or corrupted.");
        setDocFile(null);
        setIsPdf(false);
        console.error(error);
      }
    } else {
      setIsPdf(false);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          setDocAspectRatio(img.naturalWidth / img.naturalHeight);
          setDocBytes(ev.target.result);
          setDocPreviewUrl(ev.target.result);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  // Explicitly computes the preview box's pixel size from the wrapper's
  // available width and docAspectRatio, capped to 70% of viewport height —
  // shrinking width to match when the height cap kicks in, so the box's
  // rendered shape always matches the real document exactly.
  useLayoutEffect(() => {
    if (!docPreviewUrl || !previewWrapRef.current) return;
    const recompute = () => {
      const maxWidth = previewWrapRef.current.clientWidth;
      const maxHeight = window.innerHeight * 0.7;
      let width = maxWidth;
      let height = width / docAspectRatio;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * docAspectRatio;
      }
      setPreviewSize({ width, height });
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [docPreviewUrl, docAspectRatio]);

  const pointerPos = (e, el) => {
    const rect = el.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  };

  const startDrawing = (e) => {
    setIsDrawing(true);
    const canvas = sigCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const { x, y } = pointerPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x * (canvas.width / rect.width), y * (canvas.height / rect.height));
  };

  const moveDrawing = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = sigCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const { x, y } = pointerPos(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = inkColor;
    ctx.lineTo(x * (canvas.width / rect.width), y * (canvas.height / rect.height));
    ctx.stroke();
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setSignatureUrl(sigCanvasRef.current.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setSignatureUrl(null);
  };

  const placeSignature = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setSigPos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const runSign = async () => {
    if (!docBytes || !signatureUrl) return;
    setIsSigning(true);
    setErrorMsg("");

    try {
      if (isPdf) {
        const pdfDoc = await PDFDocument.load(docBytes);
        const page = pdfDoc.getPages()[0];
        const sigBytes = await fetch(signatureUrl).then((r) => r.arrayBuffer());
        const embeddedSig = await pdfDoc.embedPng(sigBytes);

        const { width: pW, height: pH } = page.getSize();
        const sigW = pW * 0.3;
        const sigH = (embeddedSig.height * sigW) / embeddedSig.width;
        const posX = (sigPos.x / 100) * pW - sigW / 2;
        const posY = ((100 - sigPos.y) / 100) * pH - sigH / 2;

        page.drawImage(embeddedSig, {
          x: Math.max(10, posX),
          y: Math.max(10, posY),
          width: sigW,
          height: sigH,
        });

        const bytes = await pdfDoc.save();
        setOutputBlob(new Blob([bytes], { type: "application/pdf" }));
        setOutputFilename(`signed-${docFile.name}`);
      } else {
        const baseImg = new Image();
        await new Promise((resolve, reject) => {
          baseImg.onload = resolve;
          baseImg.onerror = reject;
          baseImg.src = docPreviewUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = baseImg.naturalWidth;
        canvas.height = baseImg.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(baseImg, 0, 0);

        const sigImg = new Image();
        await new Promise((resolve, reject) => {
          sigImg.onload = resolve;
          sigImg.onerror = reject;
          sigImg.src = signatureUrl;
        });
        const sigW = canvas.width * 0.28;
        const sigH = (sigImg.height * sigW) / sigImg.width;
        const posX = (sigPos.x / 100) * canvas.width - sigW / 2;
        const posY = (sigPos.y / 100) * canvas.height - sigH / 2;
        ctx.drawImage(sigImg, Math.max(5, posX), Math.max(5, posY), sigW, sigH);

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
        setOutputBlob(blob);
        setOutputFilename(`signed-${docFile.name}`);
      }
    } catch (error) {
      setErrorMsg("Couldn't apply the signature. Try a different file.");
      console.error(error);
    } finally {
      setIsSigning(false);
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
    const url = URL.createObjectURL(outputBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = outputFilename;
    link.click();
    URL.revokeObjectURL(url);
    setShowAd(false);
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-gray-900">ClearFile</a>
          <span className="text-sm text-gray-500">100% Private &middot; No Sign-up</span>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Sign Document</h1>
        <p className="text-gray-600 mb-8">
          Upload a PDF or image, draw your signature, and place it exactly where you want &mdash; entirely on your device.
        </p>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 mb-6">
            {errorMsg}
          </div>
        )}

        {!docFile && !outputBlob && (
          <label className="block border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition bg-white">
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <p className="text-gray-700 font-medium mb-1">Click to choose a PDF or image</p>
            <p className="text-gray-400 text-sm">PDF, JPG, or PNG</p>
          </label>
        )}

        {docFile && !outputBlob && !showAd && (
          <div className="border border-gray-200 rounded-xl p-8 bg-white">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-gray-700 font-medium truncate">{docFile.name}</span>
              <label className="text-sm text-blue-600 cursor-pointer shrink-0 ml-3">
                Change file
                <input type="file" accept="application/pdf,image/*" onChange={handleFileSelect} className="hidden" />
              </label>
            </div>

            {/* Explicitly sized in pixels (see previewSize effect) to match
                docAspectRatio exactly, so there's no letterboxing between
                the tap position and the final signed position, whatever
                shape the document is. */}
            <div ref={previewWrapRef} className="w-full flex justify-center mb-2">
              <div
                onClick={placeSignature}
                className="relative bg-white border border-gray-300 rounded-lg overflow-hidden cursor-crosshair"
                style={{ width: previewSize.width || "100%", height: previewSize.height || 300 }}
              >
                <img src={docPreviewUrl} alt="Document preview" className="w-full h-full object-contain" />
                {signatureUrl && (
                  <img
                    src={signatureUrl}
                    alt="Signature"
                    className="absolute pointer-events-none"
                    style={{
                      top: `${sigPos.y}%`,
                      left: `${sigPos.x}%`,
                      transform: "translate(-50%, -50%)",
                      width: "26%",
                    }}
                  />
                )}
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center mb-6">
              {signatureUrl ? "Click the document again to move the signature" : "Draw a signature below, then click the document to place it"}
            </p>

            <div className="flex items-center gap-3 mb-6">
              <span className="text-sm text-gray-600">Ink:</span>
              {INK_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setInkColor(c)}
                  className="w-6 h-6 rounded-full"
                  style={{ backgroundColor: c, border: inkColor === c ? "2px solid #2563eb" : "1px solid #cbd5e1" }}
                />
              ))}
            </div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Draw your signature:</span>
              <button onClick={clearSignature} className="text-sm text-red-600">Clear</button>
            </div>
            <div className="w-full h-32 bg-white border border-dashed border-gray-300 rounded-lg overflow-hidden mb-6">
              <canvas
                ref={sigCanvasRef}
                width={600}
                height={160}
                onMouseDown={startDrawing}
                onMouseMove={moveDrawing}
                onMouseUp={endDrawing}
                onMouseLeave={endDrawing}
                onTouchStart={startDrawing}
                onTouchMove={moveDrawing}
                onTouchEnd={endDrawing}
                className="w-full h-full touch-none"
              />
            </div>

            <button
              onClick={runSign}
              disabled={!signatureUrl || isSigning}
              className="w-full bg-gray-900 text-white font-medium py-3 rounded-lg hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSigning ? "Signing…" : "Sign document"}
            </button>
          </div>
        )}

        {outputBlob && !showAd && (
          <div className="border border-gray-200 rounded-xl p-8 bg-white text-center">
            <p className="text-gray-700 font-medium mb-6">Your signed file is ready: {outputFilename}</p>
            <button
              onClick={startAdThenDownload}
              className="w-full bg-gray-900 text-white font-medium py-3 rounded-lg hover:bg-gray-800 transition"
            >
              Get Signed File
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
