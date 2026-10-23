"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/library", label: "Library" },
  { href: "/classroom", label: "Classroom" },
  { href: "/progress", label: "Progress" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="mx-auto flex w-full max-w-7xl items-center gap-6 px-4 py-6 sm:px-6">
      <Link href="/" className="shrink-0 text-lg font-semibold tracking-wide text-white">
        SHIKKHOK<span className="text-aurora">.AI</span>
      </Link>
      <div className="hidden h-px flex-1 bg-gradient-to-r from-white/30 to-transparent sm:block" />
      <nav className="flex flex-1 justify-end gap-1 sm:flex-none sm:gap-4">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                active ? "text-white" : "text-dim hover:text-mist"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <Link href="/classroom" className="pill pill-ghost hidden md:inline-block">
        Start learning
      </Link>
    </header>
  );
}
