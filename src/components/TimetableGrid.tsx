"use client";

import { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { PERIODS, WEEKDAYS, type Period, type Weekday } from "@/types";
import CellDetailModal from "./CellDetailModal";

const DISPLAY_DAYS: Weekday[] = WEEKDAYS.slice(0, 5); // 月〜金

export default function TimetableGrid() {
  const { courses, timetable, ready } = useAppData();
  const [selected, setSelected] = useState<{ day: Weekday; period: Period } | null>(null);

  if (!ready) {
    return <p className="p-6 text-center text-sm text-zinc-400">読み込み中...</p>;
  }

  return (
    <div className="overflow-x-auto p-3">
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
                const entry = timetable.find((t) => t.day === day && t.period === period);
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

      {selected && <CellDetailModal day={selected.day} period={selected.period} onClose={() => setSelected(null)} />}
    </div>
  );
}
