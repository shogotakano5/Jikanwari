"use client";

import { useMemo, useState } from "react";
import { useAppData, timetableSlotId } from "@/contexts/AppDataContext";
import { PERIODS, WEEKDAYS, TERMS, GRADES, type Grade, type Period, type Term, type Weekday } from "@/types";
import { gradeMatchesCourse, termMatchesSemester } from "@/lib/timetable";
import { findRequirementSet } from "@/lib/graduation-requirements";
import CellDetailModal from "./CellDetailModal";

const DISPLAY_DAYS: Weekday[] = WEEKDAYS.slice(0, 5); // 月〜金

export default function TimetableGrid() {
  const { courses, timetable, ready, assignToTimetable, settings } = useAppData();
  const [grade, setGrade] = useState<Grade>(1);
  const [term, setTerm] = useState<Term>("前期");
  const [selected, setSelected] = useState<{ day: Weekday; period: Period } | null>(null);
  const [autoPlaceMessage, setAutoPlaceMessage] = useState<string | null>(null);

  const requirementSet = useMemo(
    () => findRequirementSet(settings.entryYear, settings.faculty, settings.department),
    [settings.entryYear, settings.faculty, settings.department]
  );

  const scopedTimetable = useMemo(
    () => timetable.filter((t) => t.grade === grade && t.term === term),
    [timetable, grade, term]
  );

  async function autoPlaceRequired() {
    if (!requirementSet) return;
    const requiredCourses = courses.filter(
      (c) =>
        (c.categoryKey === "必修" || requirementSet.categories.some((cat) => cat.matchNames?.includes(c.name) && cat.label === "必修")) &&
        gradeMatchesCourse(c, grade) &&
        termMatchesSemester(c.semester, term)
    );
    let placed = 0;
    let skipped = 0;
    for (const course of requiredCourses) {
      const id = timetableSlotId(grade, term, course.day, course.period);
      const existing = timetable.find((t) => t.id === id);
      if (!existing) {
        await assignToTimetable(grade, term, course.day, course.period, course.id);
        placed += 1;
      } else if (existing.courseId !== course.id) {
        skipped += 1;
      }
    }
    setAutoPlaceMessage(
      `${grade}年 ${term} の必修を${placed}件配置しました。${skipped > 0 ? `${skipped}件は同じ時間に別の授業が既にあるため保留です。` : ""}`
    );
  }

  if (!ready) {
    return <p className="p-6 text-center text-sm text-zinc-400">読み込み中...</p>;
  }

  return (
    <div className="p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={grade}
          onChange={(e) => setGrade(Number(e.target.value) as Grade)}
          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}年
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
          {TERMS.map((t) => (
            <button
              key={t}
              onClick={() => setTerm(t)}
              className={`px-3 py-1.5 text-sm ${
                term === t ? "bg-blue-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={autoPlaceRequired}
          className="ml-auto rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
        >
          必修を自動配置
        </button>
      </div>
      {autoPlaceMessage && <p className="mb-2 text-xs text-blue-600 dark:text-blue-400">{autoPlaceMessage}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-10 text-xs text-zinc-400"></th>
              {DISPLAY_DAYS.map((day) => (
                <th key={day} className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((period) => (
              <tr key={period}>
                <td className="text-center text-xs font-semibold text-zinc-400">{period}限</td>
                {DISPLAY_DAYS.map((day) => {
                  const entry = scopedTimetable.find((t) => t.day === day && t.period === period);
                  const course = entry ? courses.find((c) => c.id === entry.courseId) : undefined;
                  return (
                    <td key={day}>
                      <button
                        onClick={() => setSelected({ day, period })}
                        className={`flex h-20 w-full flex-col items-center justify-center rounded-lg border p-1 text-center transition-colors ${
                          course
                            ? "border-blue-200 bg-blue-50 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:hover:bg-blue-950/70"
                            : "border-dashed border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {course ? (
                          <>
                            <span className="line-clamp-2 text-xs font-semibold text-blue-800 dark:text-blue-200">{course.name}</span>
                            <span className="text-[10px] text-blue-500 dark:text-blue-300">{course.teacher}</span>
                          </>
                        ) : (
                          <span className="text-lg text-zinc-300 dark:text-zinc-700">+</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <CellDetailModal grade={grade} term={term} day={selected.day} period={selected.period} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
