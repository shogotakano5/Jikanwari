"use client";

import { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { GRADUATION_REQUIREMENT_SETS } from "@/lib/graduation-requirements";

export default function SettingsPage() {
  const { settings, updateSettings } = useAppData();
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);

  const entryYearOptions = Array.from(new Set(GRADUATION_REQUIREMENT_SETS.map((s) => s.entryYearFrom))).sort();

  async function handleSave() {
    await updateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-8">
      <h1 className="text-xl font-bold">設定</h1>
      <p className="mt-1 text-sm text-zinc-500">卒業判定に使用する入学年度・学部・学科を設定します。</p>

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
          {saved ? "保存しました" : "保存する"}
        </button>
      </div>

      <div className="mt-8 rounded-lg border border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-800">
        <p className="font-semibold text-zinc-600 dark:text-zinc-400">データについて</p>
        <p className="mt-1">
          時間割・シラバス・履修状況・お気に入り・設定はすべてこの端末のブラウザ内（IndexedDB）に保存され、サーバーには送信されません。
          シラバスは初めて検索した授業のみ大学サイトから取得し、以降はこの端末に保存されたデータを利用します。
        </p>
      </div>
    </div>
  );
}
