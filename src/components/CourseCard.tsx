"use client";

import type { Course, CourseStatus } from "@/types";
import { COURSE_STATUS_LABELS } from "@/types";
import EvaluationBadges from "./EvaluationBadges";

interface Props {
  course: Course;
  categoryLabel?: string; // classifyCourse() で判定した区分（groupLabel等）
  status?: CourseStatus;
  isFavorite: boolean;
  isAssigned?: boolean;
  onAssign?: () => void;
  onRemove?: () => void;
  onSetStatus?: (status: CourseStatus) => void;
  onClearStatus?: () => void;
  onToggleFavorite?: () => void;
  compact?: boolean;
}

const STATUS_ORDER: CourseStatus[] = ["completed", "inProgress", "planned"];

export default function CourseCard({
  course,
  categoryLabel,
  status,
  isFavorite,
  isAssigned,
  onAssign,
  onRemove,
  onSetStatus,
  onClearStatus,
  onToggleFavorite,
  compact,
}: Props) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{course.name}</h3>
          <p className="text-sm text-zinc-500">
            {course.teacher} ・ {course.day && course.period ? `${course.day}曜${course.period}限` : "曜日時限未定(集中講義等)"} ・{" "}
            {course.credits}単位 ・ {course.semester}
          </p>
        </div>
        {onToggleFavorite && (
          <button
            onClick={onToggleFavorite}
            aria-label="お気に入り切り替え"
            className={`text-lg ${isFavorite ? "text-amber-500" : "text-zinc-300 dark:text-zinc-700"}`}
          >
            ★
          </button>
        )}
      </div>
      {!compact && course.overview && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{course.overview}</p>}
      <div className="mt-2">
        <EvaluationBadges items={course.evaluation} />
      </div>
      {categoryLabel && (
        <p className="mt-2 text-xs text-zinc-500">
          この科目は<span className="font-semibold text-blue-600 dark:text-blue-400">「{categoryLabel}」</span>としてカウントされます
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
        {course.subjectGroup && (
          <span
            className={`rounded px-1.5 py-0.5 font-medium ${
              course.subjectGroup === "基幹科目"
                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                : "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
            }`}
          >
            {course.subjectGroup}
          </span>
        )}
        {course.room && <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">{course.room}</span>}
        {course.textbook && <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">教科書: {course.textbook}</span>}
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">大学サイト取得</span>
        {course.syllabusUrl && (
          <a
            href={course.syllabusUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
          >
            シラバスを開く
          </a>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!isAssigned && onAssign && course.day && course.period && (
          <button onClick={onAssign} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            追加
          </button>
        )}
        {isAssigned && onRemove && (
          <button
            onClick={onRemove}
            className="rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300"
          >
            時間割から削除
          </button>
        )}
        {onSetStatus &&
          STATUS_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => onSetStatus(s)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                status === s
                  ? "bg-green-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {COURSE_STATUS_LABELS[s]}
            </button>
          ))}
        {status && onClearStatus && (
          <button
            onClick={onClearStatus}
            className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
          >
            状態を解除
          </button>
        )}
      </div>
    </div>
  );
}
