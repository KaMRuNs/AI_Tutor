import type { Course, Doc, Language, Lesson, Profile, QuizItem, QuizResult, Review } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? API_URL.replace(/^http/, "ws");

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new Error("Cannot reach the backend. Is it running on " + API_URL + "?");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: () => req<{ ollama: boolean; llm_available: boolean; embed_available: boolean; llm_model: string }>("/api/health"),
  courses: () => req<Course[]>("/api/courses"),
  createCourse: (name: string, description = "") => req<Course>("/api/courses", json({ name, description })),
  documents: (courseId: number) => req<Doc[]>(`/api/documents?course_id=${courseId}`),
  upload: (courseId: number, file: File) => {
    const fd = new FormData();
    fd.append("course_id", String(courseId));
    fd.append("file", file);
    return req<Doc>("/api/documents", { method: "POST", body: fd });
  },
  deleteDocument: (id: number) => req<{ ok: boolean }>(`/api/documents/${id}`, { method: "DELETE" }),
  documentUrl: (id: number, page?: number) => `${API_URL}/api/documents/${id}/file${page ? `#page=${page}` : ""}`,
  startLesson: (course_id: number, question: string, language: Language) =>
    req<Lesson>("/api/lessons", json({ course_id, question, language })),
  lessons: (courseId?: number) => req<Lesson[]>(`/api/lessons${courseId ? `?course_id=${courseId}` : ""}`),
  lesson: (id: number) => req<Lesson>(`/api/lessons/${id}`),
  quiz: (lesson_id: number, n = 3) => req<{ items: QuizItem[] }>("/api/quizzes", json({ lesson_id, n })),
  submitQuiz: (lessonId: number, answers: Record<number, string>) =>
    req<QuizResult>(`/api/quizzes/${lessonId}/submit`, json({ answers })),
  profile: () => req<Profile>("/api/learning-profile"),
  revision: () => req<Review[]>("/api/revision-plan"),
  deleteMemory: (id: number) => req<{ ok: boolean }>(`/api/memories/${id}`, { method: "DELETE" }),
  deleteMyData: () => req<{ ok: boolean }>("/api/me/data", { method: "DELETE" }),
  exportUrl: () => `${API_URL}/api/me/export`,
};

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: "bangla", label: "বাংলা" },
  { value: "banglish", label: "Banglish" },
  { value: "english", label: "English" },
];
