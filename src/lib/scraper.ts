import type { Course, EvaluationItem, Period, Semester, SubjectGroup, Weekday } from "@/types";
import { normalizeQuery } from "./search";
import {
  scrapeAllEconomicsCourses,
  scrapeCampusCourseWithDetail,
} from "./scraping/asahikawa-scraper";
import { ASAHIKAWA_SCRAPER_CONFIG, type ScrapedCourse } from "./scraping/scraper-config";
import { unstable_cache } from "next/cache";

export interface ScrapeResult {
  courses: Course[];
  warning?: string;
}

export interface SyncResult {
  courses: Course[];
  queriesAttempted: number;
  queriesFailed: number;
  warning?: string;
}

const DAY_MAP: Record<string, Weekday> = { 月: "月", 火: "火", 水: "水", 木: "木", 金: "金", 土: "土" };

function parseDayPeriod(text: string | undefined): { day: Weekday; period: number } | null {
  if (!text) return null;
  const m = text.match(/([月火水木金土])\s*曜?日?\s*[\s　]*(\d)\s*時限?/);
  if (!m) return null;
  return { day: DAY_MAP[m[1]], period: Number(m[2]) };
}

function parseEvaluation(text: string | undefined): EvaluationItem[] {
  if (!text) return [];
  const items: EvaluationItem[] = [];
  const re = /(試験|レポート|出席|小テスト|平常点|課題|発表)\s*(\d{1,3})\s*%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    items.push({ type: m[1], percentage: Number(m[2]) });
  }
  return items;
}

function parseSemester(detail: Record<string, string> | undefined, rawText: string | undefined): Semester {
  const source = detail?.["開講学期"] ?? detail?.["開講期・曜日・時限"] ?? rawText ?? "";
  if (source.includes("通年")) return "通年";
  if (source.includes("集中")) return "集中";
  if (source.includes("前期")) return "前期";
  if (source.includes("後期")) return "後期";
  return "通年";
}

