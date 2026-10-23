"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, ErrorNote, MasteryBar } from "@/components/ui";
import { api } from "@/lib/api";
import type { Profile, Review } from "@/lib/types";

export default function ProgressPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([api.profile(), api.revision()])
      .then(([p, r]) => {
        setProfile(p);
        setReviews(r);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function forget(id: number) {
    await api.deleteMemory(id);
    load();
  }

  async function wipe() {
    if (!confirm("Delete all lessons, quiz results, mastery and memories? Courses and documents are kept.")) return;
    await api.deleteMyData();
    load();
  }

  const totals = profile?.quiz_totals;

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-medium text-navy">Your progress</h1>
          <p className="mt-1 text-sm text-muted">Mastery is computed only from quiz results, never from chat frequency.</p>
        </div>
        <div className="flex gap-2">
          <a href={api.exportUrl()} className="pill pill-ghost" target="_blank" rel="noreferrer">
            Export my data
          </a>
          <button onClick={wipe} className="pill pill-ghost hover:!text-bad">
            Delete history
          </button>
        </div>
      </div>

      <ErrorNote message={error} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Questions answered" value={totals?.answered ?? 0} />
        <Stat
          label="Accuracy"
          value={totals?.answered ? `${Math.round((100 * totals.correct) / totals.answered)}%` : "—"}
        />
        <Stat label="Reviews due" value={reviews.filter((r) => r.due).length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass p-6">
          <h2 className="mb-4 text-lg font-medium text-navy">Concept mastery</h2>
          {!profile?.mastery.length ? (
            <p className="text-sm text-muted">Take a quiz after a lesson to see mastery here.</p>
          ) : (
            <ul className="space-y-4">
              {profile.mastery.map((m) => (
                <li key={m.concept_id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-body">{m.concept}</span>
                    <span className="text-xs text-muted">{m.course}</span>
                  </div>
                  <MasteryBar score={m.score} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass p-6">
          <h2 className="mb-4 text-lg font-medium text-navy">Revision plan</h2>
          {!reviews.length ? (
            <p className="text-sm text-muted">No reviews scheduled yet.</p>
          ) : (
            <ul className="space-y-2">
              {reviews.map((r) => (
                <li key={r.concept_id} className="flex items-center justify-between rounded-xl border border-line bg-soft px-3 py-2 text-sm">
                  <span className="text-body">{r.concept}</span>
                  <span className="flex items-center gap-2">
                    {r.due ? <Badge tone="warn">due now</Badge> : <span className="text-xs text-muted">{new Date(r.due_at).toLocaleDateString()}</span>}
                    <Link href={`/classroom?course=${r.course_id}&q=${encodeURIComponent(r.concept)}`} className="text-xs text-brand hover:underline">
                      Review
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="glass p-6">
        <h2 className="mb-1 text-lg font-medium text-navy">Recurring misconceptions</h2>
        <p className="mb-4 text-xs text-muted">
          Each one is linked to the quiz answer that showed it. Your teacher only mentions these when they are relevant.
        </p>
        {!profile?.misconceptions.length ? (
          <p className="text-sm text-muted">None recorded.</p>
        ) : (
          <ul className="space-y-2">
            {profile.misconceptions.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-4 rounded-xl border border-line bg-soft px-3 py-2 text-sm">
                <span className="bn text-body">{m.content}</span>
                <button onClick={() => forget(m.id)} className="shrink-0 text-xs text-muted hover:text-bad">
                  Forget
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass p-5">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-3xl font-medium text-navy">{value}</div>
    </div>
  );
}
