/**
 * 旭川大学シラバス検索システム (CampusWeb系, https://cx.asahikawa-u.ac.jp/campusweb/slbssrch.do)
 * 向けのスクレイピング設定。
 *
 * この開発環境からは大学サイトへのネットワークアクセスがゲートウェイで
 * ブロックされており（`cx.asahikawa-u.ac.jp` への CONNECT が 403）、実際の
 * HTML構造を確認できていない。`slbssrch.do` という命名は Apache Struts を
 * 基盤とした日本の大学向け教務システム（いわゆる「キャンパスウェブ」系）で
 * 非常によく見られるパターンのため、その一般的な構造を前提に実装している。
 *
 * Strutsベースのシステムは通常、検索フォームのGET時にCSRFトークン等の
 * hidden inputをセッションに紐づけて発行し、POST時にそれを一緒に送る必要が
 * あることが多い。そのため scraper.ts では
 *   1. searchPagePath をGETしてCookieとフォームのhidden inputを全て収集
 *   2. それらを検索条件と一緒にsearchSubmitPathへPOST
 * という2段階の手順を踏み、フォームのフィールド名も複数候補を同時送信する
 * ことで、実際の構造が下記の想定と多少ずれていても動作する可能性を高めている。
 * それでも実サイトに接続できる環境で下記の値を実構造に合わせて調整することを推奨する。
 *
 * 調整手順:
 *   1. ブラウザの開発者ツールでシラバス検索フォームを開き、検索実行時の
 *      Networkタブから実際のPOST先URLとフォームのname属性を確認する。
 *   2. 検索結果ページのHTMLで、1科目ごとの行を囲む要素と、
 *      科目名・教員名・詳細リンクのセレクタを確認する。
 *   3. 下記の値を実際の値に置き換える。
 */
export const SCRAPER_CONFIG = {
  baseUrl: "https://cx.asahikawa-u.ac.jp/campusweb/",
  searchPagePath: "slbssrch.do",
  searchSubmitPath: "slbssrch.do",

  // 検索フォームのフィールド名。実際のname属性が不明なため、よく使われる
  // 候補を複数用意し、POST時にすべて同時送信する（余分なフィールドはサーバー側で
  // 無視されるのが一般的なため副作用は小さい）。
  subjectNameFieldCandidates: [
    "kmSubjectName",
    "searchKeyword",
    "risyunendo_str_kamokuName",
    "jugyoName",
    "kougiName",
  ],
  instructorNameFieldCandidates: ["kmInstructorName", "kyoinName", "risyunendo_str_kyoinName"],
  submitActionFieldCandidates: { search: "1" } as Record<string, string>,

  // GETしたフォームページから収集するhidden inputのセレクタ（CSRFトークン等）
  hiddenFieldSelector: "form input[type=hidden]",

  // 検索結果一覧: 候補となる行セレクタを複数用意し、最初にヒットしたものを使う
  resultRowSelectorCandidates: [
    "table.ttl_table tr",
    "table.result tr",
    "table.list tr",
    "table.kensaku-result tr",
    ".search-result-row",
    "table tr:has(a[href*='slbssbdt'])",
  ],
  resultSelectors: {
    name: "a.subject-link, a[href*='slbssbdt'], a[href*='kamoku']",
    teacher: ".instructor, td:nth-child(3)",
    credits: ".credits, td:nth-child(4)",
    detailLinkAttr: "href",
  },
  detailSelectors: {
    overview: "#overview, .lecture-overview, .syllabus-overview",
    evaluation: "#evaluation, .evaluation-method",
    textbook: "#textbook, .textbook",
  },
  requestTimeoutMs: 8000,
} as const;