function parseTargetYears(detail: Record<string, string> | undefined): number[] {
  const text = detail?.["配当学年"];
  if (!text) return [];
  const matches = text.match(/[1-4]/g);
  return matches ? Array.from(new Set(matches.map(Number))) : [];
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function parseSubjectGroup(name: string): SubjectGroup | undefined {
  if (name.startsWith("基幹科目群")) return "基幹科目";
  if (name.startsWith("総合科目群")) return "総合科目";
  return undefined;
}

/**
 * src/lib/scraping/asahikawa-scraper.ts が返す ScrapedCourse（実サイトの検索結果・
 * 詳細ページのtable行をほぼそのまま保持した形）を、アプリ内部のCourse型へ変換する。
 * detail（詳細ページのth/td）が無い場合は、rawText（検索結果行のテキスト）から
 * 曜日・時限・評価方法を可能な範囲で抽出する。
 */
function mapScrapedCourseToCourse(scraped: ScrapedCourse): Course {
  const detail = scraped.detail;
  const dayPeriod =
    parseDayPeriod(detail?.["開講期・曜日・時限"]) ?? parseDayPeriod(scraped.rawText) ?? parseDayPeriod(`${scraped.day ?? ""}${scraped.period ?? ""}`);
  const evaluationText = detail?.["評価方法・基準"] ?? scraped.rawText;

  return {
    id: scraped.id,
    name: scraped.name,
    teacher: scraped.teacher || detail?.["担当教員名"] || "未設定",
    faculty: "経済学部",
    department: scraped.department || ASAHIKAWA_SCRAPER_CONFIG.campusWeb.departmentLabel,
    credits: Number(scraped.credits ?? detail?.["単位"]) || 2,
    targetYears: parseTargetYears(detail),
    syllabusYear: scraped.year,
    semester: parseSemester(detail, scraped.rawText),
    day: dayPeriod?.day,
    period: dayPeriod?.period as Period | undefined,
    overview: detail?.["授業の概要"] ?? "",
    goals: nonEmpty(detail?.["到達目標"]),
    prerequisites: nonEmpty(detail?.["履修条件"]),
    courseNumbering: nonEmpty(detail?.["科目ナンバリング"]),
    syllabusPlan: nonEmpty(detail?.["授業計画"]),
    evaluationNotes: nonEmpty(detail?.["評価方法・基準"]),
    evaluation: parseEvaluation(evaluationText),
    textbook: nonEmpty(detail?.["教科書"]),
    references: nonEmpty(detail?.["参考書"]),
    keywords: [],
    subjectGroup: parseSubjectGroup(scraped.name),
    // categoryKeyは付けない: classifyCourse()が科目名から必修/選択必修A〜Eを自動判定する
    source: "scraped",
    syllabusUrl: scraped.syllabusUrl,
    cachedAt: Date.now(),
  };
}

/**
 * Ver.11-④ サーバー側共有キャッシュ。
 * Next.jsのData Cache (`unstable_cache`) を使い、あるユーザーが検索語について
 * 初めてライブスクレイピングに成功した結果を、外部DB・環境変数なしでサーバー側
 * （デプロイ環境の共有キャッシュ）に30日間保存する。以降は同じ検索語について
 * 他のユーザーがアクセスしても大学サイトへは再アクセスせず、このキャッシュを使う。
 * スクレイピングが失敗した場合は例外がそのまま伝播し、キャッシュには保存されない
 * （＝サイトが復旧すれば次回のアクセスで再度ライブ取得を試みる）。
 */
const cachedScrapeByQuery = unstable_cache(
  async (normalizedQuery: string) => scrapeCampusCourseWithDetail({ subjectName: normalizedQuery, limit: 20 }),
  ["jikanwari-syllabus-scrape-v2"],
  { revalidate: 60 * 60 * 24 * 30, tags: ["syllabus-scrape"] }
);

/**
 * Ver.2方針: 検索語について、まずライブスクレイピング（サーバー共有キャッシュ経由）
 * を試みる。失敗（到達不能・0件）した場合は空の結果と警告メッセージを返す
 * （フェイクデータで埋めることはしない）。
 * 成功したデータはさらに呼び出し側（クライアント）がIndexedDBへキャッシュし、
 * 同じブラウザからは以降このAPI自体を呼ばない想定。
 */
export async function scrapeSyllabus(query: string): Promise<ScrapeResult> {
  const normalized = normalizeQuery(query);
  try {
    const scraped = await cachedScrapeByQuery(normalized);
    if (scraped.length === 0) throw new Error("no matching courses found");
    return { courses: scraped.map(mapScrapedCourseToCourse) };
  } catch (err) {
    return {
      courses: [],
      warning: `大学シラバスサイトへのライブ検索に失敗しました（${
        err instanceof Error ? err.message : String(err)
      }）。すでに読み込み済みの130科目以外は、大学サイトへ到達できる環境で src/lib/scraping/scraper-config.ts のフィールド名・セレクタを実構造に合わせて調整するまで検索できません。`,
    };
  }
}

/**
 * public/data/asahikawa-courses-2026.json の元データが実際に収集された際の手法
 * （raw["取得元検索条件"]に "grade1"〜"grade3"/"day1"〜"day5" 等が残っている）を
 * 再現し、学年×曜日ごとに検索して全件を収集する（scrapeAllEconomicsCourses）。
 * 詳細ページまでは取得しない（件数が多く負荷が大きいため、検索結果一覧のみ）。
 */
export async function scrapeAllCourses(): Promise<SyncResult> {
  const gradeCount = ASAHIKAWA_SCRAPER_CONFIG.campusWeb.gradeValues.length;
  const dayCount = ASAHIKAWA_SCRAPER_CONFIG.campusWeb.dayValues.length;
  const queriesAttempted = gradeCount * dayCount;

  try {
    const scraped = await scrapeAllEconomicsCourses();
    if (scraped.length === 0) throw new Error("no courses returned from any grade/day combination");
    return { courses: scraped.map(mapScrapedCourseToCourse), queriesAttempted, queriesFailed: 0 };
  } catch (err) {
    return {
      courses: [],
      queriesAttempted,
      queriesFailed: queriesAttempted,
      warning: `全件同期に失敗しました（${
        err instanceof Error ? err.message : String(err)
      }）。搭載済みの130科目データはそのまま利用できます。大学サイトへ到達できる環境で src/lib/scraping/scraper-config.ts のフィールド名・セレクタを実構造に合わせて調整してください。`,
    };
  }
}
