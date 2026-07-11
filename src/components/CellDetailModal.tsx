"use client";

import { useMemo, useState } from "react";
import type { CourseStatus, Grade, Period, Term, Weekday } from "@/types";
import { useAppData, timetableSlotId } from "@/contexts/AppDataContext";
import { findRequirementSet, classifyCourse } from "@/lib/graduation-requirements";
import { getSubjectGroup } from "@/lib/subject-group";
import { gradeMatchesCourse, termMatchesSemester } from "@/lib/timetable";
import CourseCard from "./CourseCard";
import ManualCourseDialog from "./ManualCourseDialog";

interface Props {
  grade: Grade;
  term: Term;
  day: Weekday;
  period: Period;
  onClose: () => void;
}

export default function CellDetailModal({ grade, term, day, period, onClose }: Props) {
  const {
    courses,
    timetable,
    favorites,
    statusByCourseId,
    examNoteByCourseId,
    assignToTimetable,
    removeFromTimetable,
    setCourseStatus,
    clearCourseStatus,
    toggleFavorite,
    setExamNote,
    settings,
  } = useAppData();
  const [busy, setBusy] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);

  const requirementSet = useMemo(
    () => findRequirementSet(settings.entryYear, settings.faculty, settings.department, settings.selectedCourse),
    [settings.entryYear, settings.faculty, settings.department, settings.selectedCourse]
  );

  const slotId = timetableSlotId(grade, term, day, period);
  const assignedEntry = timetable.find((t) => t.id === slotId);
  const assignedCourse = assignedEntry ? courses.find((c) => c.id === assignedEntry.courseId) : undefined;

  const candidates = useMemo(
    () =>
      courses.filter(
        (c) =>
          c.day === day &&
          c.period === period &&
          c.id !== assignedCourse?.id &&
          gradeMatchesCourse(c, grade) &&
          termMatchesSemester(c.semester, term)
      ),
    [courses, day, period, grade, term, assignedCourse?.id]
  );

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.courseId)), [favorites]);

  const runAssign = async (courseId: string) => {
    setBusy(true);
    await assignToTimetable(grade, term, day, period, courseId);
    setBusy(false);
  };

  const categoryLabelFor = (courseId: string) => {
    if (!requirementSet) return undefined;
    const course = courses.find((c) => c.id === courseId);
    if (!course) return undefined;
    const cat = classifyCourse(course, requirementSet);
    return cat.groupLabel ?? cat.label;
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {grade}年 {term} {day}曜{period}限
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
              categoryLabel={categoryLabelFor(assignedCourse.id)}
              subjectGroup={getSubjectGroup(assignedCourse, settings.entryYear)}
              isAssigned
              status={statusByCourseId.get(assignedCourse.id)}
              isFavorite={favoriteIds.has(assignedCourse.id)}
              onRemove={async () => {
                setBusy(true);
                await removeFromTimetable(grade, term, day, period);
                setBusy(false);
                onClose();
              }}
              onSetStatus={(status: CourseStatus) => setCourseStatus(assignedCourse.id, status, settings.entryYear, assignedCourse.credits)}
              onClearStatus={() => clearCourseStatus(assignedCourse.id)}
              onToggleFavorite={() => toggleFavorite(assignedCourse.id)}
              examDate={examNoteByCourseId.get(assignedCourse.id)?.examDate}
              reportDue={examNoteByCourseId.get(assignedCourse.id)?.reportDue}
              onSetExamNote={(examDate, reportDue) => setExamNote(assignedCourse.id, examDate, reportDue)}
            />
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-400">
              {assignedCourse ? "他の候補（この曜日・時限に開講）" : "この曜日・時限に開講している授業候補"}
            </p>
            {!assignedCourse && (
              <button
                onClick={() => setShowManualDialog(true)}
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                手入力で追加
              </button>
            )}
          </div>
          {candidates.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-400">候補となる授業がありません</p>
          ) : (
            <div className="flex flex-col gap-2">
              {candidates.map((c) => (
                <CourseCard
                  key={c.id}
                  course={c}
                  categoryLabel={categoryLabelFor(c.id)}
                  subjectGroup={getSubjectGroup(c, settings.entryYear)}
                  isAssigned={false}
                  status={statusByCourseId.get(c.id)}
                  isFavorite={favoriteIds.has(c.id)}
                  onAssign={() => runAssign(c.id)}
                  onToggleFavorite={() => toggleFavorite(c.id)}
                  examDate={examNoteByCourseId.get(c.id)?.examDate}
                  reportDue={examNoteByCourseId.get(c.id)?.reportDue}
                  onSetExamNote={(examDate, reportDue) => setExamNote(c.id, examDate, reportDue)}
                />
              ))}
            </div>
          )}
        </div>
        {busy && <p className="mt-2 text-center text-xs text-zinc-400">更新中...</p>}
      </div>
      {showManualDialog && (
        <ManualCourseDialog grade={grade} term={term} day={day} period={period} onClose={() => setShowManualDialog(false)} />
      )}
    </div>
  );
}
