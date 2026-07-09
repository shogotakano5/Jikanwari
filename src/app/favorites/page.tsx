"use client";

import { useAppData } from "@/contexts/AppDataContext";
import EvaluationBadges from "@/components/EvaluationBadges";

export default function FavoritesPage() {
  const { favorites, courses, toggleFavorite } = useAppData();
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
            <div key={course.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{course.name}</h3>
                  <p className="text-sm text-zinc-500">
                    {course.teacher} ・ {course.day}曜{course.period}限 ・ {course.credits}単位
                  </p>
                </div>
                <button onClick={() => toggleFavorite(course.id)} className="text-lg text-amber-500">
                  ★
                </button>
              </div>
              <div className="mt-2">
                <EvaluationBadges items={course.evaluation} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
