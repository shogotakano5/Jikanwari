"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { findRequirementSet, judgeGraduation, classifyCourse } from "@/lib/graduation-requirements";
import { autoPlaceRequiredCourses, gradeMatchesCourse, termMatchesSemester } from "@/lib/timetable";
import { getSubjectGroup } from "@/lib/subject-group";
import { GRADES, TERMS, type Grade, type Term } from "@/types";
import CourseCard from "@/components/CourseCard";
import ElectiveRequiredDialog from "@/components/ElectiveRequiredDialog";

export default function PlannerPage() {
  const { courses, timetable, completed, courseById, favorites, statusByCourseId, assignToTimetable, toggleFavorite, settings } =
    useAppData();
  const [grade, setGrade] = useState<Grade>(1);
  const [term, setTerm] = useState<Term>("前期");
  const [activeCategoryKey, setActiveCategoryKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showElectiveDialog, setShowElectiveDialog] = useState(false);

  const requirementSet = useMemo(
    () => findRequirementSet(settings.entryYear, settings.faculty, settings.department, settings.selectedCourse),
    [settings.entryYear, settings.faculty, settings.department, settings.selectedCourse]
  );

  const judgement = useMemo(() => {
    if (!requirementSet) return null;
    return judgeGraduation(requirementSet, completed, courseById);
  }, [requirementSet, completed, courseById]);

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.courseId)), [favorites]);

  const takenIds = useMemo(() => new Set(completed.map((c) => c.courseId)), [completed]);

  const categoryChoices = useMemo(() => {
    if (!activeCategoryKey || !requirementSet) return [];
    return courses
      .filter(
        (c) =>
          classifyCourse(c, requirementSet).key === activeCategoryKey &&
          gradeMatchesCourse(c, grade) &&
          termMatchesSemester(c.semester, term)
      )
      .sort((a, b) => `${a.day}${a.period}${a.name}`.localeCompare(`${b.day}${b.period}${b.name}`, "ja"));
  }, [activeCategoryKey, requirementSet, courses, grade, term]);

  async function autoPlaceRequired() {
    if (!requirementSet) return;
    const { placed, skipped } = await autoPlaceRequiredCourses(courses, timetable, requirementSet, grade, term, assignToTimetable);
    setMessage(`${grade}年 ${term} の必修を${placed}件配置しました。${skipped > 0 ? `${skipped}件は同じ時間に別の授業が既にあるため保留です。` : ""}`);
  }

  async function assignChoice(courseId: string, day: (typeof courses)[number]["day"], period: (typeof courses)[number]["period"]) {
    if (!day || !period) return;
    await assignToTimetable(grade, term, day, period, courseId);
    setMessage(null);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-8">
      <h1 className="text-xl font-bold">履修プランナー</h1>
      <p className="mt-1 text-sm text-zinc-500">
        LLM（AI）は使わず、卒業要件の不足分と科目データからルールベースで履修候補を提案します。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
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
          className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
        >
          必修を自動配置
        </button>
        <button
          onClick={() => setShowElectiveDialog(true)}
          className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"
        >
          選択必修を選ぶ
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">{message}</p>}
      {showElectiveDialog && <ElectiveRequiredDialog onClose={() => setShowElectiveDialog(false)} />}

      {judgement && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">区分を選んで候補を見る</h2>
          <div className="flex flex-wrap gap-2">
            {judgement.categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategoryKey(cat.key === activeCategoryKey ? null : cat.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  activeCategoryKey === cat.key
                    ? "bg-blue-600 text-white"
                    : cat.satisfied
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {cat.groupLabel ?? cat.label} ({cat.earnedCredits}/{cat.requiredCredits})
              </button>
            ))}
          </div>
        </div>
      )}

      {activeCategoryKey && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">
            {grade}年 {term} の候補（{categoryChoices.length}件、未履修のみ表示）
          </h2>
          <div className="flex flex-col gap-2">
            {categoryChoices
              .filter((c) => !takenIds.has(c.id))
              .map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  categoryLabel={requirementSet ? classifyCourse(c, requirementSet).groupLabel ?? classifyCourse(c, requirementSet).label : undefined}
                  subjectGroup={getSubjectGroup(c, settings.entryYear)}
                  status={statusByCourseId.get(c.id)}
                  isFavorite={favoriteIds.has(c.id)}
                  onAssign={() => assignChoice(c.id, c.day, c.period)}
                  onToggleFavorite={() => toggleFavorite(c.id)}
                  compact
                />
              ))}
            {categoryChoices.filter((c) => !takenIds.has(c.id)).length === 0 && (
              <p className="py-4 text-center text-sm text-zinc-400">この条件の候補はありません</p>
            )}
          </div>
        </div>
      )}

      {judgement && judgement.advice.length > 0 && (
        <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
          <p className="mb-1 text-sm font-semibold text-blue-700 dark:text-blue-300">卒業要件から見たアドバイス</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-blue-700 dark:text-blue-300">
            {judgement.advice.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
