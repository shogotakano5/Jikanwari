/**
 * 旭川市立大学 Campus-Xs / 学生生活ページ向けスクレイピング設定。
 *
 * 対象:
 * - https://cx.asahikawa-u.ac.jp/campusweb/slbssrch.do
 * - https://www.asahikawa-u.ac.jp/student-guide/
 *
 * 方針:
 * - Vercel/Next.js のサーバー側 Route Handler から実行する。
 * - ブラウザ直叩きは CORS と負荷対策のため行わない。
 * - 取得済みデータは DB または KV に保存し、同じ授業・同じ年度リンクを何度も取得しない。
 * - CampusWeb は Struts 系の value(...) パラメータを使う可能性が高いため、
 *   HTMLから hidden input を回収し、検索条件は候補フィールドに同時投入する。
 *
 * 【ログイン必須であることの確認】
 * 実サイトへ直接アクセスして検証した結果、検索フォーム自体(slbssrch.do)は
 * 未ログインでも表示できるが、検索を実行すると（ログイン済みセッションが無い場合）
 * HTTP 500 + ログイン画面へ差し戻される。つまりシラバス検索には学内アカウントでの
 * ログインが必須。auth設定・fieldCandidatesの一部(kouginm/syokunm/keywords/
 * kamokunumber/submitFields.buttonName)は実際のフォームHTMLから直接確認した値。
 * 期間(開講年度・学期)の絞り込みは `value(selectSeidokns)` 等のチェックボックス群
 * (determineKikan()というJSがカンマ区切りで値を詰める)で行われており、年度ごとに
 * チェックボックスの構成自体が変わる可能性が高いため未実装（絞り込み無し＝
 * 全件検索にフォールバックする）。
 */

export const ASAHIKAWA_SCRAPER_CONFIG = {
  campusWeb: {
    baseUrl: "https://cx.asahikawa-u.ac.jp/campusweb/",
    searchPagePath: "slbssrch.do",
    searchSubmitPath: "slbssrch.do",
    detailPath: "slbssbdr.do",

    /**
     * 2026年度検索フォームで表示確認できる値。
     * 旭川市立大学の経済学部に限定するため、開講所属・カリキュラムに「経営経済学科」を使う。
     */
    defaultYear: 2026,
    departmentLabel: "経営経済学科",

    /**
     * CampusWeb 系で頻出するフィールド名候補。
     * 先頭が実フォームHTMLから確認済みの実名（2026年7月時点）、以降は保険の候補名。
     */
    fieldCandidates: {
      year: ["value(risyunen)", "risyunen", "nendo", "year"],
      subjectName: [
        "value(kouginm)",
        "value(kougiName)",
        "value(jugyoName)",
        "kouginm",
        "kmSubjectName",
        "searchKeyword",
        "risyunendo_str_kamokuName",
        "jugyoName",
        "kougiName",
      ],
      subjectMatchType: ["value(kougikensakuKbn)", "kougikensakuKbn", "subjectMatchType"],
      instructorName: [
        "value(syokunm)",
        "value(kyoinnm)",
        "value(kyoinName)",
        "kyoinnm",
        "kmInstructorName",
        "kyoinName",
        "risyunendo_str_kyoinName",
      ],
      instructorMatchType: ["value(kyoinKensakuKbn)", "kyoinKensakuKbn", "instructorMatchType"],
      affiliation: [
        "value(jugyoShozokuCd)",
        "value(kaikoShozokuCd)",
        "value(shozokucd)",
        "kaikoShozokuCd",
        "shozokucd",
        "department",
      ],
      curriculum: ["value(crclumcd)", "crclumcd", "curriculum", "curriculumCode"],
      grade: ["value(gakunen)", "gakunen", "risyunendo_str_gakunen", "grade", "configuredGrade"],
      day: ["value(yobikbn)", "value(youbi)", "youbi", "risyunendo_str_youbi", "day", "youbiCd"],
      period: ["value(jigen)", "jigen", "period", "時限"],
      keyword: ["value(keywords)", "value(keyword)", "keyword", "freeword"],
      lectureCode: ["value(kamokunumber)", "value(kougicd)", "kougicd", "lectureCode"],
    },

    /**
     * 検索実行ボタン。実フォームの検索ボタンは onclick="exec('searchKougi',this,null)"
     * であり、これがform submit時にbuttonNameへ設定される値（実フォームHTMLで確認済み）。
     */
    submitFields: {
      buttonName: "searchKougi",
    } as Record<string, string>,

    matchTypeValues: {
      prefix: "1",
      partial: "2",
      exact: "3",
    },

    gradeValues: [1, 2, 3, 4],
    dayValues: [1, 2, 3, 4, 5, 6],
    periodValues: [1, 2, 3, 4, 5, 6, 7],

    selectors: {
      hiddenFields: "form input[type=hidden]",
      resultRows: [
        "table tr:has(a[href*='slbssbdr.do'])",
        "table tr:has(a[href*='slbssbdr'])",
        "table.ttl_table tr",
        "table.result tr",
        "table.list tr",
        "table.kensaku-result tr",
        ".search-result-row",
      ],
      resultName: "a[href*='slbssbdr.do'], a[href*='slbssbdr'], a.subject-link, a[href*='kamoku']",
      detailLink: "a[href*='slbssbdr.do'], a[href*='slbssbdr']",
      detailTables: "table",
    },
  },

  /**
   * 大学ポータル(Campus-Xs)ログイン。実サイトへのアクセスで確認済み:
   * GET top.do でログインフォーム(action="/campusweb/login.do;jsessionid=...")が
   * 得られ、POST login.do に buttonName=login, lang=1, userId, password を送る。
   * 認証失敗時はHTTP 401 + 本文に「ユーザIDまたはパスワードが違います。」を含む。
   */
  auth: {
    loginPagePath: "top.do",
    fields: {
      buttonName: "buttonName",
      lang: "lang",
      userId: "userId",
      password: "password",
    },
    loginButtonValue: "login",
    langValue: "1",
    loginFormSelector: 'form[name="loginForm"]',
    invalidCredentialsMarkers: ["ユーザIDまたはパスワードが違います"],
  },

  studentGuide: {
    url: "https://www.asahikawa-u.ac.jp/student-guide/",
    selectors: {
      links: "a[href]",
      main: "main, article, .contents, body",
      headings: "h1, h2, h3",
    },
    wantedTextPatterns: [
      /履修ガイド/,
      /学生生活の手引き/,
      /シラバス/,
      /カリキュラムマップ/,
    ],
  },

  request: {
    timeoutMs: 12_000,
    minIntervalMs: 800,
    userAgent:
      "Mozilla/5.0 (compatible; AsahikawaCoursePlanner/1.0; +https://example.invalid/course-planner)",
  },
} as const;

export type CampusSearchInput = {
  year?: number;
  subjectName?: string;
  instructorName?: string;
  keyword?: string;
  lectureCode?: string;
  grade?: number;
  day?: number;
  period?: number;
  departmentLabel?: string;
  limit?: number;
};

export type ScrapedCourse = {
  id: string;
  year?: number;
  termCode?: string;
  lectureCode?: string;
  curriculumCode?: string;
  name: string;
  teacher?: string;
  credits?: string;
  day?: string;
  period?: string;
  department?: string;
  syllabusUrl?: string;
  rawText?: string;
  detail?: Record<string, string>;
};

export type StudentGuideLink = {
  title: string;
  url: string;
  kind: "course_guide" | "student_life" | "syllabus" | "curriculum_map" | "other";
  year?: number;
};
