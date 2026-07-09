/**
 * 旭川大学シラバス検索システム (CampusWeb系, https://cx.asahikawa-u.ac.jp/campusweb/slbssrch.do)
 * 向けのスクレイピング設定。
 *
 * この開発環境からは大学サイトへのネットワークアクセスがゲートウェイで
 * ブロックされており（`cx.asahikawa-u.ac.jp` への CONNECT が 403）、検索フォーム
 * 自体のHTML構造は確認できていない。ただし、別途取得された実データ
 * （public/data/asahikawa-courses-2026.json、2026年度経済学部経営経済学科130科目）
 * から、シラバス詳細ページのURL構造は確認できている:
 *
 *   https://cx.asahikawa-u.ac.jp/campusweb/slbssbdr.do
 *     ?value(risyunen)=2026        … 履修年度
 *     &value(semekikn)=1           … 学期区分(1=前期系？要確認)
 *     &value(kougicd)=41101301     … 講義コード
 *     &value(crclumcd)=2611110     … カリキュラムコード
 *
 *   科目データのid (`${risyunen}-${kougicd}-${crclumcd}`) からこのURLを組み立て
 *   直接シラバス詳細へリンクできる（本アプリではsyllabus_urlをそのまま保持している）。
 *
 * 検索フォーム側(`slbssrch.do`)のPOSTパラメータ名は未確認のため、Apache Struts を
 * 基盤とした日本の大学向け教務システム（いわゆる「キャンパスウェブ」系）で
 * 非常によく見られる一般的な構造を前提に実装している。
 *
 * さらに、実データ各科目の raw["取得元検索条件"] フィールドに "grade1"〜"grade3" や
 * "day1"〜"day5" という値が残っており、これは実データを収集したスクレイパーが
 * キーワードの自由入力ではなく「学年」「曜日」を条件に検索を繰り返して全件を
 * 収集していたことを示す一次情報である。そのため本実装も、科目名によるキーワード
 * 検索に加えて、学年・曜日を条件にした全件同期（scrapeAllCourses / bulkQueryCandidates）
 * を用意し、同じ戦略を再現できるようにしている。学年・曜日のフィールド名自体は
 * 依然として未確認のため、こちらもよくある命名を複数候補用意している。
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
  // 実データの raw["取得元検索条件"] (grade1〜grade3, day1〜day5) から、学年・曜日
  // による絞り込み検索が実在することが分かっている。フィールド名自体は未確認のため
  // よくある命名を複数候補用意し、POST時に同時送信する。
  gradeFieldCandidates: ["gakunen", "risyunendo_str_gakunen", "grade", "configuredGrade"],
  dayFieldCandidates: ["youbi", "risyunendo_str_youbi", "day", "youbiCd"],
  // 学年(1〜4)・曜日(1=月〜7=日、実データでは1〜5のみ観測)の値そのもの。
  gradeValues: [1, 2, 3, 4],
  dayValues: [1, 2, 3, 4, 5],
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
    "table tr:has(a[href*='slbssbdr'])",
  ],
  resultSelectors: {
    name: "a.subject-link, a[href*='slbssbdr'], a[href*='kamoku']",
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
