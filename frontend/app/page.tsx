"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Whiteboard } from "@/components/board/Whiteboard";
import { Badge, ErrorNote, ModelStatus } from "@/components/ui";
import { api } from "@/lib/api";
import type { BoardCommand, Course, Lesson, Profile, Review } from "@/lib/types";

const DEMO_BOARD: BoardCommand[][] = [
  [
    { action: "write_text", id: "h", text: "Binary Search — উদাহরণ", style: "heading" },
    { action: "draw_array", id: "arr", values: [2, 5, 8, 12, 16, 23, 38] },
    { action: "highlight", target: "arr", indices: [3] },
    { action: "write_text", id: "t", text: "mid = 12 < 16 → ডান পাশে খুঁজব", style: "body" },
    { action: "draw_equation", id: "eq", latex: "T(n) = O(\\log n)" },
  ],
];

const FEATURES = [
  { icon: "🧑‍🏫", title: "বাংলায় ব্যাখ্যা", text: "বাংলা, Banglish বা English — technical term ঠিক রেখে", tone: "pastel-blue" },
  { icon: "🖊️", title: "লাইভ হোয়াইটবোর্ড", text: "Array, tree, graph, equation ধাপে ধাপে আঁকা", tone: "pastel-pink" },
  { icon: "📖", title: "পেজ রেফারেন্স", text: "তোমার lecture PDF থেকে সঠিক পেজ উল্লেখ", tone: "pastel-sun" },
  { icon: "📝", title: "কুইজ ও ফিডব্যাক", text: "প্রতিটি লেসনের পর কুইজ, ভুলের ব্যাখ্যা", tone: "pastel-lilac" },
  { icon: "🧠", title: "তোমার ভুল মনে রাখে", text: "আগের ভুল দেখে পরের লেসন সাজায়", tone: "pastel-blue" },
  { icon: "📅", title: "রিভিশন প্ল্যান", text: "কোন টপিক কবে আবার পড়বে, নিজে থেকেই", tone: "pastel-pink" },
];

const STEPS = [
  { n: "১", title: "লেকচার আপলোড", text: "PDF বা নোট দাও" },
  { n: "২", title: "প্রশ্ন করো", text: "বাংলায় বা ইংরেজিতে" },
  { n: "৩", title: "বোর্ডে শেখো", text: "ধাপে ধাপে ব্যাখ্যা" },
  { n: "৪", title: "কুইজ দাও", text: "অগ্রগতি আপডেট হয়" },
];

