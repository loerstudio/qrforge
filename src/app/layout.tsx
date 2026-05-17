import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QRForge — AI QR Studio",
  description: "Generate beautiful AI-powered QR codes with voice.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  );
}
