"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { SUPPORTED_ENTRY_YEARS, TRACK_OPTIONS, findRequirementSet, trackLabel } from "@/lib/graduation-requirements";
import { autoPlaceRequiredCoursesEverywhere, currentGradeFor, expectedSyllabusYear } from "@/lib/timetable";
import { fetchRealCoursesByYears } from "@/lib/real-course-import";
import type { Track } from "@/types";

/**
 * 初回起動時に入学年度と所属コースを確認するダイアログ。
 * 保存すると:
 *  1. 在学期間に対応する年度（入学年度〜入学年度+3、搭載範囲内）のシラバスを自動で読み込み
 *  2. 履修ガイドに基づき必修科目を全学年の時間割へ自動配置
 *  3. onboardingCompleted を立てて以後は表示しない
 * 入学年度・コースは設定画面からいつでも変更できる。
 */
export default function OnboardingDialog() {
  const { ready, settings, updateSettings, addCourses, courses, timetable, assignToTimetable } = useAppData();
  const [entryYear, setEntryYear] = useState<number | null>(null);
  const [track, setTrack] = useState<Track>("economics");
  const [saving, setSaving] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  const effectiveEntryYear = entryYear ?? settings.entryYear;
  const currentGrade = useMemo(() => currentGradeFor(effectiveEntryYear), [effectiveEntryYear]);

  // 保存完了後は onboardingCompleted が立つが、完了メッセージを見せてから閉じる
  if (!ready || (settings.onboardingCompleted && !doneMessage)) return null;

  async function handleStart() {
    setSaving(true);
    try {
      // 在学期間に対応する年度のシラバスを読み込む（例: 2024年度入学 → 2024〜2026年度）
      const years = [1, 2, 3, 4]
        .map((g) => expectedSyllabusYear(effectiveEntryYear, g as 1 | 2 | 3 | 4))
        .filter((y) => y >= 2023 && y <= 2026);
      const loaded = await fetchRealCoursesByYears(years);
      if (loaded.length > 0) await addCourses(loaded);

      const newSettings = {
        ...settings,
        entryYear: effectiveEntryYear,
        selectedCourse: track,
        loadedSyllabusYears: years,
        onboardingCompleted: true,
      };
      await updateSettings(newSettings);

      // 必修科目を全学年の時間割へ自動配置する
      const requirementSet = findRequirementSet(newSettings.entryYear, newSettings.faculty, newSettings.department, track);
      let placed = 0;
      if (requirementSet) {
        const allCourses = loaded.length > 0 ? [...courses, ...loaded.filter((c) => !courses.some((e) => e.id === c.id))] : courses;
        const result = await autoPlaceRequiredCoursesEverywhere(
          allCourses,
          timetable,
          requirementSet,
          assignToTimetable,
          newSettings.entryYear
        );
        placed = result.placed;
      }
      setDoneMessage(
        `${years.join("・")}年度のシラバス${loaded.length}件を読み込み、必修科目${placed}件を時間割へ自動配置しました。あなたは現在${currentGrade}年生として時間割を表示します。選択必修は履修プランナーまたは設定画面から選べます。`
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-zinc-900">
        {doneMessage ? (
          <>
            <h2 className="text-lg font-bold">準備ができました</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{doneMessage}</p>
            <button
              onClick={() => setDoneMessage(null)}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              はじめる
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold">ようこそ 👋</h2>
            <p className="mt-1 text-sm text-zinc-500">
              入学年度と所属コースを教えてください。対応する履修ガイド・シラバスを読み込み、必修科目を時間割へ自動配置します（あとから設定画面で変更できます）。
            </p>

            <label className="mt-4 flex flex-col gap-1 text-sm">
              入学年度
              <select
                value={effectiveEntryYear}
                onChange={(e) => setEntryYear(Number(e.target.value))}
                className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              >
                {SUPPORTED_ENTRY_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}年度入学（現在{currentGradeFor(y)}年生）
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 flex flex-col gap-1 text-sm">
              所属コース（2年次以降。未定なら仮でOK）
              <select
                value={track}
                onChange={(e) => setTrack(e.target.value as Track)}
                className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
              >
                {TRACK_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {trackLabel(option.value, effectiveEntryYear)}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={handleStart}
              disabled={saving}
              className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "読み込み中..." : "この内容ではじめる"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
