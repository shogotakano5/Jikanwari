"use client";

import { useAppData } from "@/contexts/AppDataContext";
import { WEEKDAYS, PERIODS, type Weekday, type Period, type Grade, type Term, type Course, type Semester } from "@/types";

interface Props {
  grade: Grade;
  term: Term;
  day?: Weekday;
  period?: Period;
  onClose: () => void;
}

const SEMESTERS: Semester[] = ["前期", "後期", "通年", "集中"];

export default function ManualCourseDialog({ grade, term, day, period, onClose }: Props) {
  const { addCourses, assignToTimetable } = useAppData();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!name) return;

    const selectedDay = (String(form.get("day") || "") || undefined) as Weekday | undefined;
    const selectedPeriod = form.get("period") ? (Number(form.get("period")) as Period) : undefined;

    const course: Course = {
      id: `manual-${Date.now()}`,
      name,
      teacher: String(form.get("teacher") || "").trim() || "未設定",
      faculty: "経済学部",
      department: "経営経済学科",
      credits: Number(form.get("credits")) || 0,
      targetYears: [grade],
      semester: String(form.get("semester") || "前期") as Semester,
      day: selectedDay,
      period: selectedDay ? selectedPeriod : undefined,
      overview: String(form.get("overview") || "").trim(),
      evaluation: [],
      keywords: [],
      source: "manual",
      cachedAt: Date.now(),
    };

    await addCourses([course]);
    if (selectedDay && selectedPeriod) {
      await assignToTimetable(grade, term, selectedDay, selectedPeriod, course.id);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl dark:bg-zinc-900"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">授業を手入力で追加</h2>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-zinc-400 hover:text-zinc-600">
            ×
          </button>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          シラバス検索に見つからない授業（学外講座など）を、この端末にだけ手入力で登録します。
        </p>
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            科目名 <span className="text-red-500">*</span>
            <input name="name" required className="rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950" />
          </label>
          <label className="flex flex-col gap-1">
            教員
            <input name="teacher" className="rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950" />
          </label>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              単位
              <input
                name="credits"
                type="number"
                min={0}
                defaultValue={2}
                className="rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              学期
              <select
                name="semester"
                defaultValue={term === "集中" ? "集中" : term}
                className="rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
              >
                {SEMESTERS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              曜日
              <select
                name="day"
                defaultValue={day ?? ""}
                className="rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">未定（集中講義等）</option>
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1">
              時限
              <select
                name="period"
                defaultValue={period ?? ""}
                className="rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">-</option>
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p}限
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            概要（任意）
            <textarea name="overview" rows={2} className="rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950" />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
          >
            キャンセル
          </button>
          <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            追加
          </button>
        </div>
      </form>
    </div>
  );
}
