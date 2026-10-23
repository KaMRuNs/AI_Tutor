"use client";

import { useEffect, useState } from "react";
import { api, LANGUAGES } from "@/lib/api";
import type { Language } from "@/lib/types";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand ${className}`}
      aria-label="loading"
    />
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-2 text-sm text-bad">{message}</p>;
}

export function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "ok" | "warn" | "bad" }) {
  const tones = {
    default: "border-line text-muted",
    ok: "border-ok/40 text-ok",
    warn: "border-warn/40 text-warn",
    bad: "border-bad/40 text-bad",
  };
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function LanguagePicker({ value, onChange }: { value: Language; onChange: (l: Language) => void }) {
  return (
    <div className="inline-flex rounded-full border border-line bg-soft p-1" role="radiogroup" aria-label="Teaching language">
      {LANGUAGES.map((l) => (
        <button
          key={l.value}
          role="radio"
          aria-checked={value === l.value}
          onClick={() => onChange(l.value)}
          className={`rounded-full px-3 py-1 text-sm transition ${
            value === l.value ? "bg-brand text-white" : "text-muted hover:text-body"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function MasteryBar({ score }: { score: number | null | undefined }) {
  const s = score ?? 0;
  const label = score == null ? "No data" : s >= 0.75 ? "Strong" : s >= 0.4 ? "Developing" : "Needs revision";
  const color = s >= 0.75 ? "bg-brand" : s >= 0.4 ? "bg-warn" : "bg-bad";
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(s * 100)}%` }} />
      </div>
      <span className="w-28 text-right text-xs text-muted">{label}</span>
    </div>
  );
}

export function ModelStatus() {
  const [s, setS] = useState<null | { ok: boolean; text: string }>(null);
  useEffect(() => {
    api
      .health()
      .then((h) =>
        setS(
          !h.ollama
            ? { ok: false, text: "Ollama is not running" }
            : !h.llm_available
              ? { ok: false, text: `Model ${h.llm_model} not pulled` }
              : { ok: true, text: `${h.llm_model} ready${h.embed_available ? " · embeddings on" : " · keyword search"}` },
        ),
      )
      .catch(() => setS({ ok: false, text: "Backend offline" }));
  }, []);
  if (!s) return null;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-soft px-3 py-1 text-xs text-muted">
      <span className={`h-2 w-2 rounded-full ${s.ok ? "bg-brand" : "bg-bad"}`} />
      {s.text}
    </span>
  );
}
