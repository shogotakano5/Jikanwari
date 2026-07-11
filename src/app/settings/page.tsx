"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { SUPPORTED_ENTRY_YEARS, findRequirementSet, TRACK_OPTIONS, trackLabel } from "@/lib/graduation-requirements";
import { autoPlaceRequiredCoursesEverywhere } from "@/lib/timetable";
import { fetchRealCoursesByYears } from "@/lib/real-course-import";
import ElectiveRequiredDialog from "@/components/ElectiveRequiredDialog";

const SYLLABUS_YEARS = [2023, 2024, 2025, 2026] as const;

export default function SettingsPage() {
  const { settings, updateSettings, addCourses, courses, timetable, assignToTimetable } = useAppData();
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [autoPlaceMessage, setAutoPlaceMessage] = useState<string | null>(null);
  const [showElectiveDialog, setShowElectiveDialog] = useState(false);
  const [selectedYears, setSelectedYears] = useState<Set<number>>(
    new Set(settings.loadedSyllabusYears ?? [2026])
  );
  const [loadingYears, setLoadingYears] = useState(false);
  const [loadYearsMessage, setLoadYearsMessage] = useState<string | null>(null);

  const entryYearOptions = SUPPORTED_ENTRY_YEARS;

  // 入学年度・学部・学科・コースを選ぶと、対応する履修ガイド（卒業要件セット）を
  // 保存する前にその場でプレビューできる。
  const previewRequirementSet = useMemo(
    () => findRequirementSet(form.entryYear, form.faculty, form.department, form.selectedCourse),
    [form.entryYear, form.faculty, form.department, form.selectedCourse]
  );

  const syllabusYears = useMemo(
    () => Array.from(new Set(courses.map((c) => c.syllabusYear).filter((y): y is number => Boolean(y)))).sort(),
    [courses]
  );

  async function handleSave() {
    await updateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);

    // Ver.11方針: 必修科目は学生が選ぶものではないため、履修ガイドが決まったら
    // 全学年・全学期にデフォルトで自動配置する。
    const requirementSet = findRequirementSet(form.entryYear, form.faculty, form.department, form.selectedCourse);
    if (requirementSet) {
      const { placed, skipped } = await autoPlaceRequiredCoursesEverywhere(courses, timetable, requirementSet, assignToTimetable, form.entryYear);
      setAutoPlaceMessage(
        placed > 0
          ? `必修科目${placed}件を時間割へ自動配置しました。${skipped > 0 ? `（${skipped}件は既存の授業と重複のため保留）` : ""} 続けて選択必修を選んでください。`
          : "必修科目はすでに配置済みです。"
      );
      setShowElectiveDialog(true);
    }
  }

  async function handleLoadYears() {
    setLoadingYears(true);
    setLoadYearsMessage(null);
    try {
      const yearsArray = Array.from(selectedYears).sort();
      const courses = await fetchRealCoursesByYears(yearsArray);
      if (courses.length > 0) {
        await addCourses(courses);
      }
      await updateSettings({ ...form, loadedSyllabusYears: yearsArray });
      setLoadYearsMessage(
        courses.length > 0
          ? `${yearsArray.join("・")}年度のシラバスデータを読み込みました（合計${courses.length}科目）。`
          : "選択された年度のシラバスデータは利用できません。"
      );
    } catch (e) {
      setLoadYearsMessage(e instanceof Error ? `読み込みに失敗しました: ${e.message}` : "読み込みに失敗しました");
    } finally {
      setLoadingYears(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-8">
      <h1 className="text-xl font-bold">設定</h1>
      <p className="mt-1 text-sm text-zinc-500">
        入学年度・学部・学科を選ぶと、対応する履修ガイド（卒業要件）とシラバスが自動的に切り替わります。
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          入学年度
          <select
            value={form.entryYear}
            onChange={(e) => setForm({ ...form, entryYear: Number(e.target.value) })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {entryYearOptions.map((y) => (
              <option key={y} value={y}>
                {y}年度入学
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          学部
          <input
            value={form.faculty}
            onChange={(e) => setForm({ ...form, faculty: e.target.value })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          学科
          <input
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          履修コース（2年次以降に所属）
          <select
            value={form.selectedCourse ?? "economics"}
            onChange={(e) => setForm({ ...form, selectedCourse: e.target.value as typeof form.selectedCourse })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {TRACK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {trackLabel(opt.value, form.entryYear)}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-500">
            選択必修A〜Eの対象科目はコースごとに異なります。1年次はどのコースでも卒業要件に大きな差はありませんが、
            2年次以降の所属コースが決まったらここで選び直してください。
          </p>
        </label>

        {/* 選択中の入学年度・学部・学科に対応する履修ガイドのプレビュー */}
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs dark:border-blue-900 dark:bg-blue-950/40">
          {previewRequirementSet ? (
            <>
              <p className="font-semibold text-blue-700 dark:text-blue-300">
                対応する履修ガイド: {previewRequirementSet.note}
              </p>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-blue-700 dark:text-blue-300">
                <li>総取得単位 {previewRequirementSet.totalCreditsRequired}単位</li>
                {previewRequirementSet.categories.map((c) => (
                  <li key={c.key}>
                    {c.groupLabel ?? c.label} {c.requiredCredits}単位
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-amber-700 dark:text-amber-300">
              この入学年度・学部・学科に対応する履修ガイドが見つかりません。学部・学科の表記を確認してください。
            </p>
          )}
          {syllabusYears.length > 0 && (
            <p className="mt-1 text-blue-600 dark:text-blue-400">
              搭載中のシラバスデータ: {syllabusYears.map((y) => `${y}年度`).join("・")}
              {syllabusYears.length === 1 && "（現時点で複数年度分のシラバスは搭載されていません）"}
            </p>
          )}
        </div>

        <label className="flex flex-col gap-1 text-sm">
          表示名（任意）
          <input
            value={form.displayName ?? ""}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          テーマ
          <select
            value={form.theme}
            onChange={(e) => setForm({ ...form, theme: e.target.value as typeof form.theme })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="system">システムに合わせる</option>
            <option value="light">ライト</option>
            <option value="dark">ダーク</option>
          </select>
        </label>

        <button onClick={handleSave} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          {saved ? "保存しました" : "保存する（必修を自動配置→選択必修を選ぶ）"}
        </button>
        {autoPlaceMessage && <p className="text-xs text-blue-600 dark:text-blue-400">{autoPlaceMessage}</p>}
        <button
          onClick={() => setShowElectiveDialog(true)}
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
        >
          選択必修を選び直す
        </button>
      </div>

      <div className="mt-8 rounded-lg border border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-800">
        <p className="font-semibold text-zinc-600 dark:text-zinc-400">シラバス年度の選択</p>
        <p className="mt-1 text-xs">
          読み込みたいシラバスデータの年度を選択してください。複数年度の科目を同時に表示できます。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SYLLABUS_YEARS.map((year) => (
            <label key={year} className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
              <input
                type="checkbox"
                checked={selectedYears.has(year)}
                onChange={(e) => {
                  const newYears = new Set(selectedYears);
                  if (e.target.checked) {
                    newYears.add(year);
                  } else {
                    newYears.delete(year);
                  }
                  setSelectedYears(newYears);
                }}
                className="cursor-pointer"
              />
              <span className="text-sm">{year}年度</span>
            </label>
          ))}
        </div>
        <button
          onClick={handleLoadYears}
          disabled={loadingYears || selectedYears.size === 0}
          className="mt-3 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-700"
        >
          {loadingYears ? "読み込み中..." : "シラバスデータを読み込む"}
        </button>
        {loadYearsMessage && <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">{loadYearsMessage}</p>}
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-800">
        <p className="font-semibold text-zinc-600 dark:text-zinc-400">データについて</p>
        <p className="mt-1">
          時間割・シラバス・履修状況・お気に入り・設定はすべてこの端末のブラウザ内（IndexedDB）に保存され、サーバーには送信されません。
        </p>
        {settings.lastSyllabusSyncNote && <p className="mt-2 font-medium text-zinc-600 dark:text-zinc-300">初期科目データ: {settings.lastSyllabusSyncNote}</p>}
        <p className="mt-2 text-zinc-400">
          大学ポータルへのログインが必要なシラバスの一括取得は、このアプリの通常画面からは行えません
          （学籍番号・パスワードの入力を一般利用画面に置かないための方針です）。管理者が別途スクレイピング専用ページから取り込んだ
          データが、このアプリの初期科目データとして反映されます。
        </p>
      </div>

      {showElectiveDialog && <ElectiveRequiredDialog onClose={() => setShowElectiveDialog(false)} />}
    </div>
  );
}
