import type { Course, EvaluationItem, Period, Semester, Weekday } from "@/types";
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

/**
 * 配当学年をパースする。「配当学年」フィールドが空の科目は、元データ収集時の
 * 検索条件（raw["取得元検索条件"] = "grade1"〜"grade4"）から配当学年を復元する
 * （学年指定で検索してヒットした科目はその学年の配当科目）。曜日検索（"day1"等）
 * でのみヒットした科目は学年不明のため空のまま＝全学年の候補として扱う。
 */
function parseTargetYears(gradeText: string | undefined, sourceQuery?: string): number[] {
  if (gradeText) {
    const matches = gradeText.match(/[1-4]/g);
    if (matches) return Array.from(new Set(matches.map(Number)));
  }
  const gradeQuery = sourceQuery?.match(/^grade([1-4])$/);
  if (gradeQuery) return [Number(gradeQuery[1])];
  return [];
}

/**
 * スクレイピング由来のテキストに残っている可能性のあるゴミを除去する
 * （scripts/clean-course-data.mjs と同等の処理の取り込み時セーフティネット）。
 * - 本文をJSで埋め込むシラバス詳細ページ由来の `jq$(function(){ var subjectCon = "本文"; ... });`
 * - HTMLタグ・HTMLコメント・実体参照
 */
function sanitizeScrapedText(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/jq\$\(function\(\)\{[\s\S]*?\}\);?/g, (block) => {
      const m = block.match(/var\s+\w+\s*=\s*"([\s\S]*?)";/);
      return m ? `${m[1]}\n` : "";
    })
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|ul|ol|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "・")
    .replace(/<\/?[a-zA-Z][^>]*(>|$)/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "")
    .replace(/[ \t　]+\n/g, "\n")
    .replace(/\n[ \t　]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 科目名・教員名など1行であるべきフィールド用: タグ除去に加えて改行・連続空白を単一スペースへ潰す */
function sanitizeInlineText(value: string | undefined): string {
  return sanitizeScrapedText(value).replace(/\s+/g, " ").trim();
}

function buildEvaluation(raw: RawCourseRecord["evaluation"]): EvaluationItem[] {
  return (Object.keys(EVALUATION_LABELS) as Array<keyof typeof EVALUATION_LABELS>)
    .filter((key) => (raw[key] ?? 0) > 0)
    .map((key) => ({ type: EVALUATION_LABELS[key], percentage: raw[key] }));
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function mapRawCourseToCourse(raw: RawCourseRecord): Course {
  const rawFields = raw.raw ?? {};
  return {
    id: raw.id,
    name: sanitizeInlineText(raw.name) || raw.id,
    teacher: sanitizeInlineText(raw.teacher) || "未設定",
    faculty: sanitizeInlineText(raw.faculty) || "経済学部",
    department: sanitizeInlineText(raw.department) || nonEmpty(rawFields["対象学科"]) || "経営経済学科",
    credits: Math.round(raw.credits) || 2,
    targetYears: parseTargetYears(rawFields["配当学年"], rawFields["取得元検索条件"]),
    syllabusYear: raw.year || undefined,
    semester: parseSemester(sanitizeInlineText(raw.semester)),
    day: parseDay(sanitizeInlineText(raw.day)),
    period: zenkakuDigitsToNumber(sanitizeInlineText(raw.period)) as Period | undefined,
    overview: sanitizeScrapedText(raw.description),
    goals: nonEmpty(sanitizeScrapedText(raw.goals)),
    prerequisites: nonEmpty(sanitizeScrapedText(raw.prerequisites)),
    courseNumbering: nonEmpty(rawFields["科目ナンバリング"]),
    syllabusPlan: nonEmpty(sanitizeScrapedText(rawFields["授業計画"])),
    evaluationNotes: nonEmpty(sanitizeScrapedText(rawFields["評価方法・基準"])),
    evaluation: buildEvaluation(raw.evaluation),
    textbook: nonEmpty(sanitizeScrapedText(rawFields["教科書"])),
    references: nonEmpty(sanitizeScrapedText(rawFields["参考書"])),
    keywords: [],
    // categoryKeyは付けない: classifyCourse()が科目名から必修/選択必修A〜Eを自動判定する
    // subjectGroupも付けない: getSubjectGroup()が入学年度に応じて動的に判定する
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

  // ※以前ここで生成していた架空のゼミナールプレースホルダー（曜日時限を推測した
  // 「ゼミナール（N年）」）は廃止した。ゼミナールⅠ〜Ⅳは実データ（担当教員別）と
  // buildGuideFallbackCourses()の履修ガイド由来の簡易データでカバーされる。

  return courses;
}
