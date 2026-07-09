import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { unstable_cache } from "next/cache";
import type { Course, EvaluationItem, Weekday } from "@/types";
import { SCRAPER_CONFIG } from "./scraper-config";
import { normalizeQuery } from "./search";

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

interface SearchCondition {
  query?: string;
  grade?: number;
  day?: number;
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
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; Jikanwari/1.0; +https://github.com/)",
};

/** Set-Cookie ヘッダ群を次のリクエスト用のCookieヘッダ文字列にまとめる */
function collectCookies(res: Response): string {
  // undici/Node18+ の Response は複数Set-Cookieを getSetCookie() で取得できる
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = anyHeaders.getSetCookie?.() ?? [];
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

/**
 * Strutsベースの教務システムを想定し、まず検索フォームページをGETして
 * セッションCookieとhidden input（CSRFトークン等）を収集する。
 */
async function fetchSearchForm(): Promise<{ cookie: string; hiddenFields: Record<string, string> }> {
  const formUrl = new URL(SCRAPER_CONFIG.searchPagePath, SCRAPER_CONFIG.baseUrl).toString();
  const res = await fetchWithTimeout(formUrl, { headers: COMMON_HEADERS });
  const cookie = collectCookies(res);
  const html = await res.text();
  const $ = cheerio.load(html);
  const hiddenFields: Record<string, string> = {};
  $(SCRAPER_CONFIG.hiddenFieldSelector).each((_, el) => {
    const name = $(el).attr("name");
    if (name) hiddenFields[name] = $(el).attr("value") ?? "";
  });
  return { cookie, hiddenFields };
}

function buildSearchBody(hiddenFields: Record<string, string>, condition: SearchCondition): URLSearchParams {
  const body = new URLSearchParams(hiddenFields);
  if (condition.query) {
    for (const field of SCRAPER_CONFIG.subjectNameFieldCandidates) body.set(field, condition.query);
  }
  if (condition.grade) {
    for (const field of SCRAPER_CONFIG.gradeFieldCandidates) body.set(field, String(condition.grade));
  }
  if (condition.day) {
    for (const field of SCRAPER_CONFIG.dayFieldCandidates) body.set(field, String(condition.day));
  }
  for (const [k, v] of Object.entries(SCRAPER_CONFIG.submitActionFieldCandidates)) body.set(k, v);
  return body;
}

function parseResultRows($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode> {
  for (const selector of SCRAPER_CONFIG.resultRowSelectorCandidates) {
    const candidate = $(selector);
    if (candidate.length > 0) return candidate;
  }
  return $();
}

function rowToCourse($: cheerio.CheerioAPI, el: AnyNode): Course | null {
  const row = $(el);
  const name = row.find(SCRAPER_CONFIG.resultSelectors.name).first().text().trim();
  if (!name) return null;
  const teacher = row.find(SCRAPER_CONFIG.resultSelectors.teacher).first().text().trim();
  const creditsText = row.find(SCRAPER_CONFIG.resultSelectors.credits).first().text().trim();
  const rowText = row.text();
  const dayPeriod = parseDayPeriod(rowText);
  const href = row.find(SCRAPER_CONFIG.resultSelectors.name).first().attr(SCRAPER_CONFIG.resultSelectors.detailLinkAttr);

  return {
    id: `scraped-${Buffer.from(name + teacher).toString("base64url").slice(0, 16)}`,
    name,
    teacher: teacher || "未設定",
    faculty: "経済学部",
    department: "経営経済学科",
    credits: Number(creditsText.replace(/[^0-9]/g, "")) || 2,
    targetYears: [1, 2, 3, 4],
    semester: "前期",
    day: dayPeriod?.day ?? "月",
    period: (dayPeriod?.period as Course["period"]) ?? 1,
    overview: "",
    evaluation: parseEvaluation(rowText),
    keywords: [],
    // categoryKeyは付けない: classifyCourse()が科目名から選択必修A〜E等を自動判定する
    source: "scraped",
    syllabusUrl: href ? new URL(href, SCRAPER_CONFIG.baseUrl).toString() : undefined,
    cachedAt: Date.now(),
  };
}

/**
 * 大学のシラバス検索システムへライブアクセスを試みる。
 * 到達不能・構造不一致など何らかの理由で失敗した場合は必ず例外を投げる
 * （呼び出し側で「見つかりませんでした」として扱う）。
 */
async function scrapeCondition(condition: SearchCondition): Promise<Course[]> {
  const { cookie, hiddenFields } = await fetchSearchForm();
  const body = buildSearchBody(hiddenFields, condition);

  const searchUrl = new URL(SCRAPER_CONFIG.searchSubmitPath, SCRAPER_CONFIG.baseUrl).toString();
  const res = await fetchWithTimeout(searchUrl, {
    method: "POST",
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`syllabus search returned HTTP ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const rows = parseResultRows($);
  if (rows.length === 0) {
    throw new Error("no result rows matched configured selectors — site structure may differ");
  }

  const courses: Course[] = [];
  rows.each((_, el) => {
    const course = rowToCourse($, el);
    if (course) courses.push(course);
  });

  if (courses.length === 0) {
    throw new Error("rows matched but no course names could be extracted");
  }
  return courses;
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
  async (normalizedQuery: string) => scrapeCondition({ query: normalizedQuery }),
  ["jikanwari-syllabus-scrape-v1"],
  { revalidate: 60 * 60 * 24 * 30, tags: ["syllabus-scrape"] }
);

/**
 * Ver.2方針: 検索語について、まずライブスクレイピング（サーバー共有キャッシュ経由）
 * を試みる。失敗（到達不能・構造不一致）した場合は空の結果と警告メッセージを返す
 * （フェイクデータで埋めることはしない）。
 * 成功したデータはさらに呼び出し側（クライアント）がIndexedDBへキャッシュし、
 * 同じブラウザからは以降このAPI自体を呼ばない想定。
 */
export async function scrapeSyllabus(query: string): Promise<ScrapeResult> {
  const normalized = normalizeQuery(query);
  try {
    const courses = await cachedScrapeByQuery(normalized);
    return { courses };
  } catch (err) {
    return {
      courses: [],
      warning: `大学シラバスサイトへのライブ検索に失敗しました（${
        err instanceof Error ? err.message : String(err)
      }）。すでに読み込み済みの130科目以外は、大学サイトへ到達できる環境で src/lib/scraper-config.ts のセレクタを実サイトのHTML構造に合わせて調整するまで検索できません。`,
    };
  }
}

function dedupeCourses(courses: Course[]): Course[] {
  const byId = new Map<string, Course>();
  for (const c of courses) byId.set(c.id, c);
  return Array.from(byId.values());
}

/**
 * public/data/asahikawa-courses-2026.json の元データが実際に収集された際の手法
 * （raw["取得元検索条件"]に "grade1"〜"grade3" 等が残っている）を再現し、学年ごとに
 * 検索して全件を収集する。曜日によるキーワード検索は行っていない（学年条件だけで
 * 全学年をカバーできる想定）。1件でも学年検索が成功すればそれを採用し、全学年で
 * 失敗した場合のみ例外を投げる。
 */
export async function scrapeAllCourses(): Promise<SyncResult> {
  const results: Course[] = [];
  let queriesAttempted = 0;
  let queriesFailed = 0;
  let lastError: unknown;

  for (const grade of SCRAPER_CONFIG.gradeValues) {
    queriesAttempted += 1;
    try {
      const courses = await scrapeCondition({ grade });
      results.push(...courses);
    } catch (err) {
      queriesFailed += 1;
      lastError = err;
    }
  }

  const courses = dedupeCourses(results);
  if (courses.length === 0) {
    return {
      courses: [],
      queriesAttempted,
      queriesFailed,
      warning: `全件同期に失敗しました（${
        lastError instanceof Error ? lastError.message : String(lastError)
      }）。搭載済みの130科目データはそのまま利用できます。大学サイトへ到達できる環境で src/lib/scraper-config.ts のフィールド名・セレクタを実構造に合わせて調整してください。`,
    };
  }
  return {
    courses,
    queriesAttempted,
    queriesFailed,
    warning:
      queriesFailed > 0
        ? `${queriesAttempted}件中${queriesFailed}件の条件でスクレイピングに失敗しましたが、成功した分は反映しました。`
        : undefined,
  };
}
