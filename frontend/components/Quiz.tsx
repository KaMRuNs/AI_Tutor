"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { QuizItem, QuizResult } from "@/lib/types";
import { Badge, ErrorNote, MasteryBar, Spinner } from "./ui";

export function Quiz({ lessonId }: { lessonId: number }) {
  const [items, setItems] = useState<QuizItem[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    setResult(null);
    setAnswers({});
    try {
      setItems((await api.quiz(lessonId)).items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.submitQuiz(lessonId, answers));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!items) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-dim">Check your understanding. Results update your progress and revision plan.</p>
        <button className="pill pill-primary inline-flex items-center gap-2" onClick={load} disabled={busy}>
          {busy && <Spinner />} {busy ? "Writing questions…" : "Take a quick quiz"}
        </button>
        <ErrorNote message={error} />
      </div>
    );
  }

  const byId = new Map(result?.results.map((r) => [r.item_id, r]));

  return (
    <div className="space-y-4">
      {items.map((q, i) => {
        const r = byId.get(q.id);
        return (
          <div key={q.id} className="rounded-2xl border border-line bg-black/20 p-4">
            <div className="bn mb-3 text-sm text-white">
              {i + 1}. {q.question}
            </div>
            {q.type === "mcq" && q.options ? (
              <div className="grid gap-2">
                {q.options.map((o) => (
                  <label
                    key={o}
                    className={`bn flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                      answers[q.id] === o ? "border-aurora/60 bg-aurora/10" : "border-line"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q${q.id}`}
                      className="accent-[#9be15d]"
                      checked={answers[q.id] === o}
                      onChange={() => setAnswers({ ...answers, [q.id]: o })}
                      disabled={!!result}
                    />
                    {o}
                  </label>
                ))}
              </div>
            ) : (
              <input
                className="field bn text-sm"
                placeholder={q.type === "numeric" ? "Number" : "Your answer"}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                disabled={!!result}
              />
            )}
            {r && (
              <div className={`bn mt-3 rounded-xl px-3 py-2 text-sm ${r.correct ? "bg-aurora/10 text-aurora" : "bg-bad/10 text-bad"}`}>
                {r.correct ? "✓ Correct. " : `✗ Answer: ${r.answer}. `}
                <span className="text-mist">{r.explanation}</span>
              </div>
            )}
          </div>
        );
      })}
      <ErrorNote message={error} />
      {result ? (
        <div className="space-y-3 rounded-2xl border border-line bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-white">
              Score {result.score} / {result.total}
            </span>
            <button className="pill pill-ghost !py-1.5 text-xs" onClick={load}>
              New quiz
            </button>
          </div>
          {result.mastery.map((m) => (
            <div key={m.concept}>
              <div className="mb-1 flex justify-between text-xs">
                <Badge tone="ok">{m.concept}</Badge>
              </div>
              <MasteryBar score={m.score} />
            </div>
          ))}
        </div>
      ) : (
        <button
          className="pill pill-primary inline-flex items-center gap-2"
          onClick={submit}
          disabled={busy || items.some((q) => !answers[q.id]?.trim())}
        >
          {busy && <Spinner />} Submit answers
        </button>
      )}
    </div>
  );
}
