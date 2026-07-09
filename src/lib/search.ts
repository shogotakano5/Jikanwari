import type { Course } from "@/types";

/** 検索クエリの正規化: 前後空白除去・連続空白圧縮・大文字小文字統一・カタカナ→ひらがな変換（あいまい検索用） */
export function normalizeQuery(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60)); // カタカナ->ひらがな相当にシフト(簡易)
}

function haystack(course: Course): string {
  return normalizeQuery(
    [
      course.name,
      course.nameKana ?? "",
      course.teacher,
      course.overview,
      course.textbook ?? "",
      course.keywords.join(" "),
      course.faculty,
      course.department,
      course.targetYears.map((y) => `${y}年`).join(" "),
      course.evaluation.map((e) => e.type).join(" "),
    ].join(" ")
  );
}

export interface SearchOptions {
  query: string;
  faculty?: string;
  department?: string;
  day?: string;
  period?: number;
}

export interface SearchResult {
  course: Course;
  score: number;
  matchedField: "name" | "teacher" | "overview" | "keyword" | "other";
}

/**
 * 部分一致・大文字小文字無視・空白除去に対応した全文検索。
 * 科目名/教員名の一致を最優先し、概要・キーワード等の一致は加点で扱う（あいまい検索）。
 */
export function searchCourses(courses: Course[], options: SearchOptions): SearchResult[] {
  const q = normalizeQuery(options.query ?? "");
  const terms = q.length > 0 ? q.split(" ").filter(Boolean) : [];

  const results: SearchResult[] = [];
  for (const course of courses) {
    if (options.faculty && course.faculty !== options.faculty) continue;
    if (options.department && course.department !== options.department) continue;
    if (options.day && course.day !== options.day) continue;
    if (options.period && course.period !== options.period) continue;

    if (terms.length === 0) {
      results.push({ course, score: 0, matchedField: "other" });
      continue;
    }

    const name = normalizeQuery(course.name + " " + (course.nameKana ?? ""));
    const teacher = normalizeQuery(course.teacher);
    const full = haystack(course);

    let score = 0;
    let matchedField: SearchResult["matchedField"] = "other";
    let allTermsMatch = true;

    for (const term of terms) {
      if (name.includes(term)) {
        score += 10;
        matchedField = "name";
      } else if (teacher.includes(term)) {
        score += 6;
        if (matchedField === "other") matchedField = "teacher";
      } else if (course.keywords.some((k) => normalizeQuery(k).includes(term))) {
        score += 4;
        if (matchedField === "other") matchedField = "keyword";
      } else if (full.includes(term)) {
        score += 2;
        if (matchedField === "other") matchedField = "overview";
      } else {
        allTermsMatch = false;
      }
    }

    if (allTermsMatch && score > 0) {
      results.push({ course, score, matchedField });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
