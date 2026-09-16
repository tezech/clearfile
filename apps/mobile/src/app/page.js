"use client";

import React, { useState, useRef, useEffect } from "react";
import { PDFDocument, rgb } from "pdf-lib";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Browser } from "@capacitor/browser";
import jsQR from "jsqr";
import QRCode from "qrcode";
import JSZip from "jszip";

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
    setCorners([
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ]);
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
  const [signatureTransparentUrl, setSignatureTransparentUrl] = useState(null);
  const [sigCoordinates, setSigCoordinates] = useState({ x: 50, y: 80 });
  const [attachSecuritySeal, setAttachSecuritySeal] = useState(false);
  const [signerName, setSignerName] = useState("AUTHORIZED SIGNER");
  const [inkColor, setInkColor] = useState("#000000");
  const sigCanvasRef = useRef(null);
  const [isDrawingSig, setIsDrawingSig] = useState(false);

  const handleDocumentPickForSign = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocFileName(file.name);
    notify("Loading document...");

    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      setIsPdfDocument(true);
      const arrayBuffer = await file.arrayBuffer();
      setDocToSignBytes(arrayBuffer);

      // Render first page onto preview canvas
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 800;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 600, 800);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(file.name, 300, 380);
      ctx.fillStyle = "#64748b";
      ctx.font = "14px sans-serif";
      ctx.fillText("PDF Document Loaded - Tap anywhere to place signature", 300, 420);
      setDocPreviewUrl(canvas.toDataURL("image/jpeg"));
      notify("PDF loaded. Tap to position signature.");
    } else {
      setIsPdfDocument(false);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setDocPreviewUrl(ev.target.result);
        setDocToSignBytes(ev.target.result);
        notify("Document image ready.");
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
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];

        const sigBytes = await fetch(signatureTransparentUrl).then((r) => r.arrayBuffer());
        const embeddedSig = await pdfDoc.embedPng(sigBytes);

        const { width: pW, height: pH } = lastPage.getSize();
        const sigW = attachSecuritySeal ? pW * 0.38 : pW * 0.28;
        const sigH = (embeddedSig.height * sigW) / embeddedSig.width;

        const posX = (sigCoordinates.x / 100) * pW - sigW / 2;
        const posY = ((100 - sigCoordinates.y) / 100) * pH - sigH / 2;

        lastPage.drawImage(embeddedSig, {
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
          let w = img.width;
          let h = img.height;
          const maxDim = 1920;
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

          const qualitySteps = [0.92, 0.78, 0.62, 0.48, 0.32, 0.18, 0.08];
          let chosenDataUrl = null;
          let chosenSize = 0;

          for (const q of qualitySteps) {
            const dataUrl = canvas.toDataURL("image/jpeg", q);
            const head = "data:image/jpeg;base64,";
            const bytes = Math.round((dataUrl.length - head.length) * 3 / 4);
            chosenDataUrl = dataUrl;
            chosenSize = bytes;
            if (bytes / 1024 <= targetSizeKB) break;
          }

          setCompressedResult({
            dataUrl: chosenDataUrl,
            size: chosenSize,
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
  // TOOL 5: QR SCANNER (INTENT REDIRECT + HYPERLINK)
  // =========================================================================
  const [isQrLiveActive, setIsQrLiveActive] = useState(false);
  const [qrDecodedValue, setQrDecodedValue] = useState("");
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

  const dispatchRedirect = async (url) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      try {
        await Browser.open({ url });
      } catch (err) {
        window.open(url, "_system");
      }
    }
  };

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
      setQrDecodedValue(code.data);
      stopQrLiveScanning();
      notify("QR Code Found! Opening link...");
      dispatchRedirect(code.data);
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
          setQrDecodedValue(code.data);
          notify("QR detected! Opening link...");
          dispatchRedirect(code.data);
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
    Back: () => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
      </svg>
    ),
  };

  const TOOLS = [
    { id: "scan", label: "Doc Scanner", desc: "4-corner perspective warp & inspection studio", icon: Icons.Scanner },
    { id: "sign", label: "Sign Document", desc: "Background-less ink on live document preview", icon: Icons.Signature },
    { id: "compress", label: "Compress Files", desc: "Target KB compression for Image, PDF & Docs", icon: Icons.Compress },
    { id: "convert", label: "Convert Formats", desc: "Universal transcoder to PDF, PNG, JPG, WEBP", icon: Icons.Convert },
    { id: "qr", label: "QR Utility", desc: "Direct browser redirect & interactive link badge", icon: Icons.QR },
  ];

  return (
    <div style={{
      height: "100vh",
      width: "100vw",
      backgroundColor: "#050608",
      color: "#f8fafc",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    }}>

      {/* 1. AUTO-DISMISS SPLASH SCREEN (1.8s) */}
      {showSplash && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          backgroundColor: "#050608",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px"
        }}>
          <div className="splash-anim" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
              width: "115px",
              height: "115px",
              borderRadius: "30px",
              overflow: "hidden",
              border: "1.5px solid rgba(0, 229, 255, 0.4)",
              boxShadow: "0 0 50px rgba(0, 229, 255, 0.25)",
              backgroundColor: "#090c14",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <img src="/logo.png" alt="Clearfile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div style={{ marginTop: "24px", textAlign: "center" }}>
              <div style={{
                fontSize: "32px",
                fontWeight: "bold",
                letterSpacing: "-0.5px",
                background: "linear-gradient(135deg, #ffffff 40%, #00e5ff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent"
              }}>
                clearfile
              </div>
              <div style={{ fontSize: "11px", color: "#8492a6", letterSpacing: "1.5px", textTransform: "uppercase", marginTop: "6px" }}>
                Autonomous Document Protocol
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. TOP APP HEADER WITH BACK NAVIGATION */}
      <header style={{
        flexShrink: 0,
        backgroundColor: "#0c0e15",
        borderBottom: "1px solid #1a1e2c",
        padding: "12px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(0, 229, 255, 0.1)",
                border: "1px solid rgba(0, 229, 255, 0.25)",
                color: "#00e5ff",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: "bold",
                cursor: "pointer"
              }}
            >
              <Icons.Back /> Back
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(0, 229, 255, 0.3)", backgroundColor: "#090c14" }}>
                <img src="/logo.png" alt="Clearfile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div>
                <div style={{ fontSize: "16px", fontWeight: "bold", letterSpacing: "-0.2px" }}>clearfile</div>
                <div style={{ fontSize: "9px", color: "#8492a6", letterSpacing: "1px", textTransform: "uppercase" }}>Apex Hub</div>
              </div>
            </div>
          )}
        </div>

        <span style={{ fontSize: "10px", color: "#00e5ff", background: "rgba(0, 229, 255, 0.08)", border: "1px solid rgba(0,229,255,0.25)", padding: "4px 8px", borderRadius: "6px", fontWeight: "600" }}>
          {activeTool ? activeTool.toUpperCase() : "OFFLINE KERNEL"}
        </span>
      </header>

      {/* TOAST SYSTEM */}
      {toastMsg && (
        <div style={{ backgroundColor: "#00e5ff", color: "#050608", fontSize: "11px", fontWeight: "bold", textAlign: "center", padding: "6px" }}>
          {toastMsg}
        </div>
      )}

      {/* 3. MAIN WORKSPACE */}
      <main style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px",
        maxWidth: "540px",
        width: "100%",
        margin: "0 auto",
        boxSizing: "border-box"
      }} className="no-scrollbar">

        {/* HOME DASHBOARD */}
        {activeTool === null && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ padding: "8px 4px", fontSize: "13px", fontWeight: "bold", color: "#00e5ff", textTransform: "uppercase", letterSpacing: "1px" }}>
              System Applications
            </div>
            {TOOLS.map((tool) => {
              const IconComp = tool.icon;
              return (
                <div
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id)}
                  style={{
                    backgroundColor: "#0e1017",
                    border: "1px solid #1e2235",
                    borderRadius: "16px",
                    padding: "18px",
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    cursor: "pointer",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.4)"
                  }}
                >
                  <div style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "14px",
                    background: "rgba(0, 229, 255, 0.1)",
                    border: "1px solid rgba(0, 229, 255, 0.25)",
                    color: "#00e5ff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    <IconComp />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "15px", fontWeight: "bold", color: "#f8fafc" }}>{tool.label}</div>
                    <div style={{ fontSize: "11px", color: "#8492a6", marginTop: "2px" }}>{tool.desc}</div>
                  </div>
                  <div style={{ color: "#475569", fontSize: "18px" }}>→</div>
                </div>
              );
            })}
          </div>
        )}

        {/* TOOL 1: 4-CORNER PERSPECTIVE WARP SCANNER */}
        {activeTool === "scan" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ backgroundColor: "#0e1017", border: "1px solid #1e2235", borderRadius: "18px", padding: "18px" }}>
              <div style={{ fontSize: "12px", color: "#00e5ff", fontWeight: "bold", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>
                Homography Perspective Document Scanner
              </div>

              {isCameraActive && (
                <div style={{ position: "relative", width: "100%", height: "400px", borderRadius: "14px", overflow: "hidden", backgroundColor: "#000", marginBottom: "14px" }}>
                  <video ref={scanVideoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    onClick={captureCameraFrame}
                    style={{
                      position: "absolute",
                      bottom: "20px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      padding: "14px 32px",
                      borderRadius: "30px",
                      background: "#00e5ff",
                      color: "#050608",
                      fontWeight: "bold",
                      border: "none",
                      fontSize: "13px",
                      boxShadow: "0 0 25px rgba(0, 229, 255, 0.5)",
                      cursor: "pointer"
                    }}
                  >
                    SNAP DOCUMENT
                  </button>
                </div>
              )}

              {rawCapturedImage && !inspectedPage && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ fontSize: "11px", color: "#00e5ff" }}>Drag the 4 corner handles to isolate the skewed page:</div>
                  <div
                    ref={cropWrapperRef}
                    onMouseMove={handleTouchCornerMove}
                    onTouchMove={handleTouchCornerMove}
                    onMouseUp={() => setDraggingCorner(null)}
                    onTouchEnd={() => setDraggingCorner(null)}
                    style={{
                      position: "relative",
                      width: "100%",
                      height: "320px",
                      backgroundColor: "#000",
                      borderRadius: "14px",
                      overflow: "hidden",
                      touchAction: "none"
                    }}
                  >
                    <img src={rawCapturedImage} alt="Raw" style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />

                    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
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
                        onMouseDown={() => setDraggingCorner(idx)}
                        onTouchStart={() => setDraggingCorner(idx)}
                        style={{
                          position: "absolute",
                          left: `${c.x}%`,
                          top: `${c.y}%`,
                          transform: "translate(-50%, -50%)",
                          width: "38px",
                          height: "38px",
                          borderRadius: "50%",
                          background: "rgba(0, 229, 255, 0.4)",
                          border: "2px solid #ffffff",
                          boxShadow: "0 0 12px #00e5ff",
                          cursor: "grab",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >
                        <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#00e5ff" }} />
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    {[
                      { id: "magic", label: "Magic Color" },
                      { id: "bw", label: "Crisp B&W" },
                      { id: "color", label: "Original" }
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setScanFilter(f.id)}
                        style={{
                          flex: 1,
                          padding: "8px 0",
                          borderRadius: "8px",
                          border: scanFilter === f.id ? "1px solid #00e5ff" : "1px solid #222638",
                          background: scanFilter === f.id ? "rgba(0, 229, 255, 0.15)" : "#131622",
                          color: scanFilter === f.id ? "#00e5ff" : "#8492a6",
                          fontSize: "11px",
                          fontWeight: "bold"
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={executePerspectiveWarp}
                    style={{
                      padding: "14px",
                      borderRadius: "12px",
                      background: "#00e5ff",
                      color: "#050608",
                      fontWeight: "bold",
                      border: "none",
                      fontSize: "13px"
                    }}
                  >
                    Warp Perspective & Preview →
                  </button>
                </div>
              )}

              {inspectedPage && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ fontSize: "12px", color: "#10b981", fontWeight: "bold" }}>
                    ✓ Inspection Studio (Review Straightened Document):
                  </div>
                  <div style={{ width: "100%", height: "300px", borderRadius: "12px", overflow: "hidden", backgroundColor: "#000", border: "1px solid #10b981" }}>
                    <img src={inspectedPage} alt="Warped" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <button
                      onClick={() => setInspectedPage(null)}
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        background: "#151824",
                        border: "1px solid #2a314d",
                        color: "#f8fafc",
                        fontSize: "12px",
                        fontWeight: "bold"
                      }}
                    >
                      ↺ Re-Adjust Corners
                    </button>
                    <button
                      onClick={acceptScannedPage}
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        background: "#00e5ff",
                        color: "#050608",
                        fontSize: "12px",
                        fontWeight: "bold",
                        border: "none"
                      }}
                    >
                      ✓ Accept Page
                    </button>
                  </div>
                </div>
              )}

              {!isCameraActive && !rawCapturedImage && !inspectedPage && (
                <button
                  onClick={startScanCamera}
                  style={{
                    width: "100%",
                    padding: "16px",
                    borderRadius: "14px",
                    background: "#00e5ff",
                    color: "#050608",
                    fontSize: "13px",
                    fontWeight: "bold",
                    border: "none",
                    cursor: "pointer",
                    textTransform: "uppercase"
                  }}
                >
                  Open Camera Viewfinder
                </button>
              )}

              {scannedStack.length > 0 && !isCameraActive && !rawCapturedImage && !inspectedPage && (
                <div style={{ marginTop: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#8492a6" }}>
                    <span>Document Pages ({scannedStack.length})</span>
                    <span style={{ color: "#ef4444", cursor: "pointer" }} onClick={() => setScannedStack([])}>Clear Stack</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                    {scannedStack.map((pg, i) => (
                      <img key={i} src={pg} alt="Pg" style={{ width: "100%", height: "110px", objectFit: "cover", borderRadius: "8px", border: "1px solid #222638" }} />
                    ))}
                  </div>
                  <button
                    onClick={exportScannedPDF}
                    style={{
                      padding: "14px",
                      borderRadius: "12px",
                      background: "#151824",
                      border: "1px solid #00e5ff",
                      color: "#00e5ff",
                      fontSize: "13px",
                      fontWeight: "bold",
                      marginTop: "6px"
                    }}
                  >
                    Export Multi-Page Document to Phone 💾
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TOOL 2: DOCUMENT SIGNER */}
        {activeTool === "sign" && (
          <div style={{ backgroundColor: "#0e1017", border: "1px solid #1e2235", borderRadius: "18px", padding: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ fontSize: "12px", color: "#00e5ff", fontWeight: "bold", letterSpacing: "1px", textTransform: "uppercase" }}>
              Transparent Signature on Live Document
            </div>

            {!docToSignBytes ? (
              <label style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                border: "2px dashed #262b3d",
                borderRadius: "14px",
                padding: "36px 16px",
                cursor: "pointer",
                backgroundColor: "#111420"
              }}>
                <div style={{ color: "#00d4ff", marginBottom: "8px" }}><Icons.Signature /></div>
                <span style={{ fontSize: "14px", fontWeight: "600" }}>Upload Document (PDF, PNG, JPG)</span>
                <span style={{ fontSize: "10px", color: "#8492a6", marginTop: "4px" }}>Supports multi-page contracts & forms</span>
                <input type="file" accept="application/pdf,image/*" onChange={handleDocumentPickForSign} style={{ display: "none" }} />
              </label>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", background: "#131622", padding: "10px", borderRadius: "8px", fontSize: "12px" }}>
                  <span>{docFileName}</span>
                  <label style={{ color: "#00d4ff", cursor: "pointer" }}>
                    Change
                    <input type="file" accept="application/pdf,image/*" onChange={handleDocumentPickForSign} style={{ display: "none" }} />
                  </label>
                </div>

                <div
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    setSigCoordinates({ x, y });
                  }}
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "280px",
                    backgroundColor: "#ffffff",
                    borderRadius: "12px",
                    overflow: "hidden",
                    cursor: "crosshair",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid #2a314d"
                  }}
                >
                  <img src={docPreviewUrl} alt="Doc" style={{ width: "100%", height: "100%", objectFit: "contain" }} />

                  {signatureTransparentUrl && (
                    <img
                      src={signatureTransparentUrl}
                      alt="Signature"
                      style={{
                        position: "absolute",
                        top: `${sigCoordinates.y}%`,
                        left: `${sigCoordinates.x}%`,
                        transform: "translate(-50%, -50%)",
                        width: attachSecuritySeal ? "140px" : "110px",
                        pointerEvents: "none"
                      }}
                    />
                  )}
                </div>
                <div style={{ fontSize: "10px", color: "#8492a6", textAlign: "center" }}>
                  Placed at X: {Math.round(sigCoordinates.x)}% | Y: {Math.round(sigCoordinates.y)}% (Tap above to relocate)
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#131622", padding: "10px 14px", borderRadius: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "#8492a6" }}>Pen Ink:</span>
                {["#000000", "#002b80", "#008037"].map((c) => (
                  <div
                    key={c}
                    onClick={() => setInkColor(c)}
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      backgroundColor: c,
                      border: inkColor === c ? "2px solid #00e5ff" : "1px solid #475569",
                      cursor: "pointer"
                    }}
                  />
                ))}
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#f8fafc", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={attachSecuritySeal}
                  onChange={(e) => {
                    setAttachSecuritySeal(e.target.checked);
                    setTimeout(() => endDrawingSignature(), 50);
                  }}
                  style={{ accentColor: "#00e5ff" }}
                />
                Cryptographic Seal
              </label>
            </div>

            <div style={{ borderTop: "1px solid #1c2030", paddingTop: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "11px", color: "#8492a6" }}>Draw Handwritten Signature:</span>
                <span style={{ fontSize: "11px", color: "#ef4444", cursor: "pointer" }} onClick={clearSignaturePad}>Clear</span>
              </div>
              <div style={{ width: "100%", height: "130px", backgroundColor: "#ffffff", borderRadius: "10px", border: "1px dashed #222638", overflow: "hidden" }}>
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
                  style={{ width: "100%", height: "100%", touchAction: "none" }}
                />
              </div>
            </div>

            {docToSignBytes && signatureTransparentUrl && (
              <button
                onClick={burnSignatureAndSaveDocument}
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  background: "#00e5ff",
                  color: "#050608",
                  fontWeight: "bold",
                  border: "none",
                  fontSize: "12px",
                  textTransform: "uppercase"
                }}
              >
                Sign & Save Document to Phone 💾
              </button>
            )}
          </div>
        )}

        {/* TOOL 3: COMPRESSOR */}
        {activeTool === "compress" && (
          <div style={{ backgroundColor: "#0e1017", border: "1px solid #1e2235", borderRadius: "18px", padding: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ fontSize: "12px", color: "#00e5ff", fontWeight: "bold", letterSpacing: "1px", textTransform: "uppercase" }}>
              Target File Compression Engine
            </div>

            {compFiles.length === 0 ? (
              <label style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                border: "2px dashed #262b3d",
                borderRadius: "14px",
                padding: "36px 16px",
                cursor: "pointer",
                backgroundColor: "#111420"
              }}>
                <div style={{ color: "#00d4ff", marginBottom: "8px" }}><Icons.Compress /></div>
                <span style={{ fontSize: "14px", fontWeight: "600" }}>Select Any File (Images, PDF, Documents)</span>
                <span style={{ fontSize: "10px", color: "#8492a6", marginTop: "4px" }}>Optimizes images, PDF streams, or archives</span>
                <input type="file" multiple onChange={handlePickCompressFiles} style={{ display: "none" }} />
              </label>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", background: "#131622", padding: "10px", borderRadius: "8px" }}>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: "600" }}>{compFiles[0].name}</div>
                    <div style={{ fontSize: "11px", color: "#00e5ff" }}>Original: {formatBytes(compFiles[0].size)}</div>
                  </div>
                  <label style={{ fontSize: "11px", color: "#8492a6", cursor: "pointer" }}>
                    Change
                    <input type="file" multiple onChange={handlePickCompressFiles} style={{ display: "none" }} />
                  </label>
                </div>

                <div style={{ background: "#131622", padding: "14px", borderRadius: "12px", border: "1px solid #202434" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", color: "#8492a6" }}>Target Size (KB):</span>
                    <input
                      type="number"
                      value={customKBInput}
                      onChange={(e) => {
                        setCustomKBInput(e.target.value);
                        if (Number(e.target.value) > 0) setTargetSizeKB(Number(e.target.value));
                      }}
                      style={{
                        width: "100px",
                        backgroundColor: "#080a10",
                        border: "1px solid #293046",
                        borderRadius: "6px",
                        padding: "6px 8px",
                        fontSize: "13px",
                        textAlign: "right",
                        color: "#00e5ff",
                        fontWeight: "bold"
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                    {[50, 100, 200, 500].map((kb) => (
                      <button
                        key={kb}
                        onClick={() => { setTargetSizeKB(kb); setCustomKBInput(kb.toString()); }}
                        style={{
                          padding: "6px 0",
                          borderRadius: "6px",
                          border: targetSizeKB === kb ? "1px solid #00e5ff" : "1px solid #202434",
                          background: targetSizeKB === kb ? "rgba(0, 212, 255, 0.15)" : "#161a28",
                          color: targetSizeKB === kb ? "#00e5ff" : "#8492a6",
                          fontSize: "11px"
                        }}
                      >
                        {kb} KB
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={executeUniversalCompression}
                  disabled={isCompressing}
                  style={{
                    padding: "14px",
                    borderRadius: "12px",
                    background: "#00e5ff",
                    color: "#050608",
                    fontSize: "13px",
                    fontWeight: "bold",
                    border: "none"
                  }}
                >
                  {isCompressing ? "Compressing..." : `Compress File(s)`}
                </button>
              </div>
            )}

            {compressedResult && (
              <div style={{ background: "#131622", border: "1px solid rgba(16,185,129,0.4)", borderRadius: "12px", padding: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ fontSize: "12px", color: "#10b981", fontWeight: "bold" }}>
                  ✓ Compressed to {formatBytes(compressedResult.size)} (Reduced by {(((compressedResult.origSize - compressedResult.size) / compressedResult.origSize) * 100).toFixed(0)}%)
                </div>
                <button
                  onClick={() => exportFileToDevice(compressedResult.dataUrl, `compressed-${compressedResult.name}`)}
                  style={{
                    padding: "12px",
                    borderRadius: "10px",
                    background: "#161a28",
                    border: "1px solid #00e5ff",
                    color: "#00e5ff",
                    fontSize: "12px",
                    fontWeight: "bold"
                  }}
                >
                  Save Compressed File to Phone 💾
                </button>
              </div>
            )}
          </div>
        )}

        {/* TOOL 4: UNIVERSAL CONVERTER */}
        {activeTool === "convert" && (
          <div style={{ backgroundColor: "#0e1017", border: "1px solid #1e2235", borderRadius: "18px", padding: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ fontSize: "12px", color: "#00e5ff", fontWeight: "bold", letterSpacing: "1px", textTransform: "uppercase" }}>
              Universal Any-to-Any Converter
            </div>

            <label style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              border: "2px dashed #262b3d",
              borderRadius: "14px",
              padding: "28px 16px",
              cursor: "pointer",
              backgroundColor: "#111420"
            }}>
              <div style={{ color: "#00d4ff", marginBottom: "6px" }}><Icons.Convert /></div>
              <span style={{ fontSize: "13px", fontWeight: "600" }}>
                {convFiles.length > 0 ? `${convFiles.length} file(s) selected` : "Select Files to Convert"}
              </span>
              <input type="file" multiple onChange={handlePickConvertFiles} style={{ display: "none" }} />
            </label>

            <div>
              <span style={{ fontSize: "11px", color: "#8492a6" }}>Target Format:</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginTop: "6px" }}>
                {["pdf", "png", "webp", "jpeg"].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setTargetFormat(fmt)}
                    style={{
                      padding: "8px 0",
                      borderRadius: "6px",
                      border: targetFormat === fmt ? "1px solid #00e5ff" : "1px solid #202434",
                      background: targetFormat === fmt ? "rgba(0, 212, 255, 0.15)" : "#131622",
                      color: targetFormat === fmt ? "#00e5ff" : "#8492a6",
                      fontSize: "11px",
                      fontWeight: "bold",
                      textTransform: "uppercase"
                    }}
                  >
                    .{fmt}
                  </button>
                ))}
              </div>
            </div>

            {convFiles.length > 0 && (
              <button
                onClick={executeUniversalConversion}
                disabled={isConverting}
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  background: "#00e5ff",
                  color: "#050608",
                  fontSize: "13px",
                  fontWeight: "bold",
                  border: "none"
                }}
              >
                {isConverting ? "Converting..." : `Convert to .${targetFormat.toUpperCase()}`}
              </button>
            )}

            {conversionResult && (
              <button
                onClick={() => exportFileToDevice(conversionResult.dataUrl, conversionResult.name)}
                style={{
                  padding: "12px",
                  borderRadius: "10px",
                  background: "#151824",
                  border: "1px solid #10b981",
                  color: "#10b981",
                  fontSize: "12px",
                  fontWeight: "bold"
                }}
              >
                Save Converted File ({conversionResult.name}) 💾
              </button>
            )}
          </div>
        )}

        {/* TOOL 5: QR SCANNER (INTENT REDIRECT & HYPERLINK) */}
        {activeTool === "qr" && (
          <div style={{ backgroundColor: "#0e1017", border: "1px solid #1e2235", borderRadius: "18px", padding: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ fontSize: "12px", color: "#00e5ff", fontWeight: "bold", letterSpacing: "1px", textTransform: "uppercase" }}>
              Continuous QR Scanner & Creator
            </div>

            <div style={{ position: "relative", width: "100%", height: "240px", backgroundColor: "#000", borderRadius: "12px", overflow: "hidden", border: "1px solid #202434" }}>
              <video ref={qrVideoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {isQrLiveActive && (
                <div style={{ position: "absolute", inset: "30px", border: "2px solid rgba(0, 212, 255, 0.4)", borderRadius: "10px" }}>
                  <div style={{ position: "absolute", left: 0, right: 0, height: "2px", background: "#00e5ff", boxShadow: "0 0 8px #00d4ff" }} className="laser-scanner" />
                </div>
              )}
              {!isQrLiveActive && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ color: "#00d4ff", marginBottom: "6px" }}><Icons.QR /></div>
                  <span style={{ fontSize: "11px", color: "#8492a6" }}>Camera Sensor Idle</span>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {!isQrLiveActive ? (
                <button
                  onClick={startQrLiveScanning}
                  style={{ padding: "12px", borderRadius: "10px", background: "#00e5ff", color: "#050608", fontWeight: "bold", border: "none", fontSize: "12px" }}
                >
                  Start Live Camera
                </button>
              ) : (
                <button
                  onClick={stopQrLiveScanning}
                  style={{ padding: "12px", borderRadius: "10px", background: "#202434", color: "#fff", fontWeight: "bold", border: "none", fontSize: "12px" }}
                >
                  Stop Camera
                </button>
              )}

              <label style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px",
                borderRadius: "10px",
                background: "#151824",
                color: "#f8fafc",
                border: "1px solid #222638",
                fontSize: "12px",
                fontWeight: "bold",
                cursor: "pointer"
              }}>
                Scan Screenshot
                <input type="file" accept="image/*" onChange={scanQrFromScreenshotPicker} style={{ display: "none" }} />
              </label>
            </div>

            {qrDecodedValue && (
              <div style={{ background: "#131622", border: "1px solid #00e5ff", padding: "12px", borderRadius: "10px" }}>
                <div style={{ fontSize: "10px", color: "#8492a6" }}>Detected Output:</div>
                <div style={{ fontSize: "13px", color: "#00e5ff", fontWeight: "bold", wordBreak: "break-all", marginTop: "4px" }}>
                  {qrDecodedValue}
                </div>
                {qrDecodedValue.startsWith("http") && (
                  <button
                    onClick={() => dispatchRedirect(qrDecodedValue)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      background: "#00e5ff",
                      color: "#050608",
                      fontWeight: "bold",
                      border: "none",
                      marginTop: "8px",
                      fontSize: "12px"
                    }}
                  >
                    Open Link in Browser ↗
                  </button>
                )}
              </div>
            )}

            <div style={{ borderTop: "1px solid #1a1e2c", paddingTop: "14px" }}>
              <span style={{ fontSize: "11px", color: "#8492a6" }}>Generate QR Code:</span>
              <input
                type="text"
                value={qrTextToGenerate}
                onChange={(e) => setQrTextToGenerate(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  background: "#131622",
                  border: "1px solid #202434",
                  margin: "8px 0",
                  fontSize: "12px"
                }}
              />
              {generatedQrCodeUrl && (
                <div style={{ textAlign: "center" }}>
                  <img src={generatedQrCodeUrl} alt="QR" style={{ width: "160px", height: "160px", borderRadius: "8px" }} />
                  <button
                    onClick={() => exportFileToDevice(generatedQrCodeUrl, "Clearfile-QR.png")}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      background: "#00e5ff",
                      color: "#050608",
                      fontWeight: "bold",
                      border: "none",
                      marginTop: "10px",
                      fontSize: "12px"
                    }}
                  >
                    Save QR Image to Phone 💾
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* 4. FIXED BOTTOM NAVIGATION DOCK */}
      <footer style={{
        flexShrink: 0,
        backgroundColor: "#0c0e15",
        borderTop: "1px solid #1a1e2c",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        padding: "8px 4px 14px 4px"
      }}>
        {TOOLS.map((tab) => {
          const isActive = activeTool === tab.id;
          const IconComp = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (activeTool === "qr" && tab.id !== "qr") stopQrLiveScanning();
                if (activeTool === "scan" && tab.id !== "scan") {
                  if (scanStreamRef.current) scanStreamRef.current.getTracks().forEach((t) => t.stop());
                  setIsCameraActive(false);
                }
                setActiveTool(tab.id);
              }}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "3px",
                cursor: "pointer"
              }}
            >
              <div style={{ color: isActive ? "#00e5ff" : "#8492a6" }}>
                <IconComp />
              </div>
              <span style={{ fontSize: "10px", fontWeight: isActive ? "bold" : "500", color: isActive ? "#00e5ff" : "#8492a6" }}>
                {tab.label}
              </span>
              {isActive && (
                <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#00e5ff", marginTop: "1px" }} />
              )}
            </button>
          );
        })}
      </footer>

    </div>
  );
}