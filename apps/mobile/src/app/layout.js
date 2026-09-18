import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
});

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
    <html lang="en" className={`h-full antialiased ${manrope.variable}`}>
      <body className="h-full w-full overflow-hidden bg-[#06070a] text-[#f8fafc]" style={{ fontFamily: "var(--font-manrope), -apple-system, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}