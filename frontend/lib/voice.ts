// Browser speech fallbacks (plan.md §6). A server STT/TTS can replace these later behind the same calls.

import type { Language } from "./types";

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickVoice(lang: Language): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  if (lang === "english") return voices.find((v) => v.lang.startsWith("en"));
  return voices.find((v) => v.lang.startsWith("bn")) ?? voices.find((v) => v.lang.startsWith("hi"));
}

/** Speak only the step's `say` text (CLAUDE.md rule 6). Resolves when finished or cancelled. */
export function speak(text: string, lang: Language, rate = 1): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsSupported() || !text.trim()) return resolve();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.lang = v?.lang ?? (lang === "english" ? "en-US" : "bn-BD");
    u.rate = rate;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

export function sttSupported(): boolean {
  return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
}

/** Push-to-talk recognition. Calls onText with the live transcript; returns a stop function. */
export function listen(lang: Language, onText: (t: string) => void, onEnd: () => void): () => void {
  const w = window as unknown as Record<string, new () => Recognition>;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) {
    onEnd();
    return () => {};
  }
  const r = new Ctor();
  r.lang = lang === "english" ? "en-US" : "bn-BD";
  r.interimResults = true;
  r.continuous = false;
  r.onresult = (e) => {
    let text = "";
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    onText(text);
  };
  r.onerror = onEnd;
  r.onend = onEnd;
  r.start();
  return () => r.stop();
}
