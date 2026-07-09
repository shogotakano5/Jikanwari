"use client";

import { useMemo, useState } from "react";
import type { Course, Period, Weekday } from "@/types";
import { useAppData } from "@/contexts/AppDataContext";
import EvaluationBadges from "./EvaluationBadges";

interface Props {
  day: Weekday;
  period: Period;
  onClose: () => void;
}

function CourseCard({
  course,
  isAssigned,
  isCompleted,
  isFavorite,
  onAssign,
  onRemove,
  onMarkCompleted,
  onUnmarkCompleted,
  onToggleFavorite,
}: {
  course: Course;
  isAssigned: boolean;
  isCompleted: boolean;
  isFavorite: boolean;
  onAssign?: () => void;
  onRemove?: () => void;
  onMarkCompleted?: () => void;
  onUnmarkCompleted?: () => void;
  onToggleFavorite?: () => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{course.name}</h3>
          <p className="text-sm text-zinc-500">
            {course.teacher} ・ {course.credits}単位 ・ {course.semester}
          </p>
        </div>
        <button
          onClick={onToggleFavorite}
          aria-label="お気に入り切り替え"
          className={`text-lg ${isFavorite ? "text-amber-500" : "text-zinc-300 dark:text-zinc-700"}`}
        >
          ★
        </button>
      </div>
      {course.overview && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{course.overview}</p>}
      <div className="mt-2">
        <EvaluationBadges items={course.evaluation} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">{course.categoryGroup ?? course.categoryKey}</span>
        {course.room && <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">{course.room}</span>}
        {course.textbook && <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">教科書: {course.textbook}</span>}
        {course.syllabusUrl && (
          <a href={course.syllabusUrl} target="_blank" rel="noreferrer" className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
            シラバスを開く
          </a>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!isAssigned && onAssign && (
          <button onClick={onAssign} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            追加
          </button>
        )}
        {isAssigned && onRemove && (
          <button onClick={onRemove} className="rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300">
            時間割から削除
          </button>
        )}
        {isCompleted ? (
          onUnmarkCompleted && (
            <button onClick={onUnmarkCompleted} className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300">
              履修済みを取り消す
            </button>
          )
        ) : (
          onMarkCompleted && (
            <button onClick={onMarkCompleted} className="rounded-md bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300">
              履修済みにする
            </button>
          )
        )}
      </div>
    </div>
  );
}

export default function CellDetailModal({ day, period, onClose }: Props) {
  const { courses, timetable, completed, favorites, assignToTimetable, removeFromTimetable, markCompleted, unmarkCompleted, toggleFavorite, settings } =
    useAppData();
  const [busy, setBusy] = useState(false);

  const assignedEntry = timetable.find((t) => t.day === day && t.period === period);
  const assignedCourse = assignedEntry ? courses.find((c) => c.id === assignedEntry.courseId) : undefined;

  const candidates = useMemo(
    () => courses.filter((c) => c.day === day && c.period === period && c.id !== assignedCourse?.id),
    [courses, day, period, assignedCourse?.id]
  );

  const completedIds = useMemo(() => new Set(completed.map((c) => c.courseId)), [completed]);
  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.courseId)), [favorites]);

  const runAssign = async (courseId: string) => {
    setBusy(true);
    await assignToTimetable(day, period, courseId);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {day}曜{period}限
          </h2>
          <button onClick={onClose} className="text-2xl leading-none text-zinc-400 hover:text-zinc-600">
            ×
          </button>
        </div>

        {assignedCourse && (
          <div className="mb-4">
            <p className="mb-1 text-xs font-semibold text-zinc-400">現在の授業</p>
            <CourseCard
              course={assignedCourse}
              isAssigned
              isCompleted={completedIds.has(assignedCourse.id)}
              isFavorite={favoriteIds.has(assignedCourse.id)}
              onRemove={async () => {
                setBusy(true);
                await removeFromTimetable(day, period);
                setBusy(false);
                onClose();
              }}
              onMarkCompleted={async () => {
                await markCompleted(assignedCourse.id, settings.entryYear, assignedCourse.credits);
              }}
              onUnmarkCompleted={async () => {
                await unmarkCompleted(assignedCourse.id);
              }}
              onToggleFavorite={() => toggleFavorite(assignedCourse.id)}
            />
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-semibold text-zinc-400">
            {assignedCourse ? "他の候補（この曜日・時限に開講）" : "この曜日・時限に開講している授業候補"}
          </p>
          {candidates.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-400">候補となる授業がありません</p>
          ) : (
            <div className="flex flex-col gap-2">
              {candidates.map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  isAssigned={false}
                  isCompleted={completedIds.has(c.id)}
                  isFavorite={favoriteIds.has(c.id)}
                  onAssign={() => runAssign(c.id)}
                  onToggleFavorite={() => toggleFavorite(c.id)}
                />
              ))}
            </div>
          )}
        </div>
        {busy && <p className="mt-2 text-center text-xs text-zinc-400">更新中...</p>}
      </div>
    </div>
  );
}
