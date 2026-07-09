"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { searchCourses, normalizeQuery } from "@/lib/search";
import { findRequirementSet, classifyCourse } from "@/lib/graduation-requirements";
import { WEEKDAYS, PERIODS, GRADES, type Course, type CourseStatus } from "@/types";
import CourseCard from "@/components/CourseCard";

export default function SyllabusSearchPage() {
  const { courses, addCourses, favorites, toggleFavorite, statusByCourseId, setCourseStatus, clearCourseStatus, settings } = useAppData();
  const [query, setQuery] = useState("");
  const [day, setDay] = useState("");
  const [period, setPeriod] = useState("");
  const [grade, setGrade] = useState("");
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [remoteResults, setRemoteResults] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requirementSet = useMemo(
    () => findRequirementSet(settings.entryYear, settings.faculty, settings.department),
    [settings.entryYear, settings.faculty, settings.department]
  );

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.courseId)), [favorites]);

  const localResults = useMemo(() => {
    const base = searchCourses(courses, {
      query,
      day: day || undefined,
      period: period ? Number(period) : undefined,
    }).map((r) => r.course);
    return grade ? base.filter((c) => c.targetYears.length === 0 || c.targetYears.includes(Number(grade))) : base;
  }, [courses, query, day, period, grade]);

  const results = remoteResults ?? localResults;

  async function runSearch() {
    const q = normalizeQuery(query);
    setError(null);
    setWarning(null);
    setRemoteResults(null);
    if (q.length === 0) return;

    // Ver.2方針: すでにローカル(IndexedDB)にキャッシュ済みの科目でヒットする場合は
    // 大学サイトへは一切アクセスしない。ヒットしない場合のみサーバーへ問い合わせる。
    if (localResults.length > 0) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/syllabus/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`検索リクエストに失敗しました (HTTP ${res.status})`);
      const data: { courses: Course[]; source: "scraped" | "demo"; warning?: string } = await res.json();
      setRemoteResults(data.courses);
      if (data.warning) setWarning(data.warning);
      if (data.courses.length > 0) {
        await addCourses(data.courses); // 取得結果をIndexedDBへキャッシュし、以後は大学サイトへアクセスしない
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "検索中にエラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6">
      <h1 className="text-xl font-bold">シラバス検索</h1>
      <p className="mt-1 text-sm text-zinc-500">
        科目名・教員名・授業概要・到達目標・評価方法・教科書・キーワードから検索できます（部分一致・あいまい検索対応）。
      </p>

      <div className="mt-4 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch();
          }}
          placeholder="例: ミクロ、統計、佐藤"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          onClick={runSearch}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "検索中..." : "検索"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <select value={grade} onChange={(e) => setGrade(e.target.value)} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <option value="">全学年</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}年
            </option>
          ))}
        </select>
        <select value={day} onChange={(e) => setDay(e.target.value)} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <option value="">全曜日</option>
          {WEEKDAYS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <option value="">全時限</option>
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {p}限
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">{error}</p>}
      {warning && !error && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{warning}</p>
      )}

      <div className="mt-4 flex flex-col gap-3 pb-8">
        {query.trim().length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">検索語を入力してください</p>
        ) : results.length === 0 && !loading ? (
          <p className="py-8 text-center text-sm text-zinc-400">該当する科目が見つかりませんでした</p>
        ) : (
          results.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              categoryLabel={requirementSet ? classifyCourse(course, requirementSet).groupLabel ?? classifyCourse(course, requirementSet).label : undefined}
              status={statusByCourseId.get(course.id)}
              isFavorite={favoriteIds.has(course.id)}
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
