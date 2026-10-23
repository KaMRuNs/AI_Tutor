"use client";

import type { Course } from "@/lib/types";

export function CoursePicker({
  courses,
  value,
  onChange,
}: {
  courses: Course[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <select
      className="field !w-auto !py-2 text-sm"
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Course"
    >
      {value === null && <option value="">Select a course</option>}
      {courses.map((c) => (
        <option key={c.id} value={c.id} className="bg-ink-2">
          {c.name}
        </option>
      ))}
    </select>
  );
}
