"use client";

import { useMemo } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { findRequirementSet, classifyCourse } from "@/lib/graduation-requirements";
import type { Course } from "@/types";

interface Props {
  onClose: () => void;
}

/**
 * Ver.11方針: 必修科目は履修ガイド上デフォルトで自動配置されるが、選択必修
 * （A〜E等、複数候補から必要単位分を選ぶ区分）は学生自身が選ぶ必要があるため、
 * 区分ごとに候補を一覧して選択できるダイアログを用意する。
 * ここでの「選択」は履修予定(planned)として記録するだけで、時間割への配置は
 * 行わない（時間割はセルから個別に「追加」する）。
 */
export default function ElectiveRequiredDialog({ onClose }: Props) {
  const { courses, completed, statusByCourseId, setCourseStatus, clearCourseStatus, settings } = useAppData();

  const requirementSet = useMemo(
    () => findRequirementSet(settings.entryYear, settings.faculty, settings.department),
    [settings.entryYear, settings.faculty, settings.department]
  );

  const electiveCategories = useMemo(
    () => requirementSet?.categories.filter((c) => c.label === "選択必修") ?? [],
    [requirementSet]
  );

  const candidatesByCategory = useMemo(() => {
    if (!requirementSet) return new Map<string, Course[]>();
    const map = new Map<string, Course[]>();
    for (const cat of electiveCategories) map.set(cat.key, []);
    for (const course of courses) {
      const cat = classifyCourse(course, requirementSet);
      if (map.has(cat.key)) map.get(cat.key)!.push(course);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    return map;
  }, [courses, requirementSet, electiveCategories]);

  const selectedCreditsByCategory = useMemo(() => {
    const sums = new Map<string, number>();
    if (!requirementSet) return sums;
    for (const record of completed) {
      const course = courses.find((c) => c.id === record.courseId);
      if (!course) continue;
      const cat = classifyCourse(course, requirementSet);
      if (!electiveCategories.some((c) => c.key === cat.key)) continue;
      sums.set(cat.key, (sums.get(cat.key) ?? 0) + record.creditsEarned);
    }
    return sums;
  }, [completed, courses, requirementSet, electiveCategories]);

  if (!requirementSet) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div className="rounded-2xl bg-white p-4 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-zinc-500">卒業要件データが見つかりません。設定画面を確認してください。</p>
          <button onClick={onClose} className="mt-3 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm dark:bg-zinc-800">
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">選択必修を選ぶ</h2>
            <p className="text-xs text-zinc-500">
              {requirementSet.department}（{requirementSet.note}）
            </p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-zinc-400 hover:text-zinc-600">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {electiveCategories.map((cat) => {
            const candidates = candidatesByCategory.get(cat.key) ?? [];
            const selectedCredits = selectedCreditsByCategory.get(cat.key) ?? 0;
            const satisfied = selectedCredits >= cat.requiredCredits;
            return (
              <div key={cat.key} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{cat.groupLabel ?? cat.label}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      satisfied
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {selectedCredits} / {cat.requiredCredits}単位選択済み
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  {candidates.length === 0 ? (
                    <p className="text-xs text-zinc-400">候補となる科目がありません</p>
                  ) : (
                    candidates.map((course) => {
                      const status = statusByCourseId.get(course.id);
                      const checked = status !== undefined;
                      return (
                        <label
                          key={course.id}
                          className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              if (checked) {
                                clearCourseStatus(course.id);
                              } else {
                                setCourseStatus(course.id, "planned", settings.entryYear, course.credits);
                              }
                            }}
                            className="mt-1"
                          />
                          <span className="flex-1">
                            <span className="font-medium">{course.name}</span>
                            <span className="ml-1 text-xs text-zinc-500">
                              {course.teacher} ・{" "}
                              {course.day && course.period ? `${course.day}曜${course.period}限` : "曜日時限未定"} ・{course.credits}単位
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={onClose} className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          閉じる
        </button>
      </div>
    </div>
  );
}
