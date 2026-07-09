import * as cheerio from "cheerio";
import type { Course, EvaluationItem, Weekday } from "@/types";
import { SCRAPER_CONFIG } from "./scraper-config";
import { DEMO_COURSES } from "./demo-courses";
import { searchCourses } from "./search";

export interface ScrapeResult {
  courses: Course[];
  source: "scraped" | "demo";
  warning?: string;
}

const DAY_MAP: Record<string, Weekday> = { 月: "月", 火: "火", 水: "水", 木: "木", 金: "金", 土: "土" };

function parseDayPeriod(text: string): { day: Weekday; period: number } | null {
  const m = text.match(/([月火水木金土])\s*(\d)/);
  if (!m) return null;
  return { day: DAY_MAP[m[1]], period: Number(m[2]) };
}

function parseEvaluation(text: string): EvaluationItem[] {
  const items: EvaluationItem[] = [];
  const re = /(試験|レポート|出席|小テスト|平常点|課題|発表)\s*(\d{1,3})\s*%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    items.push({ type: m[1], percentage: Number(m[2]) });
  }
  return items;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPER_CONFIG.requestTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 大学のシラバス検索システムへライブアクセスを試みる。
 * 到達不能・構造不一致など何らかの理由で失敗した場合は必ず例外を投げる
 * （呼び出し側でデモデータへフォールバックする）。
 */
async function scrapeLive(query: string): Promise<Course[]> {
  const searchUrl = new URL(SCRAPER_CONFIG.searchSubmitPath, SCRAPER_CONFIG.baseUrl).toString();
  const body = new URLSearchParams({
    [SCRAPER_CONFIG.formFields.subjectName]: query,
    [SCRAPER_CONFIG.formFields.submitAction]: "1",
  });

  const res = await fetchWithTimeout(searchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (compatible; Jikanwari/1.0; +https://github.com/)",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`syllabus search returned HTTP ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const rows = $(SCRAPER_CONFIG.resultSelectors.row);
  if (rows.length === 0) {
    throw new Error("no result rows matched configured selectors — site structure may differ");
  }

  const courses: Course[] = [];
  rows.each((_, el) => {
    const row = $(el);
    const name = row.find(SCRAPER_CONFIG.resultSelectors.name).first().text().trim();
    if (!name) return;
    const teacher = row.find(SCRAPER_CONFIG.resultSelectors.teacher).first().text().trim();
    const creditsText = row.find(SCRAPER_CONFIG.resultSelectors.credits).first().text().trim();
    const rowText = row.text();
    const dayPeriod = parseDayPeriod(rowText);
    const href = row.find(SCRAPER_CONFIG.resultSelectors.name).first().attr(SCRAPER_CONFIG.resultSelectors.detailLinkAttr);

    courses.push({
      id: `scraped-${Buffer.from(name + teacher).toString("base64url").slice(0, 16)}`,
      name,
      teacher: teacher || "未設定",
      faculty: "経済学部",
      department: "経済学科",
      credits: Number(creditsText.replace(/[^0-9]/g, "")) || 2,
      targetYears: [1, 2, 3, 4],
      semester: "前期",
      day: dayPeriod?.day ?? "月",
      period: (dayPeriod?.period as Course["period"]) ?? 1,
      overview: "",
      evaluation: parseEvaluation(rowText),
      keywords: [],
      categoryKey: "選択",
      source: "scraped",
      syllabusUrl: href ? new URL(href, SCRAPER_CONFIG.baseUrl).toString() : undefined,
      cachedAt: Date.now(),
    });
  });

  if (courses.length === 0) {
    throw new Error("rows matched but no course names could be extracted");
  }
  return courses;
}

/**
 * Ver.2方針: 検索語について、まずライブスクレイピングを1回だけ試みる。
 * 失敗（到達不能・構造不一致）した場合はデモデータの中から一致するものを
 * 返し、`source: "demo"` と警告メッセージで呼び出し側に伝える。
 * 成功したデータは呼び出し側（クライアント）がIndexedDBへキャッシュし、
 * 以降は同じ科目について再度このAPIへアクセスしない想定。
 */
export async function scrapeSyllabus(query: string): Promise<ScrapeResult> {
  try {
    const courses = await scrapeLive(query);
    return { courses, source: "scraped" };
  } catch (err) {
    const demoMatches = searchCourses(DEMO_COURSES, { query }).map((r) => r.course);
    return {
      courses: demoMatches,
      source: "demo",
      warning: `大学シラバスサイトへのライブ検索に失敗したため、デモデータを表示しています（${
        err instanceof Error ? err.message : String(err)
      }）。本番環境でも失敗する場合は src/lib/scraper-config.ts のセレクタを実サイトのHTML構造に合わせて調整してください。`,
    };
  }
}
