export default function Privacy() {
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-gray-900">ClearFile</a>
          <span className="text-sm text-gray-500">100% Private &middot; No Sign-up</span>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>

        <div className="space-y-6 text-gray-700">
          <p>
            ClearFile is built around one core principle: your files never leave your device.
            All compression and conversion happens locally, inside your own browser, using
            JavaScript running on your computer or phone. We do not have a server that receives,
            stores, or processes your files in any way.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 pt-4">What we don't collect</h2>
          <p>
            We do not require accounts or sign-ups. We do not upload, store, or have access to
            any file you process using this site. We have no database of user files.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 pt-4">Advertising</h2>
          <p>
            This site is supported by advertising, served through Google AdSense. Google may use
            cookies and similar technologies to serve ads based on your prior visits to this or
            other websites. You can learn more about how Google uses this data, and manage your
            ad preferences, at{" "}
            <a href="https://policies.google.com/technologies/ads" className="text-blue-600 underline">
              policies.google.com/technologies/ads
            </a>.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 pt-4">Basic analytics</h2>
          <p>
            We may use standard, privacy-respecting analytics to understand overall site traffic
            (like how many people visit), but this is never tied to the files you process, since
            those files never reach us in the first place.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 pt-4">Contact</h2>
          <p>
            Questions about this policy can be sent to the contact details listed on our{" "}
            <a href="/about" className="text-blue-600 underline">About page</a>.
          </p>

          <p className="text-sm text-gray-400 pt-6">Last updated: {new Date().toLocaleDateString()}</p>
        </div>
      </section>
    </main>
  );
}