import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "QRForge — AI QR Studio",
  description: "Generate beautiful AI-powered QR codes with voice.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden">
        <div className="flex h-full">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Header />
            <main className="flex-1 overflow-hidden">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
