"use client";

import { Fragment, useMemo, useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { PERIODS, WEEKDAYS, TERMS, GRADES, type Grade, type Period, type Term, type Weekday } from "@/types";
import { autoPlaceRequiredCourses, expectedSyllabusYear } from "@/lib/timetable";
import { findRequirementSet } from "@/lib/graduation-requirements";
import CellDetailModal from "./CellDetailModal";

const DISPLAY_DAYS: Weekday[] = WEEKDAYS; // 月〜土

export default function TimetableGrid() {
  const { courses, timetable, ready, assignToTimetable, settings } = useAppData();
  const [grade, setGrade] = useState<Grade>(1);
  const [term, setTerm] = useState<Term>("前期");
  const [selected, setSelected] = useState<{ day: Weekday; period: Period } | null>(null);
  const [autoPlaceMessage, setAutoPlaceMessage] = useState<string | null>(null);

  const requirementSet = useMemo(
    () => findRequirementSet(settings.entryYear, settings.faculty, settings.department, settings.selectedCourse),
    [settings.entryYear, settings.faculty, settings.department, settings.selectedCourse]
  );

  const scopedTimetable = useMemo(
    () => timetable.filter((t) => t.grade === grade && t.term === term),
    [timetable, grade, term]
  );

  // その学年に在籍していたのは西暦何年度か（入学年度+学年-1）。時間割の候補は
  // この年度のシラバスから選ぶ（例: 2024年度入学の3年次なら2026年度のシラバス）。
  const syllabusYear = expectedSyllabusYear(settings.entryYear, grade);
  const hasSyllabusForYear = useMemo(() => courses.some((c) => c.syllabusYear === syllabusYear), [courses, syllabusYear]);

  async function autoPlaceRequired() {
    if (!requirementSet) return;
    const { placed, skipped } = await autoPlaceRequiredCourses(courses, timetable, requirementSet, grade, term, assignToTimetable, syllabusYear);
    setAutoPlaceMessage(
      `${grade}年 ${term} の必修を${placed}件配置しました。${skipped > 0 ? `${skipped}件は同じ時間に別の授業が既にあるため保留です。` : ""}`
    );
  }

  if (!ready) {
    return <p className="p-6 text-center text-sm text-zinc-400">読み込み中...</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-2 sm:h-auto sm:p-3">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 sm:mb-3">
        <select
          value={grade}
          onChange={(e) => setGrade(Number(e.target.value) as Grade)}
          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 sm:py-1.5 sm:text-sm"
        >
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}年（{expectedSyllabusYear(settings.entryYear, g)}年度）
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700">
          {TERMS.map((t) => (
            <button
              key={t}
              onClick={() => setTerm(t)}
              className={`px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm ${
                term === t ? "bg-blue-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={autoPlaceRequired}
          className="ml-auto rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 sm:px-3 sm:py-1.5 sm:text-sm"
        >
          必修を自動配置
        </button>
      </div>
      {autoPlaceMessage && (
        <p className="mb-1 shrink-0 text-[11px] text-blue-600 dark:text-blue-400 sm:mb-2 sm:text-xs">{autoPlaceMessage}</p>
      )}
      {!hasSyllabusForYear && (
        <p className="mb-1 shrink-0 text-[11px] text-amber-600 dark:text-amber-400 sm:mb-2 sm:text-xs">
          {syllabusYear}年度のシラバスデータがまだありません。設定画面の「シラバス年度の選択」から読み込んでください。
        </p>
      )}

      {/*
        月〜土(6日)×7限をスマホ1画面にスクロールなしで収めるため、テーブルではなく
        CSS Gridでレイアウトする。行の高さはmin-h-0のflex親の残り高さを7限均等割り
        (grid-rows-[...1fr])にして自動で画面に収まるようにし、sm以上(タブレット/PC)
        では読みやすさを優先して1限あたり固定の高さに戻す。
      */}
      <div
        className="grid min-h-0 flex-1 grid-cols-[1.75rem_repeat(6,minmax(0,1fr))] grid-rows-[auto_repeat(7,minmax(0,1fr))] gap-px overflow-hidden rounded-lg bg-zinc-200 sm:grid-cols-[2.5rem_repeat(6,minmax(0,1fr))] sm:grid-rows-[auto_repeat(7,5rem)] dark:bg-zinc-800"
      >
        <div className="bg-zinc-50 dark:bg-zinc-950" />
        {DISPLAY_DAYS.map((day) => (
          <div
            key={day}
            className="flex items-center justify-center bg-zinc-50 py-1 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300 sm:text-sm"
          >
            {day}
          </div>
        ))}
        {PERIODS.map((period) => (
          <Fragment key={period}>
            <div className="flex items-center justify-center bg-zinc-50 text-center text-[9px] font-semibold leading-tight text-zinc-400 dark:bg-zinc-950 sm:text-xs">
              {period}限
            </div>
            {DISPLAY_DAYS.map((day) => {
              const entry = scopedTimetable.find((t) => t.day === day && t.period === period);
              const course = entry ? courses.find((c) => c.id === entry.courseId) : undefined;
              return (
                <button
                  key={day}
                  onClick={() => setSelected({ day, period })}
                  className={`flex min-w-0 flex-col items-center justify-center overflow-hidden p-0.5 text-center transition-colors ${
                    course
                      ? "bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/70"
                      : "bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  }`}
                >
                  {course ? (
                    <>
                      <span className="line-clamp-2 text-[8px] leading-tight font-semibold text-blue-800 dark:text-blue-200 sm:text-xs">
                        {course.name}
                      </span>
                      <span className="hidden text-[10px] text-blue-500 dark:text-blue-300 sm:block">{course.teacher}</span>
                    </>
                  ) : (
                    <span className="text-xs text-zinc-300 dark:text-zinc-700 sm:text-lg">+</span>
                  )}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      {selected && (
        <CellDetailModal
          grade={grade}
          term={term}
          day={selected.day}
          period={selected.period}
          syllabusYear={syllabusYear}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
