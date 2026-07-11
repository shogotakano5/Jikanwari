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

function extractSetCookiePairs(headers: Headers): [string, string][] {
  // Next.js/Node fetch は環境によって getSetCookie がある。
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const cookies = anyHeaders.getSetCookie?.() ?? [];
  const fallback = headers.get("set-cookie");
  if (fallback && cookies.length === 0) cookies.push(fallback);

  const pairs: [string, string][] = [];
  for (const cookie of cookies) {
    const first = cookie.split(";")[0];
    const eq = first.indexOf("=");
    if (eq === -1) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (name) pairs.push([name, value]);
  }
  return pairs;
}

/**
 * ログイン〜検索の一連のリクエストをまたいでCookieを蓄積するジャー。
 * Campus-Xs(Tomcat)は認証成功時にセッション固定攻撃対策で新しいJSESSIONIDを
 * 302リダイレクトのSet-Cookieで発行するため、リダイレクトを手動追従して各ホップの
 * Set-Cookieを取りこぼさず蓄積する必要がある（これが従来ログイン後も未認証扱いに
 * なっていた原因）。
 */
class CookieJar {
  private jar = new Map<string, string>();

  updateFrom(headers: Headers): void {
    for (const [name, value] of extractSetCookiePairs(headers)) {
      this.jar.set(name, value);
    }
  }

  header(): string {
    return [...this.jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  has(name: string): boolean {
    return this.jar.has(name);
  }

  names(): string[] {
    return [...this.jar.keys()];
  }
}

/**
 * politeFetchをリダイレクト手動追従モードで実行し、各ホップのSet-Cookieを
 * jarへ蓄積しながら最終レスポンスを返す。追従時もjarの最新Cookieを送り直す。
 */
async function fetchWithJar(url: string, init: RequestInit, jar: CookieJar, maxRedirects = 5): Promise<Response> {
  let currentUrl = url;
  let method = (init.method ?? "GET").toUpperCase();
  let body = init.body;

  for (let i = 0; i <= maxRedirects; i++) {
    const cookie = jar.header();
    const response = await politeFetch(currentUrl, {
      ...init,
      method,
      body,
      redirect: "manual",
      headers: {
        ...(init.headers ?? {}),
        ...(cookie ? { cookie } : {}),
      },
    });
    jar.updateFrom(response.headers);

    const location = response.headers.get("location");
    const isRedirect = response.status >= 300 && response.status < 400 && location;
    if (!isRedirect) return response;

    // リダイレクト先はbody無しのGETで辿る（303、およびPOST後の302はGETに切り替わるのが通例）
    currentUrl = absoluteUrl(currentUrl, location);
    method = "GET";
    body = undefined;
  }

  throw new Error("リダイレクトが多すぎます（大学サイトの構造が変わった可能性があります）");
}

/** ログインID・パスワードが誤っている、またはCampusWeb側の認証に失敗した場合のエラー */
export class CampusWebAuthError extends Error {
  constructor(message = "ユーザIDまたはパスワードが違います。大学ポータルの認証情報をご確認ください。") {
    super(message);
    this.name = "CampusWebAuthError";
  }
}

export interface CampusWebSession {
  /** ログイン〜検索を通じてCookieを蓄積するジャー */
  jar: CookieJar;
}

/** ログイン処理の結果診断（scraper-adminのログインテスト用） */
export interface LoginDiagnostics {
  ok: boolean;
  finalStatus: number;
  finalTitle: string;
  landedOnLoginPage: boolean;
  cookieNames: string[];
  message: string;
}

/**
 * 大学ポータル(Campus-Xs)へユーザID・パスワードでログインし、以後のシラバス検索に
 * 使えるログイン済みセッション(Cookieジャー)を返す。userId・passwordはこの関数の
 * ローカル変数としてのみ使用し、キャッシュ・ログ・DBなどサーバー側の永続領域には
 * 一切書き込まない。
 *
 * 認証成功時、Campus-Xsは302リダイレクトのSet-Cookieで新しいJSESSIONIDを発行する
 * ため、リダイレクトを手動追従してその新Cookieをジャーへ確実に取り込む
 * （fetchの自動リダイレクト追従だと途中のSet-Cookieを取りこぼし、以降のリクエストが
 * ログイン前の未認証セッションのままになってしまう）。
 */
export async function loginToCampusWeb(userId: string, password: string): Promise<CampusWebSession> {
  const jar = new CookieJar();
  const topUrl = absoluteUrl(cfg.campusWeb.baseUrl, cfg.auth.loginPagePath);
  const topResponse = await fetchWithJar(topUrl, { method: "GET" }, jar);
  if (!topResponse.ok) {
    throw new Error(`ログイン画面の取得に失敗しました: ${topResponse.status}`);
  }

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

  const loginResponse = await fetchWithJar(
    loginUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        referer: topUrl,
      },
      body: params.toString(),
    },
    jar
  );

