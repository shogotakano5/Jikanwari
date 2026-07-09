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
     * 実フォームの name 属性が分かる場合は先頭に実名を追加する。
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
      keyword: ["value(keyword)", "keyword", "freeword"],
      lectureCode: ["value(kougicd)", "kougicd", "lectureCode"],
    },

    /**
     * 検索ボタン/検索アクションの候補。余分なフィールドは多くの場合無視される。
     */
    submitFields: {
      search: "検索",
      btnSearch: "検索",
      mode: "search",
      action: "search",
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
