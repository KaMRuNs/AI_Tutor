"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Whiteboard } from "@/components/board/Whiteboard";
import { Badge, ErrorNote, ModelStatus } from "@/components/ui";
import { api } from "@/lib/api";
import type { BoardCommand, Course, Lesson, Review } from "@/lib/types";

const DEMO_BOARD: BoardCommand[][] = [
  [
    { action: "write_text", id: "h", text: "Binary Search — উদাহরণ", style: "heading" },
    { action: "draw_array", id: "arr", values: [2, 5, 8, 12, 16, 23, 38] },
    { action: "highlight", target: "arr", indices: [3] },
    { action: "write_text", id: "t", text: "mid = 12 < 16 → ডান পাশে খুঁজব", style: "body" },
    { action: "draw_equation", id: "eq", latex: "T(n) = O(\\log n)" },
  ],
];

export default function Home() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.courses(), api.lessons(), api.revision()])
      .then(([c, l, r]) => {
        setCourses(c);
        setLessons(l.slice(0, 6));
        setReviews(r);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function addCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const c = await api.createCourse(name.trim());
      router.push(`/library?course=${c.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const due = reviews.filter((r) => r.due);

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="relative overflow-hidden pt-6 pb-28">
        <div className="planet" aria-hidden />
        <div className="relative grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div className="space-y-7">
            <Badge>Gemma 3 · আপনার কোর্স · আপনার ভাষা</Badge>
            <h1 className="text-5xl leading-[1.05] font-medium tracking-tight text-white sm:text-6xl">
              Learn your course <br />
              in <span className="bn text-gradient">বাংলা</span> with <span className="text-gradient">AI</span>
            </h1>
            <p className="max-w-md text-dim">
              Upload your lecture PDFs. Your personal teacher explains each idea step by step on a live whiteboard,
              cites the exact page, quizzes you, and remembers where you struggled.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/classroom" className="pill pill-primary">
                Start learning
              </Link>
              <Link href="/library" className="pill pill-ghost">
                Upload materials
              </Link>
            </div>
            <ModelStatus />
          </div>
          <div className="glass glow-card p-4">
            <div className="mb-3 rounded-xl border border-line bg-black/25 px-4 py-2.5 text-sm text-mist">
              <span className="bn">binary search-এর time complexity কত? একটা উদাহরণ দেখাও।</span>
            </div>
            <div className="rounded-xl border border-line bg-black/20 p-2">
              <Whiteboard steps={DEMO_BOARD} current={0} />
            </div>
            <p className="bn mt-3 px-1 text-sm text-dim">
              আমরা মাঝের মান ১২ পেয়েছি। খোঁজার মান ১৬ বড়, তাই ডান পাশের অংশে খুঁজব।
            </p>
          </div>
        </div>
      </section>

      <ErrorNote message={error} />

      <section className="grid gap-6 lg:grid-cols-3">
        {/* Courses */}
        <div className="glass p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Your courses</h2>
            <form onSubmit={addCourse} className="flex gap-2">
              <input
                className="field !w-48 !py-1.5 text-sm"
                placeholder="New course, e.g. CSE 2201"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button className="pill pill-ghost !py-1.5" disabled={!name.trim()}>
                Add
              </button>
            </form>
          </div>
          {courses.length === 0 ? (
            <p className="text-sm text-dim">No courses yet. Create one, then upload a lecture PDF.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {courses.map((c) => (
                <div key={c.id} className="rounded-2xl border border-line bg-black/20 p-4">
                  <div className="font-medium text-white">{c.name}</div>
                  <div className="mt-1 text-xs text-dim">
                    {c.documents} documents · {c.lessons} lessons
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Link href={`/classroom?course=${c.id}`} className="pill pill-primary !px-4 !py-1.5 text-xs">
                      Learn
                    </Link>
                    <Link href={`/library?course=${c.id}`} className="pill pill-ghost !px-4 !py-1.5 text-xs">
                      Materials
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reviews */}
        <div className="glass p-6">
          <h2 className="mb-4 text-lg font-medium text-white">Review today</h2>
          {due.length === 0 ? (
            <p className="text-sm text-dim">Nothing due. Take a quiz after a lesson to build your revision plan.</p>
          ) : (
            <ul className="space-y-2">
              {due.slice(0, 6).map((r) => (
                <li key={r.concept_id}>
                  <Link
                    href={`/classroom?course=${r.course_id}&q=${encodeURIComponent(r.concept)}`}
                    className="flex items-center justify-between rounded-xl border border-line bg-black/20 px-3 py-2 text-sm hover:border-aurora/40"
                  >
                    <span className="text-mist">{r.concept}</span>
                    <Badge tone="warn">due</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Recent lessons */}
      <section className="glass p-6">
        <h2 className="mb-4 text-lg font-medium text-white">Recent lessons</h2>
        {lessons.length === 0 ? (
          <p className="text-sm text-dim">Your lessons will appear here.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lessons.map((l) => (
              <Link
                key={l.id}
                href={`/classroom/${l.id}`}
                className="rounded-2xl border border-line bg-black/20 p-4 transition hover:border-aurora/40"
              >
                <div className="bn line-clamp-1 font-medium text-white">{l.title}</div>
                <div className="bn mt-1 line-clamp-2 text-sm text-dim">{l.question}</div>
                <div className="mt-3 flex gap-2">
                  <Badge>{l.language}</Badge>
                  {l.concept && <Badge tone="ok">{l.concept}</Badge>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
