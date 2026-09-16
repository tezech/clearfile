"use client";

import { useState } from "react";
import imageCompression from "browser-image-compression";

export default function CompressImage() {
  const [originalFile, setOriginalFile] = useState(null);
  const [originalSize, setOriginalSize] = useState(0);
  const [compressedBlob, setCompressedBlob] = useState(null);
  const [compressedSize, setCompressedSize] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showAd, setShowAd] = useState(false);
  const [adCountdown, setAdCountdown] = useState(3);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setOriginalFile(file);
    setOriginalSize(file.size);
    setCompressedBlob(null);
    setIsCompressing(true);

    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        initialQuality: 0.8,
      };
      const compressed = await imageCompression(file, options);
      setCompressedBlob(compressed);
      setCompressedSize(compressed.size);
    } catch (error) {
      alert("Something went wrong compressing this file. Try a different image.");
      console.error(error);
    } finally {
      setIsCompressing(false);
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
    const url = URL.createObjectURL(compressedBlob);
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

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-gray-900">ClearFile</a>
          <span className="text-sm text-gray-500">100% Private &middot; No Sign-up</span>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Compress Image</h1>
        <p className="text-gray-600 mb-8">
          Upload a JPG, PNG, or WebP. It's compressed entirely on your device — nothing is uploaded anywhere.
        </p>

        {/* Upload box */}
        {!compressedBlob && !isCompressing && (
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

        {/* Compressing state */}
        {isCompressing && (
          <div className="border border-gray-200 rounded-xl p-12 text-center bg-white">
            <p className="text-gray-700 font-medium">Compressing your image&hellip;</p>
            <p className="text-gray-400 text-sm mt-1">This happens locally on your device</p>
          </div>
        )}

        {/* Result */}
        {compressedBlob && !showAd && (
          <div className="border border-gray-200 rounded-xl p-8 bg-white">
            <div className="grid grid-cols-2 gap-4 mb-6 text-center">
              <div>
                <p className="text-sm text-gray-500">Original</p>
                <p className="text-xl font-semibold text-gray-900">{formatSize(originalSize)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Compressed</p>
                <p className="text-xl font-semibold text-green-600">{formatSize(compressedSize)}</p>
              </div>
            </div>
            <button
              onClick={startAdThenDownload}
              className="w-full bg-gray-900 text-white font-medium py-3 rounded-lg hover:bg-gray-800 transition"
            >
              Get Compressed Image
            </button>
          </div>
        )}

        {/* Ad screen before download */}
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