"use client";

import { useMemo } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { findRequirementSet, classifyCourse } from "@/lib/graduation-requirements";
import type { CourseStatus } from "@/types";
import CourseCard from "@/components/CourseCard";

export default function FavoritesPage() {
  const { favorites, courses, toggleFavorite, statusByCourseId, setCourseStatus, clearCourseStatus, settings } = useAppData();

  const requirementSet = useMemo(
    () => findRequirementSet(settings.entryYear, settings.faculty, settings.department),
    [settings.entryYear, settings.faculty, settings.department]
  );

  const favoriteCourses = favorites
    .map((f) => courses.find((c) => c.id === f.courseId))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-8">
      <h1 className="text-xl font-bold">お気に入り</h1>
      <p className="mt-1 text-sm text-zinc-500">シラバス検索や時間割の詳細から★をタップすると登録されます。</p>

      <div className="mt-4 flex flex-col gap-3">
        {favoriteCourses.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">お気に入りはまだありません</p>
        ) : (
          favoriteCourses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              categoryLabel={requirementSet ? classifyCourse(course, requirementSet).groupLabel ?? classifyCourse(course, requirementSet).label : undefined}
              status={statusByCourseId.get(course.id)}
              isFavorite
              onToggleFavorite={() => toggleFavorite(course.id)}
              onSetStatus={(status: CourseStatus) => setCourseStatus(course.id, status, settings.entryYear, course.credits)}
              onClearStatus={() => clearCourseStatus(course.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
