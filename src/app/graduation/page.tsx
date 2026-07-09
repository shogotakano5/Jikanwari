"use client";

import { useMemo } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { findRequirementSet, judgeGraduation } from "@/lib/graduation-requirements";

export default function GraduationPage() {
  const { settings, completed, courseById, courses, unmarkCompleted } = useAppData();

  const requirementSet = useMemo(
    () => findRequirementSet(settings.entryYear, settings.faculty, settings.department),
    [settings.entryYear, settings.faculty, settings.department]
  );

  const judgement = useMemo(() => {
    if (!requirementSet) return null;
    return judgeGraduation(requirementSet, completed, courseById);
  }, [requirementSet, completed, courseById]);

  if (!requirementSet || !judgement) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <h1 className="text-xl font-bold">卒業判定</h1>
        <p className="mt-4 text-sm text-zinc-500">
          {settings.entryYear}年度入学 {settings.faculty}
          {settings.department} の卒業要件データが登録されていません。設定画面で入学年度・学部・学科を確認してください。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-8">
      <h1 className="text-xl font-bold">卒業判定</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {settings.entryYear}年度入学 {requirementSet.faculty}
        {requirementSet.department}（{requirementSet.note}）
      </p>

      <div
        className={`mt-4 rounded-xl p-4 text-center ${
          judgement.canGraduate
            ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
            : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        }`}
      >
        <p className="text-2xl font-bold">{judgement.canGraduate ? "○ 卒業可能" : "× 不足あり"}</p>
        <p className="mt-1 text-sm">
          総取得単位 {judgement.totalOverallEarnedCredits} / {judgement.totalCreditsRequired}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {judgement.categories.map((cat) => (
          <div key={cat.key} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{cat.groupLabel ?? cat.label}</p>
                <p className="text-xs text-zinc-400">区分: {cat.label}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  cat.satisfied
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                }`}
              >
                {cat.satisfied ? "達成" : `残り${cat.remainingCredits}単位`}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className={`h-full ${cat.satisfied ? "bg-green-500" : "bg-blue-500"}`}
                style={{ width: `${Math.min(100, (cat.earnedCredits / cat.requiredCredits) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              取得単位 {cat.earnedCredits} / {cat.requiredCredits}
            </p>
            {cat.courses.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5 text-xs text-zinc-500">
                {cat.courses.map((c) => (
                  <li key={c.courseId} className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                    {c.courseName}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {judgement.advice.length > 0 && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
          <p className="mb-1 text-sm font-semibold text-blue-700 dark:text-blue-300">アドバイス</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-blue-700 dark:text-blue-300">
            {judgement.advice.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-500">履修済み科目一覧</h2>
        {completed.length === 0 ? (
          <p className="text-sm text-zinc-400">まだ履修済みの科目が登録されていません。時間割のセルから「履修済みにする」で登録できます。</p>
        ) : (
          <div className="flex flex-col gap-2">
            {completed.map((rec) => {
              const c = courses.find((x) => x.id === rec.courseId);
              return (
                <div key={rec.courseId} className="flex items-center justify-between rounded-lg border border-zinc-200 p-2 text-sm dark:border-zinc-800">
                  <span>
                    {c?.name ?? rec.courseId}（{rec.completedYear}年度 ・ {rec.creditsEarned}単位）
                  </span>
                  <button onClick={() => unmarkCompleted(rec.courseId)} className="text-xs text-red-500 hover:underline">
                    取り消す
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
