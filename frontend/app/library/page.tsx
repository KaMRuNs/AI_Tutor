"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CoursePicker } from "@/components/CoursePicker";
import { Badge, ErrorNote, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Course, Doc } from "@/lib/types";

function Library() {
  const params = useSearchParams();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<number | null>(params.get("course") ? Number(params.get("course")) : null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .courses()
      .then((c) => {
        setCourses(c);
        setCourseId((cur) => cur ?? c[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  const refresh = useCallback(() => {
    if (courseId) api.documents(courseId).then(setDocs).catch((e) => setError(e.message));
  }, [courseId]);

  useEffect(refresh, [refresh]);

  // Poll while anything is processing.
  useEffect(() => {
    if (!docs.some((d) => d.status === "processing")) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [docs, refresh]);

  async function upload(files: FileList | null) {
    if (!files || !courseId) return;
    setUploading(true);
    setError(null);
    try {
      for (const f of Array.from(files)) await api.upload(courseId, f);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    try {
      const c = await api.createCourse(newName.trim());
      setCourses((cs) => [...cs, c]);
      setCourseId(c.id);
      setNewName("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function selectCourse(id: number) {
    setCourseId(id);
    router.replace(`/library?course=${id}`);
  }

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium text-white">Course library</h1>
          <p className="mt-1 text-sm text-dim">Upload lecture PDFs or notes. They become searchable for your teacher.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {courses.length > 0 && <CoursePicker courses={courses} value={courseId} onChange={selectCourse} />}
          <form onSubmit={createCourse} className="flex gap-2">
            <input className="field !w-44 !py-2 text-sm" placeholder="New course" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="pill pill-ghost" disabled={!newName.trim()}>
              Create
            </button>
          </form>
        </div>
      </div>

      <ErrorNote message={error} />

      {courseId ? (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              upload(e.dataTransfer.files);
            }}
            onClick={() => input.current?.click()}
            className={`glass flex cursor-pointer flex-col items-center justify-center gap-3 border-dashed py-14 text-center transition ${
              drag ? "!border-aurora/70" : ""
            }`}
          >
            <input ref={input} type="file" accept=".pdf,.txt" multiple hidden onChange={(e) => upload(e.target.files)} />
            {uploading ? <Spinner className="!h-6 !w-6" /> : <div className="text-3xl">📄</div>}
            <div className="text-white">Drop PDF or TXT files here, or click to browse</div>
            <div className="text-xs text-dim">Scanned pages are read with Gemma vision · max 40 MB</div>
          </div>

          <div className="glass overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-dim">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-normal">Document</th>
                  <th className="px-5 py-3 font-normal">Pages</th>
                  <th className="px-5 py-3 font-normal">Chunks</th>
                  <th className="px-5 py-3 font-normal">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {docs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-dim">
                      No documents yet.
                    </td>
                  </tr>
                )}
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-line/50 last:border-0">
                    <td className="px-5 py-3">
                      <a href={api.documentUrl(d.id)} target="_blank" rel="noreferrer" className="text-mist hover:text-aurora">
                        {d.filename}
                      </a>
                      {d.error && <div className="text-xs text-bad">{d.error}</div>}
                    </td>
                    <td className="px-5 py-3 text-dim">{d.page_count || "—"}</td>
                    <td className="px-5 py-3 text-dim">{d.chunks || "—"}</td>
                    <td className="px-5 py-3">
                      {d.status === "processing" ? (
                        <span className="inline-flex items-center gap-2 text-dim">
                          <Spinner /> processing
                        </span>
                      ) : (
                        <Badge tone={d.status === "ready" ? "ok" : "bad"}>{d.status}</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        className="text-xs text-dim hover:text-bad"
                        onClick={async () => {
                          if (!confirm(`Delete ${d.filename}?`)) return;
                          await api.deleteDocument(d.id);
                          refresh();
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {docs.some((d) => d.status === "ready") && (
            <div className="flex justify-end">
              <button className="pill pill-primary" onClick={() => router.push(`/classroom?course=${courseId}`)}>
                Start a lesson →
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="text-dim">Create a course to start uploading materials.</p>
      )}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense>
      <Library />
    </Suspense>
  );
}
