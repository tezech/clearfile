import "./globals.css";

export const metadata = {
  title: "Clearfile",
  description: "Autonomous Document Security Protocol",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full w-full overflow-hidden bg-[#050608] text-[#f8fafc]">
        {children}
      </body>
    </html>
  );
}