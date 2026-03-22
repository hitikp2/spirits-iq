import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Nunito_Sans, IBM_Plex_Mono } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "./providers";

const fontDisplay = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const fontBody = Nunito_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SPIRITS IQ — AI-Powered Liquor Store Platform",
  description:
    "All-in-one POS, inventory management, AI-powered SMS engagement, and business intelligence for modern liquor stores.",
  manifest: "/manifest.json",
  icons: { icon: "/icons/favicon.ico", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#08080D",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`}
    >
      <body className="min-h-screen bg-surface-950 text-surface-100 font-body antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
