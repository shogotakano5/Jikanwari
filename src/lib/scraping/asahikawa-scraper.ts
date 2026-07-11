import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import {
  ASAHIKAWA_SCRAPER_CONFIG,
  type CampusSearchInput,
  type ScrapedCourse,
  type StudentGuideLink,
} from "./scraper-config";

const cfg = ASAHIKAWA_SCRAPER_CONFIG;

let lastRequestAt = 0;

function absoluteUrl(base: string, pathOrUrl: string): string {
  return new URL(pathOrUrl, base).toString();
}

function normalizeText(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function politeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < cfg.request.minIntervalMs) {
    await wait(cfg.request.minIntervalMs - elapsed);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.request.timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": cfg.request.userAgent,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ja,en;q=0.8",
        ...(init.headers ?? {}),
      },
    });
    lastRequestAt = Date.now();
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function collectSetCookie(headers: Headers): string {
  // Next.js/Node fetch は環境によって getSetCookie がある。
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const cookies = anyHeaders.getSetCookie?.() ?? [];
  const fallback = headers.get("set-cookie");
  if (fallback) cookies.push(fallback);

  return cookies
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

/** 複数のCookie文字列("a=1; b=2")を名前ベースでマージし、後勝ちで1本の文字列にまとめる */
function mergeCookies(...cookieStrings: (string | undefined)[]): string {
  const map = new Map<string, string>();
  for (const cs of cookieStrings) {
    if (!cs) continue;
    for (const pair of cs.split(";")) {
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!name) continue;
      map.set(name, value);
    }
  }
  return [...map.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

/** ログインID・パスワードが誤っている、またはCampusWeb側の認証に失敗した場合のエラー */
export class CampusWebAuthError extends Error {
  constructor(message = "ユーザIDまたはパスワードが違います。大学ポータルの認証情報をご確認ください。") {
    super(message);
    this.name = "CampusWebAuthError";
  }
}

export interface CampusWebSession {
  /** 以降のリクエストのCookieヘッダーにそのまま使うログイン済みセッション文字列 */
  cookie: string;
}

/**
 * 大学ポータル(Campus-Xs)へユーザID・パスワードでログインし、以後のシラバス検索に
 * 使えるセッションCookieを返す。userId・passwordはこの関数のローカル変数としてのみ
 * 使用し、キャッシュ・ログ・DBなどサーバー側の永続領域には一切書き込まない。
 */
export async function loginToCampusWeb(userId: string, password: string): Promise<CampusWebSession> {
  const topUrl = absoluteUrl(cfg.campusWeb.baseUrl, cfg.auth.loginPagePath);
  const topResponse = await politeFetch(topUrl, { method: "GET" });
  if (!topResponse.ok) {
    throw new Error(`ログイン画面の取得に失敗しました: ${topResponse.status}`);
  }

  const initialCookie = collectSetCookie(topResponse.headers);
  const html = await topResponse.text();
  const $ = cheerio.load(html);
  const actionPath = $(cfg.auth.loginFormSelector).attr("action");
  if (!actionPath) {
    throw new Error("ログインフォームが見つかりませんでした（大学サイトの構造が変わった可能性があります）");
  }

  const loginUrl = absoluteUrl(cfg.campusWeb.baseUrl, actionPath.replace(/^\/?campusweb\//, ""));

  const params = new URLSearchParams();
  params.set(cfg.auth.fields.buttonName, cfg.auth.loginButtonValue);
  params.set(cfg.auth.fields.lang, cfg.auth.langValue);
  params.set(cfg.auth.fields.userId, userId);
  params.set(cfg.auth.fields.password, password);

  const loginResponse = await politeFetch(loginUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      referer: topUrl,
      ...(initialCookie ? { cookie: initialCookie } : {}),
    },
    body: params.toString(),
  });

  const responseCookie = collectSetCookie(loginResponse.headers);
  const cookie = mergeCookies(initialCookie, responseCookie);
  const bodyText = await loginResponse.text();

  const failed =
    loginResponse.status === 401 ||
    cfg.auth.invalidCredentialsMarkers.some((marker) => bodyText.includes(marker));
  if (failed) {
    throw new CampusWebAuthError();
  }
  if (!loginResponse.ok) {
    throw new Error(`ログインに失敗しました: ${loginResponse.status}`);
  }

  return { cookie };
}

function collectHiddenFields($: cheerio.CheerioAPI): URLSearchParams {
  const params = new URLSearchParams();
  $(cfg.campusWeb.selectors.hiddenFields).each((_, input) => {
    const name = $(input).attr("name");
    if (!name) return;
    params.set(name, $(input).attr("value") ?? "");
  });
  return params;
}

function appendCandidates(params: URLSearchParams, fieldNames: readonly string[], value: string | number | undefined): void {
  if (value === undefined || value === null || value === "") return;
  for (const name of fieldNames) params.set(name, String(value));
}

function appendSelectByLabel($: cheerio.CheerioAPI, params: URLSearchParams, fieldNames: readonly string[], label: string): void {
  if (!label) return;

  const labels = [label, label.replace(/\s+/g, "")];
  $("select").each((_, select) => {
    const selectName = $(select).attr("name");
    if (!selectName) return;

    const option = $(select)
      .find("option")
      .filter((_, optionEl) => labels.some((candidate) => normalizeText($(optionEl).text()).includes(candidate)))
      .first();

    const value = option.attr("value");
    if (!value) return;

    const nameLooksRelated = fieldNames.some((candidateName) =>
      selectName.toLowerCase().includes(candidateName.replace(/value\(|\)/g, "").toLowerCase()),
    );
    const nearbyText = normalizeText($(select).parent().text());
    const labelLooksRelated = /開講所属|所属|カリキュラム|学科/.test(nearbyText);

    if (nameLooksRelated || labelLooksRelated) {
      params.set(selectName, value);
    }
  });
}

function buildCampusSearchParams($: cheerio.CheerioAPI, input: CampusSearchInput): URLSearchParams {
  const fields = cfg.campusWeb.fieldCandidates;
  const params = collectHiddenFields($);

  appendCandidates(params, fields.year, input.year ?? cfg.campusWeb.defaultYear);
  appendCandidates(params, fields.subjectName, input.subjectName);
  appendCandidates(params, fields.instructorName, input.instructorName);
  appendCandidates(params, fields.keyword, input.keyword);
  appendCandidates(params, fields.lectureCode, input.lectureCode);
  appendCandidates(params, fields.grade, input.grade);
  appendCandidates(params, fields.day, input.day);
  appendCandidates(params, fields.period, input.period);

  appendCandidates(params, fields.subjectMatchType, cfg.campusWeb.matchTypeValues.partial);
  appendCandidates(params, fields.instructorMatchType, cfg.campusWeb.matchTypeValues.partial);

  for (const [key, value] of Object.entries(cfg.campusWeb.submitFields)) {
    params.set(key, value);
  }

  appendSelectByLabel(
    $,
    params,
    [...fields.affiliation, ...fields.curriculum],
    input.departmentLabel ?? cfg.campusWeb.departmentLabel,
  );

  return params;
}

function chooseResultRows($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode> {
  for (const selector of cfg.campusWeb.selectors.resultRows) {
    const rows = $(selector).filter((_, row) => $(row).find(cfg.campusWeb.selectors.detailLink).length > 0);
    if (rows.length > 0) return rows;
  }
  return $();
}

function parseCourseFromRow($: cheerio.CheerioAPI, row: AnyNode): ScrapedCourse | null {
  const $row = $(row);
  const linkEl = $row.find(cfg.campusWeb.selectors.detailLink).first();
  const href = linkEl.attr("href");
  if (!href) return null;

  const syllabusUrl = absoluteUrl(cfg.campusWeb.baseUrl, href);
  const url = new URL(syllabusUrl);
  const qp = url.searchParams;

  const lectureCode = qp.get("value(kougicd)") ?? qp.get("kougicd") ?? undefined;
  const curriculumCode = qp.get("value(crclumcd)") ?? qp.get("crclumcd") ?? undefined;
  const yearText = qp.get("value(risyunen)") ?? qp.get("risyunen") ?? undefined;
  const termCode = qp.get("value(semekikn)") ?? qp.get("semekikn") ?? undefined;
  const year = yearText ? Number(yearText) : undefined;

  const cells = $row
    .find("td")
    .map((_, cell) => normalizeText($(cell).text()))
    .get()
    .filter(Boolean);

  const name = normalizeText(linkEl.text()) || cells.find((cell) => /[一-龠ぁ-んァ-ヶA-Za-z]/.test(cell)) || "名称未取得";
  const rawText = normalizeText($row.text());

  const id = [yearText, lectureCode, curriculumCode].filter(Boolean).join("-") || syllabusUrl;

  return {
    id,
    year,
    termCode,
    lectureCode,
    curriculumCode,
    name,
    teacher: cells.find((cell) => /教員|教授|准教授|講師/.test(cell)) ?? cells[2],
    credits: cells.find((cell) => /^\d+(\.\d+)?$/.test(cell)) ?? undefined,
    syllabusUrl,
    rawText,
  };
}

function parseDetailTables($: cheerio.CheerioAPI): Record<string, string> {
  const detail: Record<string, string> = {};

  $(cfg.campusWeb.selectors.detailTables).each((_, table) => {
    $(table)
      .find("tr")
      .each((_, tr) => {
        const th = normalizeText($(tr).find("th").first().text());
        const tds = $(tr)
          .find("td")
          .map((_, td) => normalizeText($(td).text()))
          .get()
          .filter(Boolean);

        if (th && tds.length > 0) {
          detail[th] = tds.join(" / ");
          return;
        }

        const cells = $(tr)
          .find("td")
          .map((_, td) => normalizeText($(td).text()))
          .get()
          .filter(Boolean);
        if (cells.length >= 2 && cells[0].length <= 40) {
          detail[cells[0]] = cells.slice(1).join(" / ");
        }
      });
  });

  return detail;
}

export async function scrapeCampusSyllabus(input: CampusSearchInput = {}, session?: CampusWebSession): Promise<ScrapedCourse[]> {
  const searchUrl = absoluteUrl(cfg.campusWeb.baseUrl, cfg.campusWeb.searchPagePath);

  const formResponse = await politeFetch(searchUrl, {
    method: "GET",
    headers: session ? { cookie: session.cookie } : {},
  });
  if (!formResponse.ok) {
    throw new Error(`CampusWeb検索フォームの取得に失敗しました: ${formResponse.status}`);
  }

  const formCookie = collectSetCookie(formResponse.headers);
  const cookie = session ? mergeCookies(session.cookie, formCookie) : formCookie;
  const formHtml = await formResponse.text();
  const $form = cheerio.load(formHtml);
  const params = buildCampusSearchParams($form, input);

  const submitUrl = absoluteUrl(cfg.campusWeb.baseUrl, cfg.campusWeb.searchSubmitPath);
  const resultResponse = await politeFetch(submitUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      referer: searchUrl,
      ...(cookie ? { cookie } : {}),
    },
    body: params.toString(),
  });

  if (!resultResponse.ok) {
    throw new Error(
      resultResponse.status === 500
        ? "CampusWeb検索に失敗しました（未ログイン、またはセッション切れの可能性があります）"
        : `CampusWeb検索に失敗しました: ${resultResponse.status}`
    );
  }

  const resultHtml = await resultResponse.text();
  const $result = cheerio.load(resultHtml);
  const rows = chooseResultRows($result);
  const courses: ScrapedCourse[] = [];

  rows.each((_, row) => {
    const course = parseCourseFromRow($result, row);
    if (!course) return;
    courses.push(course);
  });

  const unique = new Map<string, ScrapedCourse>();
  for (const course of courses) {
    if (!unique.has(course.id)) unique.set(course.id, course);
  }

  return [...unique.values()].slice(0, input.limit ?? 80);
}

export async function scrapeCampusSyllabusDetail(
  course: Pick<ScrapedCourse, "syllabusUrl">,
  session?: CampusWebSession
): Promise<Record<string, string>> {
  if (!course.syllabusUrl) return {};

  const response = await politeFetch(course.syllabusUrl, {
    method: "GET",
    headers: session ? { cookie: session.cookie } : {},
  });
  if (!response.ok) {
    throw new Error(`シラバス詳細の取得に失敗しました: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  return parseDetailTables($);
}

export async function scrapeCampusCourseWithDetail(input: CampusSearchInput, session?: CampusWebSession): Promise<ScrapedCourse[]> {
  const courses = await scrapeCampusSyllabus(input, session);
  const result: ScrapedCourse[] = [];

  for (const course of courses) {
    const detail = await scrapeCampusSyllabusDetail(course, session).catch(() => ({}));
    result.push({ ...course, detail });
  }

  return result;
}

export async function scrapeAllEconomicsCourses(year = cfg.campusWeb.defaultYear, session?: CampusWebSession): Promise<ScrapedCourse[]> {
  const seen = new Map<string, ScrapedCourse>();

  for (const grade of cfg.campusWeb.gradeValues) {
    for (const day of cfg.campusWeb.dayValues) {
      const courses = await scrapeCampusSyllabus(
        {
          year,
          grade,
          day,
          departmentLabel: cfg.campusWeb.departmentLabel,
          limit: 300,
        },
        session
      ).catch(() => []);

      for (const course of courses) {
        if (!seen.has(course.id)) seen.set(course.id, course);
      }
    }
  }

  return [...seen.values()];
}

function detectStudentGuideKind(title: string, url: string): StudentGuideLink["kind"] {
  if (/学生生活の手引き/.test(title)) return "student_life";
  if (/履修ガイド/.test(title)) return "course_guide";
  if (/シラバス/.test(title) || /slbssrch/.test(url)) return "syllabus";
  if (/カリキュラムマップ/.test(title)) return "curriculum_map";
  return "other";
}

function detectYear(text: string): number | undefined {
  const western = text.match(/20\d{2}/)?.[0];
  if (western) return Number(western);

  const reiwa = text.match(/令和\s*(\d+)\s*年度?/);
  if (reiwa) return 2018 + Number(reiwa[1]);

  return undefined;
}

export async function scrapeStudentGuideLinks(): Promise<StudentGuideLink[]> {
  const response = await politeFetch(cfg.studentGuide.url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`履修ガイド・学生生活ページの取得に失敗しました: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const links: StudentGuideLink[] = [];

  $(cfg.studentGuide.selectors.links).each((_, a) => {
    const title = normalizeText($(a).text()) || normalizeText($(a).attr("title")) || normalizeText($(a).attr("aria-label"));
    const href = $(a).attr("href");
    if (!title || !href) return;

    const wanted = cfg.studentGuide.wantedTextPatterns.some((pattern) => pattern.test(title));
    if (!wanted) return;

    const url = absoluteUrl(cfg.studentGuide.url, href);
    links.push({
      title,
      url,
      kind: detectStudentGuideKind(title, url),
      year: detectYear(title),
    });
  });

  const unique = new Map<string, StudentGuideLink>();
  for (const link of links) unique.set(`${link.title}::${link.url}`, link);

  return [...unique.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}

export async function scrapeLatestStudentGuideLinks(year = cfg.campusWeb.defaultYear): Promise<StudentGuideLink[]> {
  const links = await scrapeStudentGuideLinks();
  return links.filter((link) => link.year === year || link.kind === "syllabus");
}
