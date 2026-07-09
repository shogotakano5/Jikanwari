"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { GRADUATION_REQUIREMENT_SETS, findRequirementSet } from "@/lib/graduation-requirements";
import { autoPlaceRequiredCoursesEverywhere } from "@/lib/timetable";
import type { Course } from "@/types";
import ElectiveRequiredDialog from "@/components/ElectiveRequiredDialog";

interface SyncResponse {
  courses: Course[];
  queriesAttempted: number;
  queriesFailed: number;
  warning?: string;
}

export default function SettingsPage() {
  const { settings, updateSettings, addCourses, courses, timetable, assignToTimetable } = useAppData();
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [autoPlaceMessage, setAutoPlaceMessage] = useState<string | null>(null);
  const [showElectiveDialog, setShowElectiveDialog] = useState(false);

  const entryYearOptions = Array.from(new Set(GRADUATION_REQUIREMENT_SETS.map((s) => s.entryYearFrom))).sort();

  // 入学年度・学部・学科を選ぶと、対応する履修ガイド（卒業要件セット）を
  // 保存する前にその場でプレビューできる。
  const previewRequirementSet = useMemo(
    () => findRequirementSet(form.entryYear, form.faculty, form.department),
    [form.entryYear, form.faculty, form.department]
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
    const requirementSet = findRequirementSet(form.entryYear, form.faculty, form.department);
    if (requirementSet) {
      const { placed, skipped } = await autoPlaceRequiredCoursesEverywhere(courses, timetable, requirementSet, assignToTimetable);
      setAutoPlaceMessage(
        placed > 0
          ? `必修科目${placed}件を時間割へ自動配置しました。${skipped > 0 ? `（${skipped}件は既存の授業と重複のため保留）` : ""} 続けて選択必修を選んでください。`
          : "必修科目はすでに配置済みです。"
      );
      setShowElectiveDialog(true);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/syllabus/sync", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SyncResponse = await res.json();
      if (data.courses.length > 0) {
        await addCourses(data.courses);
      }
      const note =
        data.courses.length > 0
          ? `大学サイトから${data.courses.length}科目を取得し反映しました（${data.queriesAttempted}件中${data.queriesAttempted - data.queriesFailed}件の学年検索が成功）。`
          : data.warning ?? "更新できる新しいデータはありませんでした。";
      setSyncMessage(note);
      await updateSettings({ ...form, lastSyllabusSyncNote: note });
    } catch (e) {
      setSyncMessage(e instanceof Error ? `更新に失敗しました: ${e.message}` : "更新に失敗しました");
    } finally {
      setSyncing(false);
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
        <p className="font-semibold text-zinc-600 dark:text-zinc-400">データについて</p>
        <p className="mt-1">
          時間割・シラバス・履修状況・お気に入り・設定はすべてこの端末のブラウザ内（IndexedDB）に保存され、サーバーには送信されません。
          シラバスは初めて検索した授業のみ大学サイトから取得し、以降はこの端末に保存されたデータを利用します。
        </p>
        {settings.lastSyllabusSyncNote && <p className="mt-2 font-medium text-zinc-600 dark:text-zinc-300">初期科目データ: {settings.lastSyllabusSyncNote}</p>}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="mt-3 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-200"
        >
          {syncing ? "大学サイトへ問い合わせ中..." : "大学サイトから最新のシラバスを取得する"}
        </button>
        {syncMessage && <p className="mt-2 text-zinc-600 dark:text-zinc-300">{syncMessage}</p>}
        <p className="mt-2 text-zinc-400">
          学年（1〜4年）ごとに検索を行い、搭載済みの科目データへ追加・更新します。大学サイトへ到達できない環境では失敗しますが、既存のデータは失われません。
        </p>
      </div>

      {showElectiveDialog && <ElectiveRequiredDialog onClose={() => setShowElectiveDialog(false)} />}
    </div>
  );
}