  const bodyText = await loginResponse.text();

  const failed =
    loginResponse.status === 401 ||
    cfg.auth.invalidCredentialsMarkers.some((marker) => bodyText.includes(marker)) ||
    // リダイレクト追従後もログイン画面が返る = 認証に失敗している
    /class="camjnext-login"/.test(bodyText);
  if (failed) {
    throw new CampusWebAuthError();
  }
  if (!loginResponse.ok) {
    throw new Error(`ログインに失敗しました: ${loginResponse.status}`);
  }

  return { jar };
}

/**
 * ログインだけを試し、結果の診断情報を返す（例外を投げない）。scraper-adminの
 * 「ログインだけテスト」ボタン用。検索が0件になるとき、原因がログイン失敗なのか
 * 検索側なのかを切り分けられるようにする。
 */
export async function testLogin(userId: string, password: string): Promise<LoginDiagnostics> {
  const jar = new CookieJar();
  try {
    const topUrl = absoluteUrl(cfg.campusWeb.baseUrl, cfg.auth.loginPagePath);
    const topResponse = await fetchWithJar(topUrl, { method: "GET" }, jar);
    const topHtml = await topResponse.text();
    const $ = cheerio.load(topHtml);
    const actionPath = $(cfg.auth.loginFormSelector).attr("action");
    if (!actionPath) {
      return {
        ok: false,
        finalStatus: topResponse.status,
        finalTitle: normalizeText($("title").text()),
        landedOnLoginPage: true,
        cookieNames: jar.names(),
        message: "ログインフォームが見つかりませんでした（大学サイトの構造が変わった可能性があります）。",
      };
    }

    const loginUrl = absoluteUrl(cfg.campusWeb.baseUrl, actionPath.replace(/^\/?campusweb\//, ""));
    const params = new URLSearchParams();
    params.set(cfg.auth.fields.buttonName, cfg.auth.loginButtonValue);
    params.set(cfg.auth.fields.lang, cfg.auth.langValue);
    params.set(cfg.auth.fields.userId, userId);
    params.set(cfg.auth.fields.password, password);

    const loginResponse = await fetchWithJar(
      loginUrl,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", referer: topUrl },
        body: params.toString(),
      },
      jar
    );
    const bodyText = await loginResponse.text();
    const $result = cheerio.load(bodyText);
    const landedOnLoginPage =
      /class="camjnext-login"/.test(bodyText) ||
      cfg.auth.invalidCredentialsMarkers.some((marker) => bodyText.includes(marker));
    const invalidCreds =
      loginResponse.status === 401 || cfg.auth.invalidCredentialsMarkers.some((marker) => bodyText.includes(marker));
    const ok = !landedOnLoginPage && loginResponse.status < 400;

    return {
      ok,
      finalStatus: loginResponse.status,
      finalTitle: normalizeText($result("title").text()),
      landedOnLoginPage,
      cookieNames: jar.names(),
      message: ok
        ? "ログインに成功しました。"
        : invalidCreds
          ? "ユーザIDまたはパスワードが違います。"
          : "ログイン後もログイン画面に戻されました（認証に失敗、またはサイト構造の変化の可能性があります）。",
    };
  } catch (err) {
    return {
      ok: false,
      finalStatus: 0,
      finalTitle: "",
      landedOnLoginPage: false,
      cookieNames: jar.names(),
      message: `ログイン試行中にエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
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
  // フォールバック: 実際の結果テーブルの構造が想定と異なる場合に備え、
  // 詳細リンク自身から近い行コンテナ(tr優先、無ければtd、無ければリンクの親)を辿る。
  const links = $(cfg.campusWeb.selectors.detailLink);
  if (links.length === 0) return $();
  const rows = links
    .map((_, link) => {
      const $link = $(link);
      const $tr = $link.closest("tr");
      if ($tr.length > 0) return $tr.get(0);
      const $parent = $link.parent();
      return $parent.length > 0 ? $parent.get(0) : $link.get(0);
    })
    .get()
    .filter((el): el is AnyNode => Boolean(el));
  return $(rows);
}

/** 検索結果が0件だった場合に原因調査できるよう、レスポンスの診断情報を返す */
export interface SearchDiagnostics {
  status: number;
  title: string;
  looksLikeLoginPage: boolean;
  tableCount: number;
  detailLinkCount: number;
  htmlSnippet: string;
}

function buildDiagnostics(status: number, html: string, $: cheerio.CheerioAPI): SearchDiagnostics {
  return {
    status,
    title: normalizeText($("title").text()),
    looksLikeLoginPage: $("body.camjnext-login, form[name='loginForm']").length > 0,
    tableCount: $("table").length,
    detailLinkCount: $(cfg.campusWeb.selectors.detailLink).length,
    htmlSnippet: html.slice(0, 4000),
  };
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

async function runCampusSyllabusSearch(
  input: CampusSearchInput,
  session: CampusWebSession | undefined
): Promise<{ courses: ScrapedCourse[]; diagnostics: SearchDiagnostics }> {
  // ログイン済みならそのジャーを引き継ぎ、未ログインなら一時ジャーでGET→POST間の
  // Cookieを維持する。
  const jar = session?.jar ?? new CookieJar();
  const searchUrl = absoluteUrl(cfg.campusWeb.baseUrl, cfg.campusWeb.searchPagePath);

  const formResponse = await fetchWithJar(searchUrl, { method: "GET" }, jar);
  if (!formResponse.ok) {
    throw new Error(`CampusWeb検索フォームの取得に失敗しました: ${formResponse.status}`);
  }

  const formHtml = await formResponse.text();
  const $form = cheerio.load(formHtml);
  const params = buildCampusSearchParams($form, input);

  // 検索フォームのaction属性(jsessionidをパスに含む実URL)へPOSTする。無ければ
  // 素のslbssrch.doにフォールバック（Cookieのセッションで認証される）。
  const formAction = $form(cfg.campusWeb.selectors.searchForm).attr("action");
  const submitUrl = formAction
    ? absoluteUrl(cfg.campusWeb.baseUrl, formAction.replace(/^\/?campusweb\//, ""))
    : absoluteUrl(cfg.campusWeb.baseUrl, cfg.campusWeb.searchSubmitPath);

  const resultResponse = await fetchWithJar(
    submitUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        referer: searchUrl,
      },
      body: params.toString(),
    },
    jar
  );

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

  return {
    courses: [...unique.values()].slice(0, input.limit ?? 80),
    diagnostics: buildDiagnostics(resultResponse.status, resultHtml, $result),
  };
}

export async function scrapeCampusSyllabus(input: CampusSearchInput = {}, session?: CampusWebSession): Promise<ScrapedCourse[]> {
  const { courses } = await runCampusSyllabusSearch(input, session);
  return courses;
}

/** 検索結果が0件の原因調査用。生HTMLの診断情報も一緒に返す（admin用スクレイパーページで使用） */
export async function scrapeCampusSyllabusWithDiagnostics(
  input: CampusSearchInput = {},
  session?: CampusWebSession
): Promise<{ courses: ScrapedCourse[]; diagnostics: SearchDiagnostics }> {
  return runCampusSyllabusSearch(input, session);
}

export async function scrapeCampusSyllabusDetail(
  course: Pick<ScrapedCourse, "syllabusUrl">,
  session?: CampusWebSession
): Promise<Record<string, string>> {
  if (!course.syllabusUrl) return {};

  const jar = session?.jar ?? new CookieJar();
  const response = await fetchWithJar(course.syllabusUrl, { method: "GET" }, jar);
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

export interface NamedSearchProgress {
  done: number;
  total: number;
  name: string;
  found: number;
}

/**
 * 科目名の完全一致リストを1件ずつ検索する。全学共通・一般教育科目は「経営経済学科」
 * という所属フィルタの対象外である可能性が高く、所属ラベルを推測するより
 * 科目名で直接検索するほうが確実（履修ガイドで科目名が判明している必修・
 * 選択必修科目はこの方法で網羅できる）。学年・曜日を指定しないため、
 * 全学年・全曜日にまたがる科目も取りこぼさない。
 */
export async function scrapeCoursesByNames(
  names: string[],
  year: number,
  session?: CampusWebSession,
  onProgress?: (progress: NamedSearchProgress) => void
): Promise<ScrapedCourse[]> {
  const seen = new Map<string, ScrapedCourse>();

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const courses = await scrapeCampusCourseWithDetail({ year, subjectName: name, limit: 5 }, session).catch(() => []);
    for (const course of courses) {
      if (!seen.has(course.id)) seen.set(course.id, course);
    }
    onProgress?.({ done: i + 1, total: names.length, name, found: seen.size });
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
