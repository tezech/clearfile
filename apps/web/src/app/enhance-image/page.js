"use client";

import { useState } from "react";

const ENHANCE_LEVELS = {
  light: { label: "Light Touch", sharpen: 0.6, clipPercent: 0.008, saturation: 1.15 },
  balanced: { label: "Balanced", sharpen: 1.0, clipPercent: 0.015, saturation: 1.3 },
  strong: { label: "Strong", sharpen: 1.6, clipPercent: 0.025, saturation: 1.5 },
};

function boxBlur3x3(data, width, height) {
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
}

function unsharpMask(data, blurred, amount) {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = data[i] + amount * (data[i] - blurred[i]);
    out[i + 1] = data[i + 1] + amount * (data[i + 1] - blurred[i + 1]);
    out[i + 2] = data[i + 2] + amount * (data[i + 2] - blurred[i + 2]);
    out[i + 3] = data[i + 3];
  }
  return out;
}

/** Percentile-based auto-levels: stretches each channel's [low, high] range to [0, 255]. */
function autoContrastStretch(data, clipPercent) {
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
}

/** Pushes each pixel's color away from its own luminance to boost vividness. */
function boostSaturation(data, factor) {
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
}

function enhanceImageData(imageData, level) {
  const { data, width, height } = imageData;
  const blurred = boxBlur3x3(data, width, height); // also acts as light denoise
  const sharpened = unsharpMask(data, blurred, level.sharpen);
  const leveled = autoContrastStretch(sharpened, level.clipPercent);
  const vivid = boostSaturation(leveled, level.saturation);
  return new ImageData(vivid, width, height);
}

export default function EnhanceImage() {
  const [originalFile, setOriginalFile] = useState(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState(null);
  const [level, setLevel] = useState("balanced");
  const [enhancedBlob, setEnhancedBlob] = useState(null);
  const [enhancedPreviewUrl, setEnhancedPreviewUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showAd, setShowAd] = useState(false);
  const [adCountdown, setAdCountdown] = useState(3);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setErrorMsg("");
    setOriginalFile(file);
    setOriginalPreviewUrl(URL.createObjectURL(file));
    setEnhancedBlob(null);
    setEnhancedPreviewUrl(null);
  };

  const runEnhance = async () => {
    if (!originalFile) return;
    setIsProcessing(true);
    setErrorMsg("");

    try {
      const bitmap = await createImageBitmap(originalFile);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const enhanced = enhanceImageData(imageData, ENHANCE_LEVELS[level]);
      ctx.putImageData(enhanced, 0, 0);

      const mime = originalFile.type === "image/png" ? "image/png" : "image/jpeg";
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.92));
      setEnhancedBlob(blob);
      setEnhancedPreviewUrl(URL.createObjectURL(blob));
    } catch (error) {
      setErrorMsg("Something went wrong enhancing this file. Try a different image.");
      setOriginalFile(null);
      setOriginalPreviewUrl(null);
      console.error(error);
    } finally {
      setIsProcessing(false);
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
    const url = URL.createObjectURL(enhancedBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "enhanced-" + originalFile.name;
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Enhance Image</h1>
        <p className="text-gray-600 mb-8">
          Sharpen, denoise, and auto-correct contrast &mdash; entirely on your device, nothing is uploaded anywhere.
        </p>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 mb-6">
            {errorMsg}
          </div>
        )}

        {!originalFile && !isProcessing && !enhancedBlob && (
          <label className="block border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition bg-white">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            <p className="text-gray-700 font-medium mb-1">Click to choose an image</p>
            <p className="text-gray-400 text-sm">JPG, PNG, or WebP</p>
          </label>
        )}

        {originalFile && !isProcessing && !enhancedBlob && (
          <div className="border border-gray-200 rounded-xl p-8 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={originalPreviewUrl}
              alt="Original preview"
              className="w-full max-h-80 object-contain rounded-lg mb-6 bg-gray-100"
            />
            <p className="text-sm text-gray-600 mb-3">Enhancement strength:</p>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {Object.entries(ENHANCE_LEVELS).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setLevel(key)}
                  className={`border text-sm font-medium py-2.5 rounded-lg transition ${
                    level === key
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-300 text-gray-800 hover:border-gray-900"
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
            <button
              onClick={runEnhance}
              className="w-full bg-gray-900 text-white font-medium py-3 rounded-lg hover:bg-gray-800 transition"
            >
              Enhance
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="border border-gray-200 rounded-xl p-12 text-center bg-white">
            <p className="text-gray-700 font-medium">Enhancing your image&hellip;</p>
            <p className="text-gray-400 text-sm mt-1">This happens locally on your device</p>
          </div>
        )}

        {enhancedBlob && !showAd && (
          <div className="border border-gray-200 rounded-xl p-8 bg-white">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-gray-500 mb-2 text-center">Before</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={originalPreviewUrl} alt="Before" className="w-full h-40 object-cover rounded-lg bg-gray-100" />
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-2 text-center">After</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={enhancedPreviewUrl} alt="After" className="w-full h-40 object-cover rounded-lg bg-gray-100" />
              </div>
            </div>
            <button
              onClick={startAdThenDownload}
              className="w-full bg-gray-900 text-white font-medium py-3 rounded-lg hover:bg-gray-800 transition"
            >
              Get Enhanced Image
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
