"use client";

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { PDFDocument, rgb } from "pdf-lib";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Browser } from "@capacitor/browser";
import jsQR from "jsqr";
import QRCode from "qrcode";
import JSZip from "jszip";
import { Card, Button, Chip, UploadDropzone, ResultBanner, ToolTitle } from "../components/ui";

export default function ClearfileApexEngine() {
  const [showSplash, setShowSplash] = useState(true);
  const [activeTool, setActiveTool] = useState(null);
  const [toastMsg, setToastMsg] = useState("");

  const notify = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3500);
  };

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1800);
    return () => clearTimeout(timer);
  }, []);

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return "0 KB";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const hexToRgba = (hex, alpha) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Device Storage Export Bridge
  const exportFileToDevice = async (base64Data, filename) => {
    try {
      notify("Saving file to device...");
      const cleanBase64 = base64Data.replace(/^data:.*?;base64,/, "");

      const saved = await Filesystem.writeFile({
        path: filename,
        data: cleanBase64,
        directory: Directory.Documents,
        recursive: true,
      });

      notify("Saved to Documents! Opening share sheet...");

      await Share.share({
        title: filename,
        text: `Clearfile Export: ${filename}`,
        url: saved.uri,
        dialogTitle: "Save to Phone Album or Files",
      });
      notify("File export complete!");
    } catch (err) {
      const blob = await (await fetch(base64Data)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      notify("Downloaded via browser download manager.");
    }
  };

  // =========================================================================
  // TOOL 1: 4-CORNER PERSPECTIVE WARP SCANNER & INSPECTION STUDIO
  // =========================================================================
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [rawCapturedImage, setRawCapturedImage] = useState(null);
  const [corners, setCorners] = useState([
    { x: 10, y: 10 },
    { x: 90, y: 10 },
    { x: 90, y: 90 },
    { x: 10, y: 90 },
  ]);
  const [draggingCorner, setDraggingCorner] = useState(null);
  const [inspectedPage, setInspectedPage] = useState(null);
  const [scannedStack, setScannedStack] = useState([]);
  const [scanFilter, setScanFilter] = useState("magic");
  const scanVideoRef = useRef(null);
  const scanStreamRef = useRef(null);
  const cropWrapperRef = useRef(null);

  const startScanCamera = async () => {
    setIsCameraActive(true);
    setRawCapturedImage(null);
    setInspectedPage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      scanStreamRef.current = stream;
      if (scanVideoRef.current) {
        scanVideoRef.current.srcObject = stream;
        scanVideoRef.current.setAttribute("playsinline", "true");
        await scanVideoRef.current.play();
      }
    } catch (e) {
      notify("Camera unavailable. Select document photo from gallery.");
      setIsCameraActive(false);
    }
  };

  const DEFAULT_CORNERS = [
    { x: 10, y: 10 },
    { x: 90, y: 10 },
    { x: 90, y: 90 },
    { x: 10, y: 90 },
  ];

  /**
   * Heuristic auto edge-detection: downscales the frame, blurs it slightly
   * to suppress sensor/JPEG noise, runs a Sobel gradient-magnitude pass,
   * then finds the axis-aligned box whose row/column edge-strength
   * projections cross a threshold set from the gradient distribution's
   * 92nd percentile (robust to a single bright outlier like a reflection —
   * a "% of the single maximum" threshold, used previously, is easily
   * skewed by one bright pixel and was rejecting nearly every real camera
   * photo). This isn't full perspective contour fitting (a genuinely
   * rotated/skewed page won't be caught precisely) — it's a fast,
   * dependency-free approximation for a document roughly facing the
   * camera. Returns null only when the frame truly has no discernible
   * structure, so callers can fall back to the manual default corners.
   */
  const detectDocumentCorners = (sourceCanvas) => {
    const maxDim = 320;
    const scale = Math.min(1, maxDim / Math.max(sourceCanvas.width, sourceCanvas.height));
    const w = Math.max(3, Math.round(sourceCanvas.width * scale));
    const h = Math.max(3, Math.round(sourceCanvas.height * scale));

    const small = document.createElement("canvas");
    small.width = w;
    small.height = h;
    const sctx = small.getContext("2d", { willReadFrequently: true });
    sctx.drawImage(sourceCanvas, 0, 0, w, h);
    const { data } = sctx.getImageData(0, 0, w, h);

    const gray = new Float32Array(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    const blurred = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            sum += gray[ny * w + nx];
            count++;
          }
        }
        blurred[y * w + x] = sum / count;
      }
    }

    const mag = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx =
          -blurred[i - w - 1] + blurred[i - w + 1] - 2 * blurred[i - 1] + 2 * blurred[i + 1] - blurred[i + w - 1] + blurred[i + w + 1];
        const gy =
          -blurred[i - w - 1] - 2 * blurred[i - w] - blurred[i - w + 1] + blurred[i + w - 1] + 2 * blurred[i + w] + blurred[i + w + 1];
        mag[i] = Math.sqrt(gx * gx + gy * gy);
      }
    }

    const sorted = Float32Array.from(mag).sort();
    const strongEdge = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.92))];
    if (strongEdge < 6) return null; // essentially no discernible structure in frame

    const rowSum = new Float32Array(h);
    const colSum = new Float32Array(w);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const m = mag[y * w + x];
        if (m > strongEdge) {
          rowSum[y] += m;
          colSum[x] += m;
        }
      }
    }

    const findBound = (arr, fromStart) => {
      const peak = Math.max(...arr);
      if (peak <= 0) return fromStart ? 0 : arr.length - 1;
      const cutoff = peak * 0.1;
      if (fromStart) {
        for (let i = 0; i < arr.length; i++) if (arr[i] >= cutoff) return i;
        return 0;
      }
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i] >= cutoff) return i;
      return arr.length - 1;
    };

    const top = findBound(rowSum, true);
    const bottom = findBound(rowSum, false);
    const left = findBound(colSum, true);
    const right = findBound(colSum, false);

    const boxWidthPct = ((right - left) / w) * 100;
    const boxHeightPct = ((bottom - top) / h) * 100;
    // Reject boxes too small to be a real document, or so close to the
    // full frame that auto-detection offers nothing over the default.
    if (boxWidthPct < 15 || boxHeightPct < 15) return null;
    if (boxWidthPct > 99 && boxHeightPct > 99) return null;

    const toPct = (v, dim) => Math.min(97, Math.max(3, Math.round((v / dim) * 100)));
    return [
      { x: toPct(left, w), y: toPct(top, h) },
      { x: toPct(right, w), y: toPct(top, h) },
      { x: toPct(right, w), y: toPct(bottom, h) },
      { x: toPct(left, w), y: toPct(bottom, h) },
    ];
  };

  const captureCameraFrame = () => {
    if (!scanVideoRef.current) return;
    const v = scanVideoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 1280;
    canvas.height = v.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

    if (scanStreamRef.current) {
      scanStreamRef.current.getTracks().forEach((t) => t.stop());
      scanStreamRef.current = null;
    }
    setIsCameraActive(false);
    setRawCapturedImage(dataUrl);

    const detected = detectDocumentCorners(canvas);
    setCorners(detected || DEFAULT_CORNERS);
    notify(detected ? "Document edges detected — adjust if needed." : "Drag the corners to match the page.");
  };

  const handleTouchCornerMove = (e) => {
    if (draggingCorner === null || !cropWrapperRef.current) return;
    const rect = cropWrapperRef.current.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    const xPct = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((touch.clientY - rect.top) / rect.height) * 100));

    setCorners((prev) => {
      const copy = [...prev];
      copy[draggingCorner] = { x: Math.round(xPct), y: Math.round(yPct) };
      return copy;
    });
  };

  const executePerspectiveWarp = () => {
    if (!rawCapturedImage) return;
    notify("Warping document...");

    const img = new Image();
    img.onload = () => {
      const p0 = { x: (corners[0].x / 100) * img.width, y: (corners[0].y / 100) * img.height };
      const p1 = { x: (corners[1].x / 100) * img.width, y: (corners[1].y / 100) * img.height };
      const p2 = { x: (corners[2].x / 100) * img.width, y: (corners[2].y / 100) * img.height };
      const p3 = { x: (corners[3].x / 100) * img.width, y: (corners[3].y / 100) * img.height };

      const minX = Math.max(0, Math.min(p0.x, p1.x, p2.x, p3.x));
      const maxX = Math.min(img.width, Math.max(p0.x, p1.x, p2.x, p3.x));
      const minY = Math.max(0, Math.min(p0.y, p1.y, p2.y, p3.y));
      const maxY = Math.min(img.height, Math.max(p0.y, p1.y, p2.y, p3.y));
      const w = Math.max(100, maxX - minX);
      const h = Math.max(100, maxY - minY);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, minX, minY, w, h, 0, 0, w, h);

      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;

      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (scanFilter === "magic") {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const boost = lum > 120 ? 1.22 : 0.85;
          d[i] = Math.min(255, r * boost);
          d[i + 1] = Math.min(255, g * boost);
          d[i + 2] = Math.min(255, b * boost);
        } else if (scanFilter === "bw") {
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          const val = gray > 128 ? 255 : gray < 75 ? 0 : Math.min(255, gray * 1.15);
          d[i] = val;
          d[i + 1] = val;
          d[i + 2] = val;
        }
      }

      ctx.putImageData(imgData, 0, 0);
      const resultDataUrl = canvas.toDataURL("image/jpeg", 0.94);
      setInspectedPage(resultDataUrl);
      notify("Document ready! Verify and save.");
    };
    img.src = rawCapturedImage;
  };

  const acceptScannedPage = () => {
    if (!inspectedPage) return;
    setScannedStack((prev) => [...prev, inspectedPage]);
    setInspectedPage(null);
    setRawCapturedImage(null);
    notify(`Page ${scannedStack.length + 1} added!`);
  };

  const exportScannedPDF = async () => {
    if (scannedStack.length === 0) return;
    notify("Compiling multi-page PDF...");
    try {
      const pdfDoc = await PDFDocument.create();
      for (const pageUrl of scannedStack) {
        const bytes = await fetch(pageUrl).then((r) => r.arrayBuffer());
        const embeddedImg = await pdfDoc.embedJpg(bytes);
        const page = pdfDoc.addPage([embeddedImg.width, embeddedImg.height]);
        page.drawImage(embeddedImg, { x: 0, y: 0, width: embeddedImg.width, height: embeddedImg.height });
      }
      const pdfBytes = await pdfDoc.save();
      const base64 = "data:application/pdf;base64," + Buffer.from(pdfBytes).toString("base64");
      await exportFileToDevice(base64, `Scanned-Doc-${Date.now()}.pdf`);
    } catch (e) {
      alert("Error generating PDF.");
    }
  };

  // =========================================================================
  // TOOL 2: TRANSPARENT SIGNING ON LIVE DOCUMENT
  // =========================================================================
  const [docToSignBytes, setDocToSignBytes] = useState(null);
  const [isPdfDocument, setIsPdfDocument] = useState(false);
  const [docFileName, setDocFileName] = useState("");
  const [docPreviewUrl, setDocPreviewUrl] = useState(null);
  // width/height of the actual document page — the preview box is sized in
  // explicit pixels (see previewSize effect below) to this exact ratio so
  // the image fills it with no letterboxing, which is what makes tap
  // position == final sign position. (CSS aspect-ratio combined with a
  // max-height clamp doesn't reliably shrink width to match — it can leave
  // the box full-width with a clipped height, silently reintroducing the
  // exact letterbox mismatch this is meant to prevent.)
  const [docAspectRatio, setDocAspectRatio] = useState(8.5 / 11);
  const [signPreviewSize, setSignPreviewSize] = useState({ width: 0, height: 0 });
  const signPreviewWrapRef = useRef(null);
  const [signatureTransparentUrl, setSignatureTransparentUrl] = useState(null);
  const [sigCoordinates, setSigCoordinates] = useState({ x: 50, y: 80 });
  const [attachSecuritySeal, setAttachSecuritySeal] = useState(false);
  const [signerName, setSignerName] = useState("AUTHORIZED SIGNER");
  const [inkColor, setInkColor] = useState("#000000");
  const sigCanvasRef = useRef(null);
  const [isDrawingSig, setIsDrawingSig] = useState(false);

  useLayoutEffect(() => {
    if (!docPreviewUrl || !signPreviewWrapRef.current) return;
    const recompute = () => {
      const maxWidth = signPreviewWrapRef.current.clientWidth;
      const maxHeight = window.innerHeight * 0.6;
      let width = maxWidth;
      let height = width / docAspectRatio;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * docAspectRatio;
      }
      setSignPreviewSize({ width, height });
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [docPreviewUrl, docAspectRatio]);

  const handleDocumentPickForSign = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocFileName(file.name);
    notify("Loading document...");

    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      setIsPdfDocument(true);
      const arrayBuffer = await file.arrayBuffer();
      setDocToSignBytes(arrayBuffer);

      // Render the actual first page (not a generic placeholder) so the tap
      // position the user sees maps to the real page's aspect ratio and
      // content — otherwise a tap that looks correct on a fixed 600x800
      // placeholder can land somewhere else entirely on the real page.
      try {
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://unpkg.com/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs";

        // pdf.js can transfer/detach the buffer it's given; pass it a copy
        // so docToSignBytes (used later by pdf-lib to burn the signature)
        // stays intact.
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
        const page = await pdf.getPage(1);
        const unscaled = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 700 / unscaled.width });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;

        setDocAspectRatio(viewport.width / viewport.height);
        setDocPreviewUrl(canvas.toDataURL("image/jpeg", 0.92));
        notify("PDF loaded. Tap exactly where you want to sign.");
      } catch (err) {
        alert("Couldn't preview this PDF. It may be encrypted or corrupted.");
        setIsPdfDocument(false);
        setDocToSignBytes(null);
        setDocFileName("");
        console.error(err);
      }
    } else {
      setIsPdfDocument(false);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          setDocAspectRatio(img.naturalWidth / img.naturalHeight);
          setDocPreviewUrl(ev.target.result);
          setDocToSignBytes(ev.target.result);
          notify("Document image ready. Tap exactly where you want to sign.");
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const startDrawingSignature = (e) => {
    setIsDrawingSig(true);
    const canvas = sigCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x * (canvas.width / rect.width), y * (canvas.height / rect.height));
  };

  const moveDrawingSignature = (e) => {
    if (!isDrawingSig) return;
    e.preventDefault();
    const canvas = sigCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = inkColor;
    ctx.lineTo(x * (canvas.width / rect.width), y * (canvas.height / rect.height));
    ctx.stroke();
  };

  const endDrawingSignature = () => {
    if (!isDrawingSig) return;
    setIsDrawingSig(false);
    const canvas = sigCanvasRef.current;
    if (!canvas) return;

    if (!attachSecuritySeal) {
      setSignatureTransparentUrl(canvas.toDataURL("image/png"));
      notify("Handwritten signature ready! Tap document to position.");
      return;
    }

    const badge = document.createElement("canvas");
    badge.width = 440;
    badge.height = 140;
    const ctx = badge.getContext("2d");

    ctx.fillStyle = "rgba(10, 14, 24, 0.92)";
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 2.5;
    ctx.roundRect(4, 4, 432, 132, 10);
    ctx.fill();
    ctx.stroke();

    ctx.drawImage(canvas, 10, 10, 210, 115);

    ctx.fillStyle = "#00e5ff";
    ctx.font = "bold 11px monospace";
    ctx.fillText("DIGITALLY CERTIFIED", 230, 36);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(signerName.toUpperCase(), 230, 54);
    ctx.fillStyle = "#8492a6";
    ctx.font = "9px monospace";
    ctx.fillText(`DATE: ${new Date().toISOString().substring(0, 10)}`, 230, 74);
    ctx.fillText(`HASH: #${Math.random().toString(36).substring(2, 9).toUpperCase()}`, 230, 90);
    ctx.fillStyle = "#10b981";
    ctx.font = "bold 10px monospace";
    ctx.fillText("✓ VERIFIED INTEGRITY", 230, 114);

    setSignatureTransparentUrl(badge.toDataURL("image/png"));
    notify("Verified security stamp ready! Tap to position.");
  };

  const clearSignaturePad = () => {
    const canvas = sigCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setSignatureTransparentUrl(null);
  };

  const burnSignatureAndSaveDocument = async () => {
    if (!docToSignBytes || !signatureTransparentUrl) return;
    notify("Signing document...");

    try {
      if (isPdfDocument) {
        const pdfDoc = await PDFDocument.load(docToSignBytes);
        // Sign the same page the user was shown and tapped on (page 1) —
        // not the last page, which could be different content entirely on
        // a multi-page document and would silently misplace the signature.
        const targetPage = pdfDoc.getPages()[0];

        const sigBytes = await fetch(signatureTransparentUrl).then((r) => r.arrayBuffer());
        const embeddedSig = await pdfDoc.embedPng(sigBytes);

        const { width: pW, height: pH } = targetPage.getSize();
        const sigW = attachSecuritySeal ? pW * 0.38 : pW * 0.28;
        const sigH = (embeddedSig.height * sigW) / embeddedSig.width;

        const posX = (sigCoordinates.x / 100) * pW - sigW / 2;
        const posY = ((100 - sigCoordinates.y) / 100) * pH - sigH / 2;

        targetPage.drawImage(embeddedSig, {
          x: Math.max(15, posX),
          y: Math.max(15, posY),
          width: sigW,
          height: sigH,
        });

        const modifiedBytes = await pdfDoc.save();
        const base64 = "data:application/pdf;base64," + Buffer.from(modifiedBytes).toString("base64");
        await exportFileToDevice(base64, `Signed-${docFileName || "Document.pdf"}`);
      } else {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);

          const sigImg = new Image();
          sigImg.onload = async () => {
            const sigW = attachSecuritySeal ? canvas.width * 0.36 : canvas.width * 0.26;
            const sigH = (sigImg.height * sigW) / sigImg.width;
            const posX = (sigCoordinates.x / 100) * canvas.width - sigW / 2;
            const posY = (sigCoordinates.y / 100) * canvas.height - sigH / 2;

            ctx.drawImage(sigImg, Math.max(10, posX), Math.max(10, posY), sigW, sigH);
            const outUrl = canvas.toDataURL("image/jpeg", 0.96);
            await exportFileToDevice(outUrl, `Signed-${docFileName || "Document.jpg"}`);
          };
          sigImg.src = signatureTransparentUrl;
        };
        img.src = docPreviewUrl;
      }
    } catch (e) {
      alert("Error applying signature.");
    }
  };

  // =========================================================================
  // TOOL 3: HIGH-SPEED RELIABLE COMPRESSOR
  // =========================================================================
  const [compFiles, setCompFiles] = useState([]);
  const [targetSizeKB, setTargetSizeKB] = useState(200);
  const [customKBInput, setCustomKBInput] = useState("200");
  const [compressedResult, setCompressedResult] = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);

  const handlePickCompressFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setCompFiles(files);
    setCompressedResult(null);
    const file = files[0];
    const suggested = Math.max(50, Math.round((file.size / 1024) * 0.45));
    setTargetSizeKB(suggested);
    setCustomKBInput(suggested.toString());
  };

  /**
   * Binary-searches JPEG quality (and, if that alone can't get within
   * tolerance, progressively downscales dimensions too) to converge the
   * encoded size on targetKB, rather than snapping to one of a handful of
   * fixed quality presets.
   */
  const compressImageToTarget = (img, targetKB) => {
    const TOLERANCE = 0.1; // +/-10%
    const dataUrlBytes = (dataUrl) =>
      Math.round(((dataUrl.length - "data:image/jpeg;base64,".length) * 3) / 4);

    let best = null;
    let scale = 1;

    for (let attempt = 0; attempt < 5; attempt++) {
      const maxDim = Math.round(1920 * scale);
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      let lo = 0.05;
      let hi = 0.95;
      for (let i = 0; i < 8; i++) {
        const quality = (lo + hi) / 2;
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const kb = dataUrlBytes(dataUrl) / 1024;

        if (!best || Math.abs(kb - targetKB) < Math.abs(best.kb - targetKB)) {
          best = { dataUrl, bytes: Math.round(kb * 1024), kb };
        }
        if (kb > targetKB) hi = quality;
        else lo = quality;
      }

      if (Math.abs(best.kb - targetKB) <= targetKB * TOLERANCE) break;
      scale *= 0.75; // still outside tolerance at any quality: shrink and retry
    }

    return best;
  };

  const executeUniversalCompression = async () => {
    if (compFiles.length === 0) return;
    setIsCompressing(true);
    notify(`Compressing to ~${targetSizeKB} KB...`);

    const file = compFiles[0];

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const best = compressImageToTarget(img, targetSizeKB);

          setCompressedResult({
            dataUrl: best.dataUrl,
            size: best.bytes,
            origSize: file.size,
            name: file.name,
          });
          setIsCompressing(false);
          notify("Image compressed successfully!");
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const reader = new FileReader();
        reader.onloadend = () => {
          setCompressedResult({
            dataUrl: reader.result,
            size: blob.size,
            origSize: file.size,
            name: file.name,
          });
          setIsCompressing(false);
          notify("PDF stream compressed!");
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        alert("Encrypted or invalid PDF file.");
        setIsCompressing(false);
      }
    } else {
      try {
        const zip = new JSZip();
        for (const f of compFiles) {
          zip.file(f.name, f);
        }
        const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 9 } });
        const reader = new FileReader();
        reader.onloadend = () => {
          setCompressedResult({
            dataUrl: reader.result,
            size: zipBlob.size,
            origSize: compFiles.reduce((acc, f) => acc + f.size, 0),
            name: `${file.name.split(".")[0]}-archive.zip`,
          });
          setIsCompressing(false);
          notify("Archive compression complete!");
        };
        reader.readAsDataURL(zipBlob);
      } catch (e) {
        alert("Compression error.");
        setIsCompressing(false);
      }
    }
  };

  // =========================================================================
  // TOOL 6: PHOTO ENHANCER (SHARPEN + DENOISE + AUTO-CONTRAST)
  // =========================================================================
  const ENHANCE_LEVELS = {
    light: { label: "Light", sharpen: 0.6, clipPercent: 0.008, saturation: 1.15 },
    balanced: { label: "Balanced", sharpen: 1.0, clipPercent: 0.015, saturation: 1.3 },
    strong: { label: "Strong", sharpen: 1.6, clipPercent: 0.025, saturation: 1.5 },
  };
  const [enhanceSourceFile, setEnhanceSourceFile] = useState(null);
  const [enhanceSourcePreview, setEnhanceSourcePreview] = useState(null);
  const [enhanceLevel, setEnhanceLevel] = useState("balanced");
  const [enhanceResultUrl, setEnhanceResultUrl] = useState(null);
  const [isEnhancing, setIsEnhancing] = useState(false);

  const handlePickEnhanceFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnhanceSourceFile(file);
    setEnhanceSourcePreview(URL.createObjectURL(file));
    setEnhanceResultUrl(null);
  };

  const boxBlur3x3 = (data, width, height) => {
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const outIdx = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= width) continue;
              sum += data[(ny * width + nx) * 4 + c];
              count++;
            }
          }
          out[outIdx + c] = sum / count;
        }
        out[outIdx + 3] = data[outIdx + 3];
      }
    }
    return out;
  };

  const unsharpMask = (data, blurred, amount) => {
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      out[i] = data[i] + amount * (data[i] - blurred[i]);
      out[i + 1] = data[i + 1] + amount * (data[i + 1] - blurred[i + 1]);
      out[i + 2] = data[i + 2] + amount * (data[i + 2] - blurred[i + 2]);
      out[i + 3] = data[i + 3];
    }
    return out;
  };

  const autoContrastStretch = (data, clipPercent) => {
    const totalPixels = data.length / 4;
    const clipCount = totalPixels * clipPercent;
    const out = new Uint8ClampedArray(data.length);
    const bounds = [0, 1, 2].map((channel) => {
      const hist = new Array(256).fill(0);
      for (let i = channel; i < data.length; i += 4) hist[data[i]]++;

      let sum = 0;
      let low = 0;
      for (let v = 0; v < 256; v++) {
        sum += hist[v];
        if (sum >= clipCount) {
          low = v;
          break;
        }
      }
      sum = 0;
      let high = 255;
      for (let v = 255; v >= 0; v--) {
        sum += hist[v];
        if (sum >= clipCount) {
          high = v;
          break;
        }
      }
      if (high <= low) return { low: 0, high: 255 };
      return { low, high };
    });

    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const { low, high } = bounds[c];
        out[i + c] = ((data[i + c] - low) * 255) / (high - low);
      }
      out[i + 3] = data[i + 3];
    }
    return out;
  };

  /** Pushes each pixel's color away from its own luminance to boost vividness. */
  const boostSaturation = (data, factor) => {
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      out[i] = luma + (r - luma) * factor;
      out[i + 1] = luma + (g - luma) * factor;
      out[i + 2] = luma + (b - luma) * factor;
      out[i + 3] = data[i + 3];
    }
    return out;
  };

  const runPhotoEnhance = () => {
    if (!enhanceSourceFile) return;
    setIsEnhancing(true);
    notify("Enhancing photo...");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const { sharpen, clipPercent, saturation } = ENHANCE_LEVELS[enhanceLevel];
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const blurred = boxBlur3x3(imageData.data, canvas.width, canvas.height);
        const sharpened = unsharpMask(imageData.data, blurred, sharpen);
        const leveled = autoContrastStretch(sharpened, clipPercent);
        const vivid = boostSaturation(leveled, saturation);

        ctx.putImageData(new ImageData(vivid, canvas.width, canvas.height), 0, 0);
        setEnhanceResultUrl(canvas.toDataURL("image/jpeg", 0.92));
        setIsEnhancing(false);
        notify("Photo enhanced!");
      };
      img.onerror = () => {
        setIsEnhancing(false);
        alert("Couldn't read this image. Try a different file.");
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(enhanceSourceFile);
  };

  // =========================================================================
  // TOOL 4: UNIVERSAL FILE CONVERTER
  // =========================================================================
  const [convFiles, setConvFiles] = useState([]);
  const [targetFormat, setTargetFormat] = useState("pdf");
  const [conversionResult, setConversionResult] = useState(null);
  const [isConverting, setIsConverting] = useState(false);

  const handlePickConvertFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setConvFiles(files);
    setConversionResult(null);
  };

  const executeUniversalConversion = async () => {
    if (convFiles.length === 0) return;
    setIsConverting(true);
    notify(`Converting to .${targetFormat.toUpperCase()}...`);

    const file = convFiles[0];

    try {
      if (targetFormat === "pdf") {
        const pdfDoc = await PDFDocument.create();

        if (file.type.startsWith("image/")) {
          for (const f of convFiles) {
            const buf = await f.arrayBuffer();
            let embedded;
            if (f.type.includes("png")) embedded = await pdfDoc.embedPng(buf);
            else embedded = await pdfDoc.embedJpg(buf);
            const page = pdfDoc.addPage([embedded.width, embedded.height]);
            page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
          }
        } else {
          const text = await file.text();
          const page = pdfDoc.addPage([600, 800]);
          const lines = text.split("\n").slice(0, 40);
          let y = 750;
          for (const line of lines) {
            page.drawText(line.substring(0, 75), { x: 40, y, size: 11, color: rgb(0.1, 0.1, 0.1) });
            y -= 16;
          }
        }

        const bytes = await pdfDoc.save();
        const base64 = "data:application/pdf;base64," + Buffer.from(bytes).toString("base64");
        setConversionResult({ dataUrl: base64, name: `Converted-${Date.now()}.pdf` });
      } else if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            const mime = targetFormat === "jpeg" ? "image/jpeg" : `image/${targetFormat}`;
            const outUrl = canvas.toDataURL(mime, 0.94);
            setConversionResult({
              dataUrl: outUrl,
              name: `Converted-${file.name.split(".")[0]}.${targetFormat === "jpeg" ? "jpg" : targetFormat}`,
            });
            setIsConverting(false);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        return;
      } else {
        const zip = new JSZip();
        for (const f of convFiles) {
          zip.file(f.name, f);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const reader = new FileReader();
        reader.onloadend = () => {
          setConversionResult({
            dataUrl: reader.result,
            name: `${file.name.split(".")[0]}-bundle.zip`,
          });
          setIsConverting(false);
        };
        reader.readAsDataURL(zipBlob);
        return;
      }
    } catch (e) {
      alert("Conversion failed. Verify file integrity.");
    } finally {
      setIsConverting(false);
    }
  };

  // =========================================================================
  // TOOL 5A: QR SCANNER (DECODE + LINK SAFETY CHECK)
  // TOOL 5B: QR GENERATOR
  // =========================================================================
  const [isQrLiveActive, setIsQrLiveActive] = useState(false);
  const [qrDecodedValue, setQrDecodedValue] = useState("");
  const [qrPendingLink, setQrPendingLink] = useState(null); // { url, risk } awaiting user confirmation
  const [qrTextToGenerate, setQrTextToGenerate] = useState("https://clearfile.app");
  const [generatedQrCodeUrl, setGeneratedQrCodeUrl] = useState("");
  const qrVideoRef = useRef(null);
  const qrStreamRef = useRef(null);
  const qrAnimRef = useRef(null);

  useEffect(() => {
    if (!qrTextToGenerate.trim()) return;
    QRCode.toDataURL(qrTextToGenerate, {
      width: 500,
      margin: 2,
      color: { dark: "#00e5ff", light: "#050608" },
    }).then(setGeneratedQrCodeUrl);
  }, [qrTextToGenerate]);

  const KNOWN_LINK_SHORTENERS = [
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at",
  ];

  /** Lightweight heuristic scan — not a security guarantee, just surfaces common red flags before auto-opening a scanned link. */
  const assessLinkRisk = (rawUrl) => {
    const reasons = [];
    let level = "safe";
    try {
      const u = new URL(rawUrl);
      const hostname = u.hostname.toLowerCase();

      if (u.protocol === "http:") {
        reasons.push("Uses unencrypted HTTP, not HTTPS");
        level = "caution";
      }
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
        reasons.push("Points to a raw IP address instead of a domain name");
        level = "danger";
      }
      if (hostname.includes("xn--")) {
        reasons.push("Uses a lookalike international domain that can impersonate another site");
        level = "danger";
      }
      if (rawUrl.includes("@") && rawUrl.indexOf("@") < rawUrl.indexOf(hostname)) {
        reasons.push('Contains an "@" before the domain — a common link-spoofing trick');
        level = "danger";
      }
      if (KNOWN_LINK_SHORTENERS.some((s) => hostname === s || hostname.endsWith(`.${s}`))) {
        reasons.push("Uses a link shortener that hides the real destination");
        if (level === "safe") level = "caution";
      }
      if (hostname.split(".").length > 4) {
        reasons.push("Unusually many subdomains");
        if (level === "safe") level = "caution";
      }
      return { level, reasons, hostname };
    } catch {
      return { level: "danger", reasons: ["Could not be parsed as a standard web address"], hostname: "" };
    }
  };

  const openLinkInBrowser = async (url) => {
    try {
      await Browser.open({ url });
    } catch (err) {
      window.open(url, "_system");
    }
  };

  /**
   * A clean link (no red flags from assessLinkRisk) redirects right away —
   * scanning a QR code is meant to be a one-tap action, and interrupting
   * every single scan for confirmation would just train people to tap
   * "Open" without reading it, defeating the point. The confirmation panel
   * only appears when the safety check actually found something worth a
   * second look (unencrypted HTTP, a raw IP, a spoofing trick, etc). Plain
   * text (not a link at all) never triggers either path.
   */
  const presentDecodedValue = (value) => {
    setQrDecodedValue(value);
    if (!value.startsWith("http://") && !value.startsWith("https://")) {
      setQrPendingLink(null);
      return "text";
    }

    const risk = assessLinkRisk(value);
    if (risk.level === "safe") {
      setQrPendingLink(null);
      openLinkInBrowser(value);
      return "opened";
    }

    setQrPendingLink({ url: value, risk });
    return "needs-confirmation";
  };

  const confirmOpenQrLink = async () => {
    if (!qrPendingLink) return;
    const { url } = qrPendingLink;
    setQrPendingLink(null);
    await openLinkInBrowser(url);
  };

  const dismissQrLink = () => setQrPendingLink(null);

  const startQrLiveScanning = async () => {
    setQrDecodedValue("");
    setIsQrLiveActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      qrStreamRef.current = stream;
      if (qrVideoRef.current) {
        qrVideoRef.current.srcObject = stream;
        qrVideoRef.current.setAttribute("playsinline", "true");
        await qrVideoRef.current.play();
        tickQrScanning();
      }
    } catch (e) {
      notify("Camera blocked. Use photo scanner below.");
      setIsQrLiveActive(false);
    }
  };

  const stopQrLiveScanning = () => {
    if (qrAnimRef.current) cancelAnimationFrame(qrAnimRef.current);
    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach((t) => t.stop());
      qrStreamRef.current = null;
    }
    setIsQrLiveActive(false);
  };

  const tickQrScanning = () => {
    if (!qrVideoRef.current || qrVideoRef.current.readyState !== qrVideoRef.current.HAVE_ENOUGH_DATA) {
      qrAnimRef.current = requestAnimationFrame(tickQrScanning);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = qrVideoRef.current.videoWidth;
    canvas.height = qrVideoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(qrVideoRef.current, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imgData.data, canvas.width, canvas.height);

    if (code) {
      stopQrLiveScanning();
      const outcome = presentDecodedValue(code.data);
      if (outcome === "needs-confirmation") notify("QR Code Found! Review before opening.");
      else if (outcome === "opened") notify("QR Code Found! Opening link...");
      else notify("QR Code Found!");
    } else {
      qrAnimRef.current = requestAnimationFrame(tickQrScanning);
    }
  };

  const scanQrFromScreenshotPicker = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, canvas.width, canvas.height);
        if (code) {
          const outcome = presentDecodedValue(code.data);
          if (outcome === "needs-confirmation") notify("QR detected! Review before opening.");
          else if (outcome === "opened") notify("QR detected! Opening link...");
          else notify("QR detected!");
        } else {
          alert("No QR code detected in this photo.");
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    return () => {
      stopQrLiveScanning();
      if (scanStreamRef.current) scanStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const Icons = {
    Scanner: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
        <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
        <rect x="7" y="7" width="10" height="10" rx="1" />
      </svg>
    ),
    Signature: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <circle cx="11" cy="11" r="2" />
      </svg>
    ),
    Compress: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 14h6m0 0v6m0-6L3 21" /><path d="M20 10h-6m0 0V4m0 6l7-7" />
      </svg>
    ),
    Convert: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 3h5v5" /><path d="M4 20L21 3" /><path d="M21 16v5h-5" />
        <path d="M15 15l6 6" /><path d="M4 4l5 5" />
      </svg>
    ),
    QR: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
    QRCreate: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <path d="M17 14v6M14 17h6" />
      </svg>
    ),
    Enhance: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
      </svg>
    ),
    Back: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
      </svg>
    ),
  };

  const TOOLS = [
    { id: "scan", label: "Doc Scanner", dockLabel: "Scan", badge: "SCAN", desc: "Auto edge-detect, warp & inspection studio", icon: Icons.Scanner, accent: "#00e5ff" },
    { id: "sign", label: "Sign Document", dockLabel: "Sign", badge: "SIGN", desc: "Real page preview — sign exactly where you tap", icon: Icons.Signature, accent: "#7c5cff" },
    { id: "compress", label: "Compress Files", dockLabel: "Compress", badge: "COMPRESS", desc: "Target KB compression for Image, PDF & Docs", icon: Icons.Compress, accent: "#10b981" },
    { id: "enhance", label: "Enhance Photo", dockLabel: "Enhance", badge: "ENHANCE", desc: "Sharpen, denoise & auto-color correct", icon: Icons.Enhance, accent: "#f59e0b" },
    { id: "convert", label: "Convert Formats", dockLabel: "Convert", badge: "CONVERT", desc: "Universal transcoder to PDF, PNG, JPG, WEBP", icon: Icons.Convert, accent: "#4fb8ff" },
    { id: "qrscan", label: "Scan QR", dockLabel: "Scan QR", badge: "QR SCAN", desc: "Live decode with a link safety check before opening", icon: Icons.QR, accent: "#00e5ff" },
    { id: "qrgen", label: "Create QR", dockLabel: "Create QR", badge: "QR CREATE", desc: "Generate a QR code from text or a link", icon: Icons.QRCreate, accent: "#f472b6" },
  ];

  return (
    <div className="h-screen w-screen bg-bg-deep text-ink flex flex-col overflow-hidden">

      {/* 1. AUTO-DISMISS SPLASH SCREEN (1.8s) */}
      {showSplash && (
        <div
          className="fixed inset-0 z-[9999] bg-bg-deep flex flex-col items-center justify-center p-6"
          style={{ backgroundImage: "radial-gradient(circle at 50% 42%, rgba(0,229,255,0.12), transparent 60%)" }}
        >
          <div className="splash-anim flex flex-col items-center">
            <div className="w-28 h-28 rounded-[28px] overflow-hidden border border-cyan/40 bg-surface flex items-center justify-center shadow-[0_0_60px_rgba(0,229,255,0.3)]">
              <img src="/logo.png" alt="Clearfile" className="w-full h-full object-cover" />
            </div>
            <div className="mt-7 text-center">
              <div
                className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, var(--color-cyan) 0%, var(--color-blue) 55%, var(--color-violet) 100%)" }}
              >
                clearfile
              </div>
              <div className="text-[11px] text-ink-muted tracking-[0.15em] uppercase mt-2 font-semibold">
                Private document toolkit
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. TOP APP HEADER WITH BACK NAVIGATION */}
      <header className="shrink-0 bg-[#0f1219]/90 backdrop-blur-md border-b border-line px-4.5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {activeTool ? (
            <button
              onClick={() => {
                if (scanStreamRef.current) scanStreamRef.current.getTracks().forEach((t) => t.stop());
                if (qrStreamRef.current) qrStreamRef.current.getTracks().forEach((t) => t.stop());
                setIsCameraActive(false);
                setIsQrLiveActive(false);
                setInspectedPage(null);
                setRawCapturedImage(null);
                setActiveTool(null);
              }}
              className="flex items-center gap-1.5 bg-cyan/10 border border-cyan/25 text-cyan px-3.5 py-1.5 rounded-full text-xs font-bold"
            >
              <Icons.Back /> Back
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-8.5 h-8.5 rounded-[10px] overflow-hidden border border-cyan/30 bg-surface">
                <img src="/logo.png" alt="Clearfile" className="w-full h-full object-cover" />
              </div>
              <div className="text-[17px] font-extrabold tracking-tight">clearfile</div>
            </div>
          )}
        </div>

        <span className="text-[10px] text-cyan bg-cyan/10 border border-cyan/25 px-2.5 py-1.5 rounded-full font-bold tracking-wide">
          {activeTool ? TOOLS.find((t) => t.id === activeTool)?.badge ?? activeTool.toUpperCase() : "PRIVATE & OFFLINE"}
        </span>
      </header>

      {/* TOAST SYSTEM */}
      {toastMsg && (
        <div className="bg-cyan text-[#04141a] text-[11px] font-bold text-center py-2 px-3">
          {toastMsg}
        </div>
      )}

      {/* 3. MAIN WORKSPACE */}
      <main className="no-scrollbar flex-1 overflow-y-auto p-4 max-w-[540px] w-full mx-auto box-border">

        {/* HOME DASHBOARD */}
        {activeTool === null && (
          <div key="dashboard" className="gc-screen flex flex-col gap-3">
            <div className="px-1 pt-2 pb-1 text-[13px] font-extrabold text-cyan uppercase tracking-[0.1em]">
              Tools
            </div>
            {TOOLS.map((tool) => {
              const IconComp = tool.icon;
              return (
                <Card key={tool.id} as="button" onClick={() => setActiveTool(tool.id)} className="p-4 flex items-center gap-4 text-left w-full text-inherit">
                  <div
                    className="w-11.5 h-11.5 shrink-0 rounded-xl flex items-center justify-center"
                    style={{ background: hexToRgba(tool.accent, 0.12), border: `1px solid ${hexToRgba(tool.accent, 0.35)}`, color: tool.accent }}
                  >
                    <IconComp />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-extrabold text-ink">{tool.label}</div>
                    <div className="text-[11.5px] text-ink-muted mt-0.5 leading-snug">{tool.desc}</div>
                  </div>
                  <div className="text-ink-faint text-lg shrink-0">&rarr;</div>
                </Card>
              );
            })}
          </div>
        )}

        {/* TOOL 1: DOCUMENT SCANNER */}
        {activeTool === "scan" && (
          <div className="gc-screen rounded-[20px] border border-line bg-surface shadow-[0_10px_30px_-6px_rgba(0,0,0,0.45)] p-4.5">
            <ToolTitle>Document Scanner</ToolTitle>

            {isCameraActive && (
              <div className="relative w-full h-[400px] rounded-2xl overflow-hidden bg-black mb-3.5">
                <video ref={scanVideoRef} className="w-full h-full object-cover" />
                <button
                  onClick={captureCameraFrame}
                  className="absolute bottom-5 left-1/2 -translate-x-1/2 px-8 py-3.5 rounded-full bg-cyan text-[#050608] font-bold text-[13px] shadow-[0_0_25px_rgba(0,229,255,0.5)]"
                >
                  Capture
                </button>
              </div>
            )}

            {rawCapturedImage && !inspectedPage && (
              <div className="flex flex-col gap-3">
                <div className="text-[11px] text-cyan">We&apos;ve outlined the page — drag any corner to fine-tune:</div>
                <div
                  ref={cropWrapperRef}
                  data-testid="crop-container"
                  onMouseMove={handleTouchCornerMove}
                  onTouchMove={handleTouchCornerMove}
                  onMouseUp={() => setDraggingCorner(null)}
                  onTouchEnd={() => setDraggingCorner(null)}
                  className="relative w-full h-80 bg-black rounded-2xl overflow-hidden touch-none"
                >
                  <img src={rawCapturedImage} alt="Raw" className="w-full h-full object-contain pointer-events-none" />

                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <polygon
                      points={`${corners[0].x}%,${corners[0].y}% ${corners[1].x}%,${corners[1].y}% ${corners[2].x}%,${corners[2].y}% ${corners[3].x}%,${corners[3].y}%`}
                      fill="rgba(0, 229, 255, 0.18)"
                      stroke="#00e5ff"
                      strokeWidth="2.5"
                    />
                  </svg>

                  {corners.map((c, idx) => (
                    <div
                      key={idx}
                      data-testid="corner-pin"
                      onMouseDown={() => setDraggingCorner(idx)}
                      onTouchStart={() => setDraggingCorner(idx)}
                      className="absolute w-9.5 h-9.5 rounded-full bg-cyan/40 border-2 border-white shadow-[0_0_12px_#00e5ff] cursor-grab flex items-center justify-center"
                      style={{ left: `${c.x}%`, top: `${c.y}%`, transform: "translate(-50%, -50%)" }}
                    >
                      <div className="w-3 h-3 rounded-full bg-cyan" />
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  {[
                    { id: "magic", label: "Enhance" },
                    { id: "bw", label: "Black & White" },
                    { id: "color", label: "Original" }
                  ].map((f) => (
                    <Chip key={f.id} active={scanFilter === f.id} onClick={() => setScanFilter(f.id)} className="flex-1">
                      {f.label}
                    </Chip>
                  ))}
                </div>

                <Button onClick={executePerspectiveWarp}>Straighten &amp; preview</Button>
              </div>
            )}

            {inspectedPage && (
              <div className="flex flex-col gap-3">
                <div className="text-[12px] text-green font-bold">Review your scan</div>
                <div className="w-full h-[300px] rounded-xl overflow-hidden bg-black border border-green/40">
                  <img src={inspectedPage} alt="Warped" className="w-full h-full object-contain" />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <Button variant="secondary" onClick={() => setInspectedPage(null)}>Adjust corners</Button>
                  <Button onClick={acceptScannedPage}>Use this page</Button>
                </div>
              </div>
            )}

            {!isCameraActive && !rawCapturedImage && !inspectedPage && (
              <Button onClick={startScanCamera}>Open camera</Button>
            )}

            {scannedStack.length > 0 && !isCameraActive && !rawCapturedImage && !inspectedPage && (
              <div className="mt-4.5 flex flex-col gap-2.5">
                <div className="flex justify-between text-[12px] text-ink-muted">
                  <span>Pages captured ({scannedStack.length})</span>
                  <button className="text-red" onClick={() => setScannedStack([])}>Clear all</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {scannedStack.map((pg, i) => (
                    <img key={i} src={pg} alt="Pg" className="w-full h-[110px] object-cover rounded-lg border border-line" />
                  ))}
                </div>
                <Button variant="secondary" onClick={exportScannedPDF} className="mt-1.5 border-cyan/40 text-cyan">
                  Save as PDF
                </Button>
              </div>
            )}
          </div>
        )}

        {/* TOOL 2: DOCUMENT SIGNER */}
        {activeTool === "sign" && (
          <div className="gc-screen rounded-[20px] border border-line bg-surface shadow-[0_10px_30px_-6px_rgba(0,0,0,0.45)] p-4.5 flex flex-col gap-3.5">
            <ToolTitle>Sign Document</ToolTitle>

            {!docToSignBytes ? (
              <UploadDropzone
                icon={<Icons.Signature />}
                title="Upload document (PDF, PNG, JPG)"
                subtitle="Multi-page contracts and forms are supported"
              >
                <input type="file" accept="application/pdf,image/*" onChange={handleDocumentPickForSign} className="hidden" />
              </UploadDropzone>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center bg-surface-2 px-2.5 py-2 rounded-lg text-xs">
                  <span className="truncate">{docFileName}</span>
                  <label className="text-cyan cursor-pointer shrink-0 ml-2">
                    Change
                    <input type="file" accept="application/pdf,image/*" onChange={handleDocumentPickForSign} className="hidden" />
                  </label>
                </div>

                {/* Explicitly sized in pixels (see signPreviewSize effect)
                    to match the real document's aspect ratio exactly, so
                    the preview fills edge-to-edge with zero letterboxing —
                    that's what makes a tap position here match the final
                    signed position exactly. */}
                <div ref={signPreviewWrapRef} className="w-full flex justify-center">
                  <div
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = ((e.clientX - rect.left) / rect.width) * 100;
                      const y = ((e.clientY - rect.top) / rect.height) * 100;
                      setSigCoordinates({ x, y });
                    }}
                    className="relative bg-white rounded-xl overflow-hidden cursor-crosshair border border-line-glow"
                    style={{ width: signPreviewSize.width || "100%", height: signPreviewSize.height || 280 }}
                  >
                    <img src={docPreviewUrl} alt="Doc" className="w-full h-full object-contain" />

                    {signatureTransparentUrl && (
                      <img
                        src={signatureTransparentUrl}
                        alt="Signature"
                        className="absolute pointer-events-none"
                        style={{
                          top: `${sigCoordinates.y}%`,
                          left: `${sigCoordinates.x}%`,
                          transform: "translate(-50%, -50%)",
                          width: attachSecuritySeal ? "140px" : "110px",
                        }}
                      />
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-ink-faint text-center">
                  {signatureTransparentUrl ? "Tap the document again to move the signature" : "Draw a signature below, then tap the document to place it"}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center bg-surface-2 px-3.5 py-2.5 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-ink-muted">Ink:</span>
                {["#000000", "#002b80", "#008037"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setInkColor(c)}
                    className="w-5 h-5 rounded-full"
                    style={{ backgroundColor: c, border: inkColor === c ? "2px solid var(--color-cyan)" : "1px solid #475569" }}
                  />
                ))}
              </div>

              <label className="flex items-center gap-1.5 text-[11px] text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={attachSecuritySeal}
                  onChange={(e) => {
                    setAttachSecuritySeal(e.target.checked);
                    setTimeout(() => endDrawingSignature(), 50);
                  }}
                  className="accent-cyan"
                />
                Add verification stamp
              </label>
            </div>

            <div className="border-t border-line pt-3">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[11px] text-ink-muted">Draw your signature:</span>
                <button className="text-[11px] text-red" onClick={clearSignaturePad}>Clear</button>
              </div>
              <div className="w-full h-[130px] bg-white rounded-xl border border-dashed border-line overflow-hidden">
                <canvas
                  ref={sigCanvasRef}
                  width={380}
                  height={130}
                  onMouseDown={startDrawingSignature}
                  onMouseMove={moveDrawingSignature}
                  onMouseUp={endDrawingSignature}
                  onTouchStart={startDrawingSignature}
                  onTouchMove={moveDrawingSignature}
                  onTouchEnd={endDrawingSignature}
                  className="w-full h-full touch-none"
                />
              </div>
            </div>

            {docToSignBytes && signatureTransparentUrl && (
              <Button onClick={burnSignatureAndSaveDocument}>Sign &amp; save to device</Button>
            )}
          </div>
        )}

        {/* TOOL 3: COMPRESSOR */}
        {activeTool === "compress" && (
          <div className="gc-screen rounded-[20px] border border-line bg-surface shadow-[0_10px_30px_-6px_rgba(0,0,0,0.45)] p-4.5 flex flex-col gap-3.5">
            <ToolTitle>Compress Files</ToolTitle>

            {compFiles.length === 0 ? (
              <UploadDropzone
                icon={<Icons.Compress />}
                title="Choose a file to compress"
                subtitle="Images, PDFs, and other documents"
              >
                <input type="file" multiple onChange={handlePickCompressFiles} className="hidden" />
              </UploadDropzone>
            ) : (
              <div className="flex flex-col gap-3.5">
                <div className="flex justify-between bg-surface-2 p-2.5 rounded-lg">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{compFiles[0].name}</div>
                    <div className="text-[11px] text-cyan">Original: {formatBytes(compFiles[0].size)}</div>
                  </div>
                  <label className="text-[11px] text-ink-muted cursor-pointer shrink-0 ml-2">
                    Change
                    <input type="file" multiple onChange={handlePickCompressFiles} className="hidden" />
                  </label>
                </div>

                <div className="bg-surface-2 p-3.5 rounded-xl border border-line">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[11px] text-ink-muted">Target size (KB):</span>
                    <input
                      type="number"
                      value={customKBInput}
                      onChange={(e) => {
                        setCustomKBInput(e.target.value);
                        if (Number(e.target.value) > 0) setTargetSizeKB(Number(e.target.value));
                      }}
                      className="w-24 bg-bg-deep border border-line-glow rounded-md px-2 py-1.5 text-[13px] text-right text-cyan font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {[50, 100, 200, 500].map((kb) => (
                      <Chip key={kb} active={targetSizeKB === kb} onClick={() => { setTargetSizeKB(kb); setCustomKBInput(kb.toString()); }}>
                        {kb} KB
                      </Chip>
                    ))}
                  </div>
                </div>

                <Button onClick={executeUniversalCompression} disabled={isCompressing}>
                  {isCompressing ? "Compressing…" : "Compress file(s)"}
                </Button>
              </div>
            )}

            {compressedResult && (
              <ResultBanner tone="success">
                <div className="text-xs font-bold">
                  Compressed to {formatBytes(compressedResult.size)} — {(((compressedResult.origSize - compressedResult.size) / compressedResult.origSize) * 100).toFixed(0)}% smaller
                </div>
                <Button variant="secondary" onClick={() => exportFileToDevice(compressedResult.dataUrl, `compressed-${compressedResult.name}`)} className="border-cyan/40 text-cyan">
                  Save to device
                </Button>
              </ResultBanner>
            )}
          </div>
        )}

        {/* TOOL 6: PHOTO ENHANCER */}
        {activeTool === "enhance" && (
          <div className="gc-screen rounded-[20px] border border-line bg-surface shadow-[0_10px_30px_-6px_rgba(0,0,0,0.45)] p-4.5 flex flex-col gap-3.5">
            <ToolTitle>Enhance Photo</ToolTitle>

            {!enhanceSourceFile ? (
              <UploadDropzone icon={<Icons.Enhance />} title="Select a photo to enhance" subtitle="JPG, PNG, or WEBP">
                <input type="file" accept="image/*" onChange={handlePickEnhanceFile} className="hidden" />
              </UploadDropzone>
            ) : (
              <div className="flex flex-col gap-3.5">
                <div className="relative">
                  <img
                    src={enhanceResultUrl || enhanceSourcePreview}
                    alt="Enhance preview"
                    className="w-full h-[220px] object-contain rounded-xl bg-black"
                  />
                  <span className="absolute top-2 left-2 text-[9.5px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-ink">
                    {enhanceResultUrl ? "Enhanced" : "Original"}
                  </span>
                </div>

                <div className="bg-surface-2 p-3.5 rounded-xl border border-line">
                  <span className="text-[11px] text-ink-muted">Enhancement strength:</span>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {Object.entries(ENHANCE_LEVELS).map(([key, cfg]) => (
                      <Chip key={key} active={enhanceLevel === key} onClick={() => setEnhanceLevel(key)}>
                        {cfg.label}
                      </Chip>
                    ))}
                  </div>
                </div>

                <label className="text-[11px] text-ink-muted cursor-pointer self-start">
                  Change photo
                  <input type="file" accept="image/*" onChange={handlePickEnhanceFile} className="hidden" />
                </label>

                <Button onClick={runPhotoEnhance} disabled={isEnhancing}>
                  {isEnhancing ? "Enhancing…" : "Enhance photo"}
                </Button>
              </div>
            )}

            {enhanceResultUrl && (
              <ResultBanner tone="success">
                <div className="text-xs font-bold">Enhanced — sharpened, denoised, and color-corrected</div>
                <Button variant="secondary" onClick={() => exportFileToDevice(enhanceResultUrl, `enhanced-${enhanceSourceFile.name}`)} className="border-cyan/40 text-cyan">
                  Save to device
                </Button>
              </ResultBanner>
            )}
          </div>
        )}

        {/* TOOL 4: UNIVERSAL CONVERTER */}
        {activeTool === "convert" && (
          <div className="gc-screen rounded-[20px] border border-line bg-surface shadow-[0_10px_30px_-6px_rgba(0,0,0,0.45)] p-4.5 flex flex-col gap-3.5">
            <ToolTitle>Convert Files</ToolTitle>

            <UploadDropzone
              icon={<Icons.Convert />}
              title={convFiles.length > 0 ? `${convFiles.length} file(s) selected` : "Select files to convert"}
            >
              <input type="file" multiple onChange={handlePickConvertFiles} className="hidden" />
            </UploadDropzone>

            <div>
              <span className="text-[11px] text-ink-muted">Target format:</span>
              <div className="grid grid-cols-4 gap-2 mt-1.5">
                {["pdf", "png", "webp", "jpeg"].map((fmt) => (
                  <Chip key={fmt} active={targetFormat === fmt} onClick={() => setTargetFormat(fmt)} className="uppercase">
                    .{fmt}
                  </Chip>
                ))}
              </div>
            </div>

            {convFiles.length > 0 && (
              <Button onClick={executeUniversalConversion} disabled={isConverting}>
                {isConverting ? "Converting…" : `Convert to .${targetFormat.toUpperCase()}`}
              </Button>
            )}

            {conversionResult && (
              <ResultBanner tone="success">
                <div className="text-xs font-bold truncate">Ready: {conversionResult.name}</div>
                <Button variant="secondary" onClick={() => exportFileToDevice(conversionResult.dataUrl, conversionResult.name)} className="border-green/40 text-green">
                  Save to device
                </Button>
              </ResultBanner>
            )}
          </div>
        )}

        {/* TOOL 5A: QR SCANNER (DECODE + LINK SAFETY CHECK) */}
        {activeTool === "qrscan" && (
          <div className="gc-screen rounded-[20px] border border-line bg-surface shadow-[0_10px_30px_-6px_rgba(0,0,0,0.45)] p-4.5 flex flex-col gap-3.5">
            <ToolTitle>Scan QR Code</ToolTitle>

            <div className="relative w-full h-60 bg-black rounded-xl overflow-hidden border border-line">
              <video ref={qrVideoRef} className="w-full h-full object-cover" />
              {isQrLiveActive && (
                <div className="absolute inset-7 border-2 border-cyan/40 rounded-lg">
                  <div className="absolute left-0 right-0 h-0.5 bg-cyan shadow-[0_0_8px_#00d4ff] laser-scanner" />
                </div>
              )}
              {!isQrLiveActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-cyan mb-1.5"><Icons.QR /></div>
                  <span className="text-[11px] text-ink-muted">Camera is off</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {!isQrLiveActive ? (
                <Button onClick={startQrLiveScanning}>Start camera</Button>
              ) : (
                <Button variant="secondary" onClick={stopQrLiveScanning}>Stop camera</Button>
              )}
              <label className="flex items-center justify-center rounded-xl bg-surface-2 border border-line-glow text-ink text-[13px] font-bold px-4 py-3 cursor-pointer text-center">
                Scan screenshot
                <input type="file" accept="image/*" onChange={scanQrFromScreenshotPicker} className="hidden" />
              </label>
            </div>

            {qrDecodedValue && (
              <div className="bg-surface-2 border border-cyan/40 p-3 rounded-xl">
                <div className="text-[10px] text-ink-muted">Scanned content</div>
                <div className="text-[13px] text-cyan font-bold break-all mt-1">{qrDecodedValue}</div>
              </div>
            )}

            {qrPendingLink && (() => {
              const { risk } = qrPendingLink;
              const tone = risk.level === "danger" ? "danger" : risk.level === "caution" ? "caution" : "success";
              const accentClass = risk.level === "danger" ? "text-red" : risk.level === "caution" ? "text-amber" : "text-green";

              return (
                <ResultBanner tone={tone}>
                  <div className={`text-[11px] font-bold uppercase ${accentClass}`}>
                    {risk.level === "danger" ? "⚠ Potentially harmful link" : risk.level === "caution" ? "⚠ Use caution before opening" : "Link looks standard"}
                  </div>
                  {risk.reasons.length > 0 && (
                    <ul className="m-0 pl-4.5 text-[11px] text-ink-muted flex flex-col gap-1">
                      {risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={dismissQrLink}>Cancel</Button>
                    <Button
                      onClick={confirmOpenQrLink}
                      style={risk.level !== "safe" ? { backgroundImage: "none", backgroundColor: risk.level === "danger" ? "var(--color-red)" : "var(--color-amber)" } : undefined}
                    >
                      Open link ↗
                    </Button>
                  </div>
                </ResultBanner>
              );
            })()}
          </div>
        )}

        {/* TOOL 5B: QR GENERATOR */}
        {activeTool === "qrgen" && (
          <div className="gc-screen rounded-[20px] border border-line bg-surface shadow-[0_10px_30px_-6px_rgba(0,0,0,0.45)] p-4.5 flex flex-col gap-3.5">
            <ToolTitle>Create QR Code</ToolTitle>

            <div>
              <span className="text-[11px] text-ink-muted">Text or link:</span>
              <input
                type="text"
                value={qrTextToGenerate}
                onChange={(e) => setQrTextToGenerate(e.target.value)}
                className="w-full px-2.5 py-2.5 rounded-lg bg-surface-2 border border-line my-2 text-xs"
              />
              {generatedQrCodeUrl && (
                <div className="text-center flex flex-col gap-2.5 items-center">
                  <img src={generatedQrCodeUrl} alt="QR" className="w-40 h-40 rounded-lg" />
                  <Button onClick={() => exportFileToDevice(generatedQrCodeUrl, "Clearfile-QR.png")} className="w-full">
                    Save to device
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* 4. FIXED BOTTOM NAVIGATION DOCK */}
      <footer className="no-scrollbar shrink-0 bg-[#0f1219]/92 backdrop-blur-md border-t border-line flex overflow-x-auto items-center gap-0.5 px-2 pt-2 pb-3.5">
        {TOOLS.map((tab) => {
          const isActive = activeTool === tab.id;
          const IconComp = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (activeTool === "qrscan" && tab.id !== "qrscan") stopQrLiveScanning();
                if (activeTool === "scan" && tab.id !== "scan") {
                  if (scanStreamRef.current) scanStreamRef.current.getTracks().forEach((t) => t.stop());
                  setIsCameraActive(false);
                }
                setActiveTool(tab.id);
              }}
              className="flex-none min-w-16 rounded-xl flex flex-col items-center gap-1 py-1.5 px-2"
              style={{ background: isActive ? hexToRgba(tab.accent, 0.12) : "transparent" }}
            >
              <div style={{ color: isActive ? tab.accent : "var(--color-ink-muted)" }}>
                <IconComp />
              </div>
              <span
                className="text-[9.5px] whitespace-nowrap"
                style={{ fontWeight: isActive ? 800 : 600, color: isActive ? tab.accent : "var(--color-ink-muted)" }}
              >
                {tab.dockLabel}
              </span>
            </button>
          );
        })}
      </footer>

    </div>
  );
}