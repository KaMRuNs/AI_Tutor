"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CoursePicker } from "@/components/CoursePicker";
import { ErrorNote, LanguagePicker, ModelStatus, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Course, Language, Lesson } from "@/lib/types";

const SUGGESTIONS = [
  "binary search-এর time complexity কত? একটা উদাহরণ দেখাও।",
  "Deadlock prevention বাংলায় বুঝিয়ে দাও",
  "BFS আর DFS এর পার্থক্য কী?",
  "Explain recursion with a tree diagram",
];

function NewLesson() {
  const params = useSearchParams();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<number | null>(params.get("course") ? Number(params.get("course")) : null);
  const [question, setQuestion] = useState(params.get("q") ?? "");
  const [language, setLanguage] = useState<Language>("bangla");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Lesson[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("language") as Language | null;
      if (saved) setLanguage(saved);
    } catch {}
    api
      .courses()
      .then((c) => {
        setCourses(c);
        setCourseId((cur) => cur ?? c[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (courseId) api.lessons(courseId).then((l) => setRecent(l.slice(0, 5))).catch(() => {});
  }, [courseId]);

  function pickLanguage(l: Language) {
    setLanguage(l);
    try {
      localStorage.setItem("language", l);
    } catch {}
  }

  async function start(e?: React.FormEvent) {
    e?.preventDefault();
    if (!courseId || question.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const lesson = await api.startLesson(courseId, question.trim(), language);
      router.push(`/classroom/${lesson.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (courses.length === 0 && !error) {
    return (
      <div className="glass mx-auto mt-10 max-w-xl p-8 text-center">
        <p className="text-mist">Create a course and upload a lecture first.</p>
        <Link href="/library" className="pill pill-primary mt-5 inline-block">
          Go to library
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pt-8">
      <div className="text-center">
        <h1 className="text-4xl font-medium text-white">
          What should we learn <span className="text-gradient">today</span>?
        </h1>
        <p className="mt-2 text-dim">Ask in Bangla, Banglish or English. Your teacher will use your course materials.</p>
      </div>

      <form onSubmit={start} className="glass glow-card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CoursePicker courses={courses} value={courseId} onChange={setCourseId} />
          <LanguagePicker value={language} onChange={pickLanguage} />
        </div>
        <textarea
          className="field bn min-h-28 resize-none text-base"
          placeholder="যেমন: binary search কীভাবে কাজ করে?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              start();
            }
          }}
          disabled={busy}
        />
        <div className="flex items-center justify-between gap-3">
          <ModelStatus />
          <button className="pill pill-primary inline-flex items-center gap-2" disabled={busy || !courseId || question.trim().length < 2}>
            {busy && <Spinner />} {busy ? "Preparing lesson…" : "Start lesson"}
          </button>
        </div>
        {busy && <p className="bn text-center text-sm text-dim">শিক্ষক আপনার lecture notes পড়ছেন এবং lesson তৈরি করছেন…</p>}
      </form>

      <ErrorNote message={error} />

      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => setQuestion(s)} className="bn pill pill-ghost !py-1.5 text-xs">
            {s}
          </button>
        ))}
      </div>

      {recent.length > 0 && (
        <div className="glass p-5">
          <h2 className="mb-3 text-sm text-dim">Recent lessons in this course</h2>
          <ul className="space-y-1">
            {recent.map((l) => (
              <li key={l.id}>
                <Link href={`/classroom/${l.id}`} className="bn block rounded-lg px-2 py-1.5 text-sm text-mist hover:bg-white/5">
                  {l.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ClassroomPage() {
  return (
    <Suspense>
      <NewLesson />
    </Suspense>
  );
}
