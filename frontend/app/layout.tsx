import type { Metadata } from "next";
import { Hind_Siliguri, Inter } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { Header } from "@/components/Header";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const hind = Hind_Siliguri({ variable: "--font-hind", subsets: ["bengali", "latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Shikkhok AI — আপনার ব্যক্তিগত AI শিক্ষক",
  description: "A personal AI teacher that explains your course in Bangla with a live whiteboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${hind.variable} font-sans antialiased`}>
        <div className="stars" aria-hidden />
        <div className="relative z-10 flex min-h-screen flex-col">
          <Header />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 sm:px-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
