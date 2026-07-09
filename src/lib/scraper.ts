import * as cheerio from "cheerio";
import { unstable_cache } from "next/cache";
import type { Course, EvaluationItem, Weekday } from "@/types";
import { SCRAPER_CONFIG } from "./scraper-config";
import { normalizeQuery } from "./search";

export interface ScrapeResult {
  courses: Course[];
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

/**
 * 大学のシラバス検索システムへライブアクセスを試みる。
 * 到達不能・構造不一致など何らかの理由で失敗した場合は必ず例外を投げる
 * （呼び出し側で「見つかりませんでした」として扱う）。
 */
async function scrapeLive(query: string): Promise<Course[]> {
  const { cookie, hiddenFields } = await fetchSearchForm();

  const body = new URLSearchParams(hiddenFields);
  for (const field of SCRAPER_CONFIG.subjectNameFieldCandidates) body.set(field, query);
  for (const [k, v] of Object.entries(SCRAPER_CONFIG.submitActionFieldCandidates)) body.set(k, v);

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

  let rows = $();
  for (const selector of SCRAPER_CONFIG.resultRowSelectorCandidates) {
    const candidate = $(selector);
    if (candidate.length > 0) {
      rows = candidate;
      break;
    }
  }
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
    });
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
const cachedScrapeLive = unstable_cache(
  async (normalizedQuery: string) => scrapeLive(normalizedQuery),
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
    const courses = await cachedScrapeLive(normalized);
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