export default function Home() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.courses(), api.lessons(), api.revision(), api.profile()])
      .then(([c, l, r, p]) => {
        setCourses(c);
        setLessons(l.slice(0, 6));
        setReviews(r);
        setProfile(p);
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
  const docs = courses.reduce((s, c) => s + c.documents, 0);
  const stats = [
    { value: courses.length, label: "কোর্স" },
    { value: docs, label: "লেকচার ডকুমেন্ট" },
    { value: lessons.length ? courses.reduce((s, c) => s + c.lessons, 0) : 0, label: "লেসন সম্পন্ন" },
    { value: profile?.quiz_totals.answered ?? 0, label: "কুইজ প্রশ্নের উত্তর" },
  ];

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="hero-bg -mx-4 rounded-b-[2.5rem] px-4 pt-10 pb-14 sm:-mx-6 sm:px-10">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
          <div className="space-y-6">
            <span className="bn inline-block rounded-full bg-brand-soft px-4 py-1 text-sm font-semibold text-brand">
              তোমার ব্যক্তিগত AI শিক্ষক
            </span>
            <h1 className="bn text-4xl leading-tight sm:text-6xl">
              কঠিন টপিক এখন <br />
              <span className="text-brand">সহজ বাংলায়</span>
            </h1>
            <p className="bn max-w-lg text-lg text-body">
              নিজের lecture PDF আপলোড করো। শিক্ষক হোয়াইটবোর্ডে এঁকে ধাপে ধাপে বুঝিয়ে দেবে, সঠিক পেজ দেখাবে,
              কুইজ নেবে এবং তোমার দুর্বল জায়গা মনে রাখবে।
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/classroom" className="bn pill pill-primary !px-7 !py-3 text-base">
                শিখতে শুরু করো
              </Link>
              <Link href="/library" className="bn pill pill-ghost !px-7 !py-3 text-base">
                লেকচার আপলোড করো
              </Link>
            </div>
            <ModelStatus />
          </div>
          <div className="glass p-4">
            <div className="bn mb-3 rounded-xl bg-blue-soft px-4 py-2.5 text-sm text-navy">
              🙋 binary search-এর time complexity কত? একটা উদাহরণ দেখাও।
            </div>
            <div className="rounded-xl border border-line bg-white p-2">
              <Whiteboard steps={DEMO_BOARD} current={0} />
            </div>
            <p className="bn mt-3 px-1 text-sm text-body">
              🧑‍🏫 আমরা মাঝের মান ১২ পেয়েছি। খোঁজার মান ১৬ বড়, তাই ডান পাশের অংশে খুঁজব।
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-line bg-white px-5 py-4 text-center">
              <div className="bn text-3xl font-bold text-blue-dark">{s.value}</div>
              <div className="bn text-sm text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <ErrorNote message={error} />

      {/* Courses + reviews */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="glass p-6 lg:col-span-2">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="bn text-2xl">তোমার কোর্স</h2>
            <form onSubmit={addCourse} className="flex gap-2">
              <input
                className="field !w-52 !py-2 text-sm"
                placeholder="নতুন কোর্স, যেমন CSE 2201"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button className="pill pill-blue !py-2" disabled={!name.trim()}>
                যোগ করো
              </button>
            </form>
          </div>
          {courses.length === 0 ? (
            <p className="bn text-muted">এখনো কোনো কোর্স নেই। একটি কোর্স তৈরি করে lecture PDF আপলোড করো।</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {courses.map((c, i) => (
                <div key={c.id} className={`rounded-2xl p-5 ${["pastel-blue", "pastel-pink", "pastel-sun", "pastel-lilac"][i % 4]}`}>
                  <div className="bn text-lg font-bold text-navy">{c.name}</div>
                  <div className="bn mt-1 text-sm text-body">
                    {c.documents}টি ডকুমেন্ট · {c.lessons}টি লেসন
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Link href={`/classroom?course=${c.id}`} className="bn pill pill-primary !px-4 !py-1.5 text-sm">
                      শেখো
                    </Link>
                    <Link href={`/library?course=${c.id}`} className="bn pill pill-ghost !px-4 !py-1.5 text-sm">
                      ম্যাটেরিয়াল
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass p-6">
          <h2 className="bn mb-4 text-2xl">আজকের রিভিশন</h2>
          {due.length === 0 ? (
            <p className="bn text-sm text-muted">আজ কিছু বাকি নেই। লেসনের পর কুইজ দিলে রিভিশন প্ল্যান তৈরি হবে।</p>
          ) : (
            <ul className="space-y-2">
              {due.slice(0, 6).map((r) => (
                <li key={r.concept_id}>
                  <Link
                    href={`/classroom?course=${r.course_id}&q=${encodeURIComponent(r.concept)}`}
                    className="flex items-center justify-between rounded-xl border border-line bg-soft px-3 py-2 text-sm hover:border-brand"
                  >
                    <span className="text-navy">{r.concept}</span>
                    <Badge tone="warn">due</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Features */}
      <section>
        <h2 className="bn mb-2 text-center text-3xl">
          কেন <span className="text-brand">শিক্ষকAI</span>?
        </h2>
        <p className="bn mb-8 text-center text-muted">একজন আসল শিক্ষকের মতো — যে তোমাকে মনে রাখে</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className={`rounded-2xl p-6 ${f.tone}`}>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-2xl shadow-sm">{f.icon}</div>
              <div className="bn text-lg font-bold text-navy">{f.title}</div>
              <div className="bn mt-1 text-sm text-body">{f.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="rounded-[2rem] bg-navy px-6 py-10 text-center sm:px-10">
        <h2 className="bn mb-8 text-3xl !text-white">কীভাবে কাজ করে</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl bg-white/10 p-5">
              <div className="bn mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-sun text-xl font-bold text-navy">
                {s.n}
              </div>
              <div className="bn font-bold text-white">{s.title}</div>
              <div className="bn text-sm text-[#d0deef]">{s.text}</div>
            </div>
          ))}
        </div>
        <Link href="/classroom" className="bn pill pill-primary mt-8 !px-8 !py-3 text-base">
          এখনই শুরু করো
        </Link>
      </section>

      {/* Recent lessons */}
      <section className="glass p-6">
        <h2 className="bn mb-4 text-2xl">সাম্প্রতিক লেসন</h2>
        {lessons.length === 0 ? (
          <p className="bn text-sm text-muted">তোমার লেসনগুলো এখানে দেখাবে।</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lessons.map((l) => (
              <Link
                key={l.id}
                href={`/classroom/${l.id}`}
                className="rounded-2xl border border-line bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md"
              >
                <div className="bn line-clamp-1 font-bold text-navy">{l.title}</div>
                <div className="bn mt-1 line-clamp-2 text-sm text-muted">{l.question}</div>
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
