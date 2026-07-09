/**
 * 旭川大学シラバス検索システム (CampusWeb系, cx.asahikawa-u.ac.jp) 向けの
 * スクレイピング設定。
 *
 * この開発環境からは大学サイトへのネットワークアクセスがブロックされており、
 * 実際のHTML構造を確認できなかった。そのため、多くの大学で採用されている
 * 「キャンパスウェブ」系シラバス検索システムの一般的な構造を前提に、
 * フォームのフィールド名・検索結果テーブルのセレクタをこの1ファイルに
 * 集約している。実サイトに接続できる環境（本番のVercelデプロイ等）で
 * 実際のHTMLを確認し、下記の値を実構造に合わせて調整すること。
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
  // 検索フォームのフィールド名（一般的なCampusWeb系の命名を仮定）
  formFields: {
    subjectName: "kmSubjectName",
    instructorName: "kmInstructorName",
    submitAction: "search",
  },
  // 検索結果一覧の1行を表すセレクタと、行内の各項目のセレクタ
  resultSelectors: {
    row: "table.ttl_table tr, table.result tr, .search-result-row",
    name: "a.subject-link, a[href*='slbssbdt']",
    teacher: ".instructor, td:nth-child(3)",
    credits: ".credits, td:nth-child(4)",
    detailLinkAttr: "href",
  },
  // 詳細ページのセレクタ
  detailSelectors: {
    overview: "#overview, .lecture-overview, .syllabus-overview",
    evaluation: "#evaluation, .evaluation-method",
    textbook: "#textbook, .textbook",
  },
  requestTimeoutMs: 8000,
} as const;
