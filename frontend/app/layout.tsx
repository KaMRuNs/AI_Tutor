import type { Metadata } from "next";
import { Baloo_Da_2, Poppins } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const baloo = Baloo_Da_2({ variable: "--font-baloo", subsets: ["bengali", "latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Shikkhok AI — আপনার ব্যক্তিগত AI শিক্ষক",
  description: "A personal AI teacher that explains your course in Bangla with a live whiteboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${poppins.variable} ${baloo.variable} font-sans antialiased`}>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 sm:px-6">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
