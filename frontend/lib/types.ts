// Mirrors backend/app/board/schemas.py and API responses. Keep in sync.

export type Language = "bangla" | "banglish" | "english";

export type BoardCommand =
  | { action: "write_text"; id: string; text: string; style?: "heading" | "body" | "note" }
  | { action: "draw_array"; id: string; values: (string | number)[]; label?: string }
  | { action: "draw_node"; id: string; label: string; group?: string }
  | { action: "draw_edge"; id: string; from_id: string; to_id: string; label?: string; directed?: boolean }
  | { action: "draw_arrow"; id: string; from_id: string; to_id: string; label?: string }
  | { action: "draw_equation"; id: string; latex: string }
  | { action: "highlight"; target: string; indices?: number[]; color?: "accent" | "success" | "warning" }
  | { action: "clear_region"; ids: string[] }
  | { action: "next_step" };

export interface Citation {
  id: string;
  document: string;
  page: number;
  document_id: number;
}

export interface Step {
  index: number;
  say: string;
  board: BoardCommand[];
  citations: Citation[];
}

export interface Lesson {
  id: number;
  course_id: number;
  title: string;
  question: string;
  language: Language;
  fallback: boolean;
  grounded: boolean;
  check_question: string | null;
  concept?: string | null;
  mastery?: number | null;
  created_at: string;
  steps?: Step[];
}

export interface Course {
  id: number;
  name: string;
  description: string;
  documents: number;
  lessons: number;
}

export interface Doc {
  id: number;
  course_id: number;
  filename: string;
  kind: string;
  status: "processing" | "ready" | "failed";
  error: string | null;
  page_count: number;
  chunks: number;
  created_at: string;
}

export interface QuizItem {
  id: number;
  type: "mcq" | "numeric" | "short";
  question: string;
  options: string[] | null;
}

export interface QuizResult {
  results: { item_id: number; correct: boolean; explanation: string; answer: string }[];
  score: number;
  total: number;
  mastery: { concept: string; score: number }[];
}

export interface Profile {
  preferences: Record<string, unknown>;
  mastery: { concept_id: number; concept: string; course: string; score: number; updated_at: string }[];
  misconceptions: { id: number; content: string; evidence: { type: string; id: number }; created_at: string }[];
  quiz_totals: { answered: number; correct: number };
}

export interface Review {
  concept_id: number;
  concept: string;
  course_id: number;
  due_at: string;
  due: boolean;
  interval_days: number;
  mastery: number | null;
}

/** Transcript entries shown next to the board. */
export interface TranscriptEntry {
  kind: "step" | "student" | "teacher" | "system";
  text: string;
  index?: number;
  citations?: Citation[];
}
