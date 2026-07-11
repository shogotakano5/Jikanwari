"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { findRequirementSet, buildGuideFallbackCourses, SUPPORTED_ENTRY_YEARS, TRACK_OPTIONS } from "@/lib/graduation-requirements";
import type { Course } from "@/types";

/**
 * 大学ポータル(Campus-Xs)へのログインを伴うシラバス一括取得の管理者専用ページ。
 * ボトムナビには登録しておらず、通常の学生向け画面（時間割・設定等）からは
 * リンクされていない（URLを直接開いた場合のみアクセス可能）。
 * ここで入力するログインID・パスワードはこのページのReact state上にのみ存在し、
 * IndexedDBを含むどこにも保存しない。取得リクエストのたびにこのアプリ自身の
 * サーバーへ送信され、大学ポータルへのログインだけに使ったあと即座に破棄される
 * （サーバー側のDB・キャッシュ・ログにも一切保存しない）。
 */

interface SyncResponse {
  courses: Course[];
  queriesAttempted?: number;
  queriesFailed?: number;
  namesAttempted?: number;
  namesFound?: number;
  warning?: string;
  authFailed?: boolean;
}

interface LoginDiagnostics {
  ok: boolean;
  finalStatus: number;
  finalTitle: string;
  landedOnLoginPage: boolean;
  cookieNames: string[];
  message: string;
}

interface DebugResponse {
  courses: Course[];
  diagnostics?: {
    status: number;
    title: string;
    looksLikeLoginPage: boolean;
    tableCount: number;
    detailLinkCount: number;
    htmlSnippet: string;
  };
  warning?: string;
  authFailed?: boolean;
}

const EVAL_LABEL_TO_KEY: Record<string, string> = {
  試験: "exam",
  レポート: "report",
  出席: "attendance",
  発表: "presentation",
  平常点: "participation",
};

function courseToRawRecord(course: Course) {
  const evaluation = { exam: 0, report: 0, attendance: 0, presentation: 0, participation: 0, other: 0 };
  for (const item of course.evaluation) {
    const key = EVAL_LABEL_TO_KEY[item.type] ?? "other";
    (evaluation as Record<string, number>)[key] += item.percentage;
  }
  return {
    id: course.id,
    year: course.syllabusYear ?? new Date().getFullYear(),
    semester: course.semester,
    name: course.name,
    teacher: course.teacher,
    day: course.day ?? "",
    period: course.period ? String(course.period) : "",
    credits: course.credits,
    category: course.categoryGroup ?? course.categoryKey ?? "",
    faculty: course.faculty,
    department: course.department,
    syllabus_url: course.syllabusUrl ?? "",
    description: course.overview,
    goals: course.goals ?? "",
    prerequisites: course.prerequisites ?? "",
    fetched_at: new Date(course.cachedAt).toISOString(),
    evaluation,
    raw: {
      科目ナンバリング: course.courseNumbering ?? "",
      授業計画: course.syllabusPlan ?? "",
      "評価方法・基準": course.evaluationNotes ?? "",
      教科書: course.textbook ?? "",
      参考書: course.references ?? "",
      配当学年: course.targetYears.join("・"),
      取得方法: course.source,
    },
  };
}

function mergeCourses(...lists: Course[][]): Course[] {
  const byId = new Map<string, Course>();
  for (const list of lists) {
    for (const course of list) {
      if (!byId.has(course.id)) byId.set(course.id, course);
    }
  }
  return [...byId.values()];
}

