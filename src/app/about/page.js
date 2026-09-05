export default function About() {
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-gray-900">ClearFile</a>
          <span className="text-sm text-gray-500">100% Private &middot; No Sign-up</span>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">About ClearFile</h1>

        <div className="space-y-6 text-gray-700">
          <p>
            ClearFile was built on a simple frustration: most file compression and conversion
            tools require you to upload your documents and photos to someone else's server,
            create an account, or pay a subscription just to shrink a PDF.
          </p>
          <p>
            We built ClearFile to work entirely inside your browser. Nothing is uploaded.
            Nothing is stored. There's no sign-up, no subscription &mdash; just tools that work.
          </p>
          <p>
            The site is free to use and supported by ads, which is what keeps it free and keeps
            us from ever needing to ask for your data.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 pt-4">Contact</h2>
          <p>
            For questions, feedback, or issues: <span className="font-medium">[your email here]</span>
          </p>
        </div>
      </section>
    </main>
  );
}