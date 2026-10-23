"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Whiteboard } from "@/components/board/Whiteboard";
import { Quiz } from "@/components/Quiz";
import { Badge, ErrorNote, Spinner } from "@/components/ui";
import { api, WS_URL } from "@/lib/api";
import type { BoardCommand, Citation, Language, Lesson, TranscriptEntry } from "@/lib/types";
import { listen, speak, stopSpeaking, sttSupported, ttsSupported } from "@/lib/voice";

type ServerMsg = { type: string; data: Record<string, unknown> };

export default function ClassroomLesson() {
  const { id } = useParams<{ id: string }>();
  const lessonId = Number(id);

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [stepCount, setStepCount] = useState(0);
  const [current, setCurrent] = useState(0);
  const [boards, setBoards] = useState<BoardCommand[][]>([]);
  const [extras, setExtras] = useState<Record<number, BoardCommand[]>>({});
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [checkQ, setCheckQ] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [question, setQuestion] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [rate, setRate] = useState(1);
  const [listening, setListening] = useState(false);
  const [tab, setTab] = useState<"board" | "talk">("board");
  const [error, setError] = useState<string | null>(null);
  // Browser-only capabilities; checked after mount to avoid hydration mismatches.
  const [hasTTS, setHasTTS] = useState(false);
  const [hasSTT, setHasSTT] = useState(false);
  useEffect(() => {
    setHasTTS(ttsSupported());
    setHasSTT(sttSupported());
  }, []);

  const ws = useRef<WebSocket | null>(null);
  const stopListen = useRef<() => void>(() => {});
  const seen = useRef(new Set<number>());
  const settings = useRef({ voiceOn, autoPlay, rate, language: "bangla" as Language, stepCount: 0 });
  settings.current = { voiceOn, autoPlay, rate, language: lesson?.language ?? "bangla", stepCount };
  const scroller = useRef<HTMLDivElement>(null);

  const send = useCallback((type: string, data: Record<string, unknown> = {}) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type, data }));
  }, []);

  const narrate = useCallback(
    async (text: string, index?: number) => {
      const s = settings.current;
      if (!s.voiceOn) return;
      await speak(text, s.language, s.rate);
      if (settings.current.autoPlay && index !== undefined && index < settings.current.stepCount - 1) send("next");
    },
    [send],
  );

  useEffect(() => {
    api.lesson(lessonId).then(setLesson).catch((e) => setError(e.message));
    const sock = new WebSocket(`${WS_URL}/ws/lessons/${lessonId}`);
    ws.current = sock;
    sock.onopen = () => setConnected(true);
    sock.onclose = () => setConnected(false);
    sock.onerror = () => setError("Lost connection to the classroom server.");
    sock.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerMsg;
      const d = msg.data;
      switch (msg.type) {
        case "lesson.meta":
          setStepCount(d.step_count as number);
          break;
        case "lesson.step": {
          const index = d.index as number;
          setCurrent(index);
          if (!seen.current.has(index)) {
            seen.current.add(index);
            setTranscript((t) => [...t, { kind: "step", text: d.say as string, index, citations: d.citations as Citation[] }]);
          }
          narrate(d.say as string, index);
          break;
        }
        case "board.cmd": {
          const index = d.index as number;
          setBoards((b) => {
            const next = [...b];
            next[index] = d.commands as BoardCommand[];
            return next;
          });
          break;
        }
        case "lesson.check":
          setCheckQ(d.question as string);
          break;
        case "teacher.thinking":
          setThinking(true);
          break;
        case "teacher.answer": {
          setThinking(false);
          const after = d.after_index as number;
          const cmds = d.board as BoardCommand[];
          if (cmds.length) setExtras((x) => ({ ...x, [after]: [...(x[after] ?? []), ...cmds] }));
          setTranscript((t) => [...t, { kind: "teacher", text: d.say as string, citations: d.citations as Citation[] }]);
          narrate(d.say as string);
          break;
        }
        case "lesson.paused":
          break;
        case "error":
          setThinking(false);
          setTranscript((t) => [...t, { kind: "system", text: d.message as string }]);
          break;
      }
    };
    return () => {
      stopSpeaking();
      sock.close();
    };
  }, [lessonId, narrate]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [transcript, thinking]);

  const boardSteps = useMemo(
    () => boards.map((b, i) => [...(b ?? []), ...(extras[i] ?? [])]),
    [boards, extras],
  );

  const go = useCallback(
    (dir: "next" | "prev") => {
      stopSpeaking();
      send(dir);
    },
    [send],
  );

  function ask(e?: React.FormEvent) {
    e?.preventDefault();
    const text = question.trim();
    if (!text) return;
    stopSpeaking();
    send("ask", { text });
    setTranscript((t) => [...t, { kind: "student", text }]);
    setQuestion("");
  }

  function toggleMic() {
    if (listening) {
      stopListen.current();
      return;
    }
    // Interrupt: stop the teacher before listening.
    stopSpeaking();
    send("student.interrupt", { at_index: current });
    setListening(true);
    stopListen.current = listen(lesson?.language ?? "bangla", setQuestion, () => setListening(false));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (e.key === "ArrowRight") go("next");
      if (e.key === "ArrowLeft") go("prev");
      if (e.key === " ") {
        e.preventDefault();
        stopSpeaking();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const atEnd = stepCount > 0 && current === stepCount - 1;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/classroom" className="text-xs text-dim hover:text-mist">
            ← New lesson
          </Link>
          <h1 className="bn truncate text-2xl font-medium text-white">{lesson?.title ?? "Loading lesson…"}</h1>
          {lesson && (
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge>{lesson.language}</Badge>
              {lesson.concept && <Badge tone="ok">{lesson.concept}</Badge>}
              {!lesson.grounded && <Badge tone="warn">not in your materials</Badge>}
              {lesson.fallback && <Badge tone="warn">text-only fallback</Badge>}
              {!connected && <Badge tone="bad">offline</Badge>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {hasTTS && (
            <>
              <label className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-dim">
                <input type="checkbox" className="accent-[#9be15d]" checked={voiceOn} onChange={(e) => {
                  setVoiceOn(e.target.checked);
                  if (!e.target.checked) stopSpeaking();
                }} />
                Voice
              </label>
              <label className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-dim">
                <input type="checkbox" className="accent-[#9be15d]" checked={autoPlay} onChange={(e) => setAutoPlay(e.target.checked)} disabled={!voiceOn} />
                Auto-play
              </label>
              <select className="field !w-auto !rounded-full !py-1.5 text-xs" value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Speech speed">
                {[0.8, 1, 1.2].map((r) => (
                  <option key={r} value={r} className="bg-ink-2">
                    {r}×
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      <ErrorNote message={error} />

      {/* Mobile tabs */}
      <div className="flex gap-2 lg:hidden">
        {(["board", "talk"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`pill flex-1 ${tab === t ? "pill-primary" : "pill-ghost"}`}>
            {t === "board" ? "Whiteboard" : "Teacher"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {/* Board */}
        <section className={`glass flex flex-col p-3 ${tab === "board" ? "" : "hidden lg:flex"}`}>
          <div className="min-h-[340px] flex-1 rounded-xl border border-line bg-black/25 p-2">
            {boardSteps.length ? (
              <Whiteboard steps={boardSteps} current={current} />
            ) : (
              <div className="flex h-full items-center justify-center text-dim">
                <Spinner />
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <button className="pill pill-ghost" onClick={() => go("prev")} disabled={current === 0}>
              ← Previous
            </button>
            <div className="flex flex-1 items-center justify-center gap-1.5" aria-label={`Step ${current + 1} of ${stepCount}`}>
              {Array.from({ length: stepCount }, (_, i) => (
                <button
                  key={i}
                  onClick={() => seen.current.has(i) && send("goto", { index: i })}
                  className={`h-2 rounded-full transition-all ${i === current ? "w-8 bg-aurora" : seen.current.has(i) ? "w-2 bg-aurora/50" : "w-2 bg-white/15"}`}
                  aria-label={`Step ${i + 1}`}
                />
              ))}
            </div>
            <button className="pill pill-primary" onClick={() => go("next")} disabled={atEnd || stepCount === 0}>
              Next →
            </button>
          </div>
        </section>

        {/* Transcript + ask */}
        <section className={`glass flex max-h-[78vh] flex-col p-4 ${tab === "talk" ? "" : "hidden lg:flex"}`}>
          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto pr-1">
            {transcript.map((t, i) => (
              <TranscriptRow key={i} entry={t} active={t.kind === "step" && t.index === current} />
            ))}
            {thinking && (
              <div className="flex items-center gap-2 text-sm text-dim">
                <Spinner /> <span className="bn">শিক্ষক ভাবছেন…</span>
              </div>
            )}
            {checkQ && atEnd && (
              <div className="rounded-2xl border border-aurora/30 bg-aurora/5 p-3">
                <div className="mb-1 text-xs text-aurora">Check your understanding</div>
                <div className="bn text-sm text-white">{checkQ}</div>
                <div className="mt-2 text-xs text-dim">Type your answer below and the teacher will respond, or take the quiz.</div>
              </div>
            )}
          </div>

          <form onSubmit={ask} className="mt-3 flex items-end gap-2 border-t border-line pt-3">
            {hasSTT && (
              <button
                type="button"
                onClick={toggleMic}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${
                  listening ? "recording border-aurora bg-aurora text-ink" : "border-line text-mist hover:border-aurora/50"
                }`}
                aria-label={listening ? "Stop recording" : "Ask by voice"}
                title="Push to talk"
              >
                🎙
              </button>
            )}
            <textarea
              className="field bn max-h-28 min-h-11 resize-none text-sm"
              rows={1}
              placeholder={listening ? "শুনছি…" : "প্রশ্ন করুন: কেন? আরেকটা উদাহরণ দাও…"}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask();
                }
              }}
            />
            <button className="pill pill-primary shrink-0" disabled={!question.trim() || !connected || thinking}>
              Ask
            </button>
          </form>
        </section>
      </div>

      {atEnd && (
        <section className="glass p-5">
          <h2 className="mb-3 text-lg font-medium text-white">Quiz</h2>
          <Quiz lessonId={lessonId} />
        </section>
      )}
    </div>
  );
}

function TranscriptRow({ entry, active }: { entry: TranscriptEntry; active: boolean }) {
  if (entry.kind === "student") {
    return (
      <div className="flex justify-end">
        <div className="bn max-w-[85%] rounded-2xl rounded-br-md bg-aurora/15 px-3 py-2 text-sm text-white">{entry.text}</div>
      </div>
    );
  }
  if (entry.kind === "system") {
    return <div className="bn rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{entry.text}</div>;
  }
  return (
    <div className={`rounded-2xl border px-3 py-2 transition ${active ? "border-aurora/40 bg-aurora/5" : "border-transparent"}`}>
      {entry.kind === "step" && <div className="mb-1 text-[11px] tracking-wide text-dim uppercase">Step {entry.index! + 1}</div>}
      <p className="bn text-[15px] leading-relaxed text-mist">{entry.text}</p>
      {!!entry.citations?.length && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entry.citations.map((c) => (
            <a
              key={c.id}
              href={api.documentUrl(c.document_id, c.page)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-line px-2 py-0.5 text-[11px] text-dim hover:border-aurora/50 hover:text-aurora"
            >
              📖 {c.document} · p.{c.page}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
