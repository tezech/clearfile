export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <span className="text-xl font-bold text-gray-900">ClearFile</span>
          <span className="text-sm text-gray-500">100% Private &middot; No Sign-up</span>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-16 pb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          Compress and convert files.<br />Without giving up your privacy.
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
          Your files never leave your device. No uploads, no accounts, no subscriptions —
          just fast, private tools that work entirely in your browser.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <a href="/compress-pdf" className="block bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Compress PDF</h2>
            <p className="text-gray-600 text-sm mb-4">
              Reduce PDF file size while keeping quality intact.
            </p>
            <span className="text-blue-600 text-sm font-medium">Try it &rarr;</span>
          </a>

          <a href="/compress-image" className="block bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Compress Image</h2>
            <p className="text-gray-600 text-sm mb-4">
              Shrink JPG, PNG, and WebP files without visible quality loss.
            </p>
            <span className="text-blue-600 text-sm font-medium">Try it &rarr;</span>
          </a>

          <a href="/convert-files" className="block bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Convert Files</h2>
            <p className="text-gray-600 text-sm mb-4">
              Switch between JPG, PNG, WebP, and PDF.
            </p>
            <span className="text-blue-600 text-sm font-medium">Try it &rarr;</span>
          </a>

        </div>
      </section>

      <section className="border-t border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Nothing is uploaded</h3>
            <p className="text-sm text-gray-600">All processing happens on your own device, in your browser.</p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">No account needed</h3>
            <p className="text-sm text-gray-600">Just open a tool and use it. No sign-up, ever.</p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Always free</h3>
            <p className="text-sm text-gray-600">No subscriptions or hidden paywalls. Ever.</p>
          </div>
        </div>
      </section>

      <footer className="text-center text-sm text-gray-400 py-8">
        &copy; {new Date().getFullYear()} ClearFile
      </footer>
    </main>
  );
}