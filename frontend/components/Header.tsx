"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "হোম" },
  { href: "/library", label: "লাইব্রেরি" },
  { href: "/classroom", label: "ক্লাসরুম" },
  { href: "/progress", label: "অগ্রগতি" },
];

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2">
      <span className="bn flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">শি</span>
      <span className="bn hidden text-xl font-bold text-navy sm:inline">
        শিক্ষক<span className="text-brand">AI</span>
      </span>
    </Link>
  );
}

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6">
        <Logo />
        <nav className="flex min-w-0 flex-1 justify-end gap-0.5 overflow-x-auto sm:justify-center sm:gap-2">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`bn shrink-0 rounded-lg px-2 py-1.5 text-[15px] sm:px-3 font-medium transition ${
                  active ? "bg-brand-soft text-brand" : "text-body hover:text-brand"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden md:block">
          <Link href="/classroom" className="bn pill pill-primary !py-2">
            শিখতে শুরু করো
          </Link>
        </div>
      </div>
    </header>
  );
}