export default function ScraperAdminPage() {
  const { addCourses, courses: storedCourses } = useAppData();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");

  const [scrapedAll, setScrapedAll] = useState<Course[]>([]);
  const [scrapedByName, setScrapedByName] = useState<Course[]>([]);
  const [runningAll, setRunningAll] = useState(false);
  const [runningNames, setRunningNames] = useState(false);
  const [allMessage, setAllMessage] = useState<string | null>(null);
  const [namesMessage, setNamesMessage] = useState<string | null>(null);

  const [debugQuery, setDebugQuery] = useState("");
  const [debugResult, setDebugResult] = useState<DebugResponse | null>(null);
  const [debugRunning, setDebugRunning] = useState(false);

  const [loginTest, setLoginTest] = useState<LoginDiagnostics | null>(null);
  const [loginTesting, setLoginTesting] = useState(false);

  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const scrapedCombined = useMemo(() => mergeCourses(scrapedAll, scrapedByName), [scrapedAll, scrapedByName]);

  // 履修ガイド簡易補完: 対応している全入学年度×全コースの必修・選択必修科目のうち、
  // scrapedCombined（今回スクレイピングできたもの）にも既存のstoredCoursesにも
  // 無い科目名だけを履修ガイドの科目名一覧から補う。
  const guideFallback = useMemo(() => {
    const baseline = mergeCourses(scrapedCombined, storedCourses);
    const results: Course[] = [];
    for (const entryYear of SUPPORTED_ENTRY_YEARS) {
      for (const track of TRACK_OPTIONS.map((t) => t.value)) {
        const reqSet = findRequirementSet(entryYear, "経済学部", "経営経済学科", track);
        if (!reqSet) continue;
        results.push(...buildGuideFallbackCourses(reqSet, entryYear, mergeCourses(baseline, results)));
      }
    }
    return mergeCourses(results);
  }, [scrapedCombined, storedCourses]);

  const finalCourses = useMemo(() => mergeCourses(scrapedCombined, guideFallback), [scrapedCombined, guideFallback]);

  const canRun = userId.trim().length > 0 && password.length > 0;

  async function runTestLogin() {
    setLoginTesting(true);
    setLoginTest(null);
    try {
      const res = await fetch("/api/admin/test-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });
      const data: LoginDiagnostics = await res.json();
      setLoginTest(data);
    } catch (e) {
      setLoginTest({
        ok: false,
        finalStatus: 0,
        finalTitle: "",
        landedOnLoginPage: false,
        cookieNames: [],
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoginTesting(false);
    }
  }

  async function runScrapeAll() {
    setRunningAll(true);
    setAllMessage(null);
    try {
      const res = await fetch("/api/admin/scrape-all", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });
      const data: SyncResponse = await res.json();
      setScrapedAll(data.courses ?? []);
      setAllMessage(
        data.courses?.length
          ? `${data.courses.length}科目を取得しました（学年×曜日ごとに検索、試行${data.queriesAttempted ?? "?"}件中失敗${data.queriesFailed ?? 0}件）。`
          : (data.warning ?? "取得できた科目がありませんでした。")
      );
    } catch (e) {
      setAllMessage(e instanceof Error ? `失敗しました: ${e.message}` : "失敗しました");
    } finally {
      setRunningAll(false);
    }
  }

  async function runScrapeKnownNames() {
    setRunningNames(true);
    setNamesMessage("検索中です。科目数が多いため数分かかることがあります…");
    try {
      const res = await fetch("/api/admin/scrape-known", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });
      const data: SyncResponse = await res.json();
      setScrapedByName(data.courses ?? []);
      setNamesMessage(
        data.courses?.length
          ? `${data.namesAttempted ?? "?"}件の科目名を検索し、${data.courses.length}科目がヒットしました（全学共通科目を含みます）。`
          : (data.warning ?? "ヒットした科目がありませんでした。")
      );
    } catch (e) {
      setNamesMessage(e instanceof Error ? `失敗しました: ${e.message}` : "失敗しました");
    } finally {
      setRunningNames(false);
    }
  }

  async function runDebugSearch() {
    setDebugRunning(true);
    setDebugResult(null);
    try {
      const res = await fetch("/api/admin/debug-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, password, query: debugQuery }),
      });
      const data: DebugResponse = await res.json();
      setDebugResult(data);
    } catch (e) {
      setDebugResult({ courses: [], warning: e instanceof Error ? e.message : String(e) });
    } finally {
      setDebugRunning(false);
    }
  }

  async function saveToIndexedDb() {
    await addCourses(finalCourses);
    setSavedMessage(`${finalCourses.length}科目をこの端末のIndexedDBに保存しました（このブラウザでのみ確認できます）。`);
  }

  function downloadJson() {
    const records = finalCourses.map(courseToRawRecord);
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asahikawa-courses-scraped-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-8">
      <h1 className="text-xl font-bold">シラバス スクレイパー（管理者用）</h1>
      <p className="mt-1 text-sm text-zinc-500">
        大学ポータル(Campus-Xs)へのログインを伴うシラバス一括取得はこのページから行います。通常の学生向け画面（時間割・設定）には
        ログイン欄を置いていません。ここで入力するログインID・パスワードは<strong>このページを閉じると消え、どこにも保存されません</strong>
        （サーバー側にも保存しません。取得のたびに一時的にログインするためだけに使います）。
      </p>

      <div className="mt-4 flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <label className="flex flex-col gap-1 text-sm">
          ログインID（学籍番号等）
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            autoComplete="off"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          パスワード
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-sm font-semibold">まずログインだけテスト</p>
        <p className="mt-1 text-xs text-zinc-500">
          取得が0件になるとき、ログイン自体が失敗しているのか検索側の問題なのかを切り分けます。
        </p>
        <button
          onClick={runTestLogin}
          disabled={!canRun || loginTesting}
          className="mt-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-900 disabled:opacity-50"
        >
          {loginTesting ? "ログイン確認中..." : "ログインだけテスト"}
        </button>
        {loginTest && (
          <div className={`mt-2 text-xs ${loginTest.ok ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            <p className="font-semibold">{loginTest.ok ? "✓ ログイン成功" : "✗ ログイン失敗"}: {loginTest.message}</p>
            <ul className="mt-1 list-disc pl-4 text-zinc-600 dark:text-zinc-300">
              <li>最終HTTPステータス: {loginTest.finalStatus}</li>
              <li>遷移先ページタイトル: {loginTest.finalTitle || "（取得できず）"}</li>
              <li>ログイン画面に留まった: {loginTest.landedOnLoginPage ? "はい" : "いいえ"}</li>
              <li>取得できたCookie: {loginTest.cookieNames.join(", ") || "なし"}</li>
            </ul>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-sm font-semibold">① 経営経済学科の専門科目を全件取得</p>
        <p className="mt-1 text-xs text-zinc-500">学年(1〜4)×曜日(月〜土)ごとに検索し、結果をまとめます。</p>
        <button
          onClick={runScrapeAll}
          disabled={!canRun || runningAll}
          className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {runningAll ? "取得中..." : "実行する"}
        </button>
        {allMessage && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{allMessage}</p>}
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-sm font-semibold">② 履修ガイド記載科目を名前で検索（全学共通科目を含む）</p>
        <p className="mt-1 text-xs text-zinc-500">
          「経営経済学科」の所属フィルタに頼らず、履修ガイドに載っている必修・選択必修の科目名（全学共通・一般教育科目を含む）を1件ずつ検索します。
          対象科目数が多いため数分かかることがあります。
        </p>
        <button
          onClick={runScrapeKnownNames}
          disabled={!canRun || runningNames}
          className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {runningNames ? "検索中..." : "実行する"}
        </button>
        {namesMessage && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">{namesMessage}</p>}
      </div>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
        <p className="font-semibold">③ 結果の集計</p>
        <ul className="mt-1 list-disc pl-4">
          <li>①②でスクレイピングできた科目: {scrapedCombined.length}件</li>
          <li>①②で見つからなかった必修・選択必修科目を履修ガイドの科目名一覧から簡易補完: {guideFallback.length}件（単位数のみ確定値、担当教員・曜日時限は未確認）</li>
          <li>合計: {finalCourses.length}件</li>
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={saveToIndexedDb} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-900">
            この端末のIndexedDBに保存（確認用）
          </button>
          <button
            onClick={downloadJson}
            disabled={finalCourses.length === 0}
            className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-200"
          >
            JSONをダウンロード（public/data/への反映用）
          </button>
        </div>
        {savedMessage && <p className="mt-2 text-amber-700 dark:text-amber-300">{savedMessage}</p>}
        <p className="mt-2 text-amber-700/80 dark:text-amber-400/80">
          このページの「IndexedDBに保存」はこの端末のブラウザにのみ反映されます。全ユーザーに配布するには、ダウンロードしたJSONを
          開発者が public/data/asahikawa-courses-&#123;年度&#125;.json としてリポジトリに反映・デプロイする必要があります。
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-sm font-semibold">デバッグ: 検索結果0件の原因調査</p>
        <p className="mt-1 text-xs text-zinc-500">
          検索語を1つ指定してログイン→検索を実行し、実際のレスポンスHTMLの診断情報を表示します。
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={debugQuery}
            onChange={(e) => setDebugQuery(e.target.value)}
            placeholder="例: 経済学"
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            onClick={runDebugSearch}
            disabled={!canRun || debugRunning || !debugQuery.trim()}
            className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {debugRunning ? "実行中..." : "実行"}
          </button>
        </div>
        {debugResult && (
          <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
            {debugResult.warning && <p className="text-red-600 dark:text-red-400">{debugResult.warning}</p>}
            {debugResult.diagnostics && (
              <ul className="mt-1 list-disc pl-4">
                <li>HTTPステータス: {debugResult.diagnostics.status}</li>
                <li>ページタイトル: {debugResult.diagnostics.title}</li>
                <li>ログイン画面と判定: {debugResult.diagnostics.looksLikeLoginPage ? "はい（セッションが切れている可能性）" : "いいえ"}</li>
                <li>&lt;table&gt;要素数: {debugResult.diagnostics.tableCount}</li>
                <li>詳細リンク数: {debugResult.diagnostics.detailLinkCount}</li>
                <li>検索でヒットした科目数: {debugResult.courses.length}</li>
              </ul>
            )}
            {debugResult.diagnostics && (
              <details className="mt-2">
                <summary className="cursor-pointer text-blue-600 dark:text-blue-400">生HTML(先頭4000文字)を表示</summary>
                <pre className="mt-1 max-h-96 overflow-auto rounded bg-zinc-100 p-2 text-[10px] whitespace-pre-wrap dark:bg-zinc-900">
                  {debugResult.diagnostics.htmlSnippet}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
