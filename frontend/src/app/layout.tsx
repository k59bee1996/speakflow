import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Be_Vietnam_Pro, Lexend } from "next/font/google";
import "../styles/tokens.css";
import "./globals.css";

const uiFont = Be_Vietnam_Pro({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700", "800"], variable: "--font-ui", display: "swap" });
const displayFont = Lexend({ subsets: ["latin", "vietnamese"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Speakflow",
  description: "Lộ trình 12 tuần luyện phản xạ nói tiếng Anh",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${uiFont.variable} ${displayFont.variable} scheme-light-dark`}>
      <body className="bg-token-bg font-token-ui text-token-text">{children}</body>
    </html>
  );
}
