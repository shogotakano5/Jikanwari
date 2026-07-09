import type { Course, EvaluationItem, Period, Semester, SubjectGroup, Weekday } from "@/types";
import { WEEKDAYS } from "@/types";

/**
 * public/data/asahikawa-courses-2026.json の1レコードの形（大学シラバスサイトから
 * 実際にスクレイピングされた2026年度・経済学部経営経済学科 130科目分のデータ）。
 */
export interface RawCourseRecord {
  id: string;
  year: number;
  semester: string;
  name: string;
  teacher: string;
  day: string;
  period: string;
  credits: number;
  category: string;
  faculty: string;
  department: string;
  syllabus_url: string;
  description: string;
  goals: string;
  prerequisites: string;
  fetched_at: string;
  evaluation: {
    exam: number;
    report: number;
    attendance: number;
    presentation: number;
    participation: number;
    other: number;
  };
  requirementsTags?: string[];
  raw?: Record<string, string>;
}

const EVALUATION_LABELS: Record<keyof RawCourseRecord["evaluation"], string> = {
  exam: "試験",
  report: "レポート",
  attendance: "出席",
  presentation: "発表",
  participation: "平常点",
  other: "その他",
};

function zenkakuDigitsToNumber(text: string): number | undefined {
  if (!text) return undefined;
  const halfWidth = text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  const n = Number(halfWidth.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseSemester(raw: string): Semester {
  if (raw === "前期" || raw === "後期" || raw === "通年") return raw;
  if (raw.includes("集中")) return "集中";
  return "通年";
}

function parseDay(raw: string): Weekday | undefined {
  return (WEEKDAYS as string[]).includes(raw) ? (raw as Weekday) : undefined;
}

function parseTargetYears(gradeText: string | undefined): number[] {
  if (!gradeText) return [];
  const matches = gradeText.match(/[1-4]/g);
  return matches ? Array.from(new Set(matches.map(Number))) : [];
}

function buildEvaluation(raw: RawCourseRecord["evaluation"]): EvaluationItem[] {
  return (Object.keys(EVALUATION_LABELS) as Array<keyof typeof EVALUATION_LABELS>)
    .filter((key) => (raw[key] ?? 0) > 0)
    .map((key) => ({ type: EVALUATION_LABELS[key], percentage: raw[key] }));
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * 科目名に「基幹科目群特論／」「総合科目群特論／」のような明示的な接頭辞がある
 * 場合のみ判定する（それ以外の科目については学生便覧を確認できていないため推測しない）。
 */
function parseSubjectGroup(name: string): SubjectGroup | undefined {
  if (name.startsWith("基幹科目群")) return "基幹科目";
  if (name.startsWith("総合科目群")) return "総合科目";
  return undefined;
}

export function mapRawCourseToCourse(raw: RawCourseRecord): Course {
  const rawFields = raw.raw ?? {};
  return {
    id: raw.id,
    name: raw.name,
    teacher: raw.teacher || "未設定",
    faculty: raw.faculty || "経済学部",
    department: raw.department || nonEmpty(rawFields["対象学科"]) || "経営経済学科",
    credits: Math.round(raw.credits) || 2,
    targetYears: parseTargetYears(rawFields["配当学年"]),
    syllabusYear: raw.year || undefined,
    semester: parseSemester(raw.semester),
    day: parseDay(raw.day),
    period: zenkakuDigitsToNumber(raw.period) as Period | undefined,
    overview: raw.description || "",
    goals: nonEmpty(raw.goals),
    prerequisites: nonEmpty(raw.prerequisites),
    courseNumbering: nonEmpty(rawFields["科目ナンバリング"]),
    syllabusPlan: nonEmpty(rawFields["授業計画"]),
    evaluationNotes: nonEmpty(rawFields["評価方法・基準"]),
    evaluation: buildEvaluation(raw.evaluation),
    textbook: nonEmpty(rawFields["教科書"]),
    references: nonEmpty(rawFields["参考書"]),
    keywords: [],
    // categoryKeyは付けない: classifyCourse()が科目名から必修/選択必修A〜Eを自動判定する
    subjectGroup: parseSubjectGroup(raw.name),
    source: "scraped",
    syllabusUrl: raw.syllabus_url || undefined,
    cachedAt: Date.now(),
  };
}

export async function fetchRealCourseSeed(): Promise<Course[]> {
  // Load courses from 2026 by default
  return fetchRealCoursesByYears([2026]);
}

export async function fetchRealCoursesByYears(years: number[]): Promise<Course[]> {
  const courses: Course[] = [];
  const uniqueIds = new Set<string>();

  for (const year of years) {
    try {
      const res = await fetch(`/data/asahikawa-courses-${year}.json`);
      if (!res.ok) continue; // Skip if year file doesn't exist
      const records: RawCourseRecord[] = await res.json();
      for (const record of records) {
        if (!uniqueIds.has(record.id)) {
          uniqueIds.add(record.id);
          courses.push(mapRawCourseToCourse(record));
        }
      }
    } catch {
      // Silently skip years that can't be loaded
    }
  }

  return courses;
}
