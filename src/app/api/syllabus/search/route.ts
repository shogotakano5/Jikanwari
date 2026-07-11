import { NextRequest, NextResponse } from "next/server";
import { scrapeSyllabus } from "@/lib/scraper";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ courses: [], warning: "検索語が空です" });
  }
  const result = await scrapeSyllabus(query);
  return NextResponse.json(result);
}

/**
 * ログインID・パスワードを使うシラバス検索。クエリパラメータではなくPOSTボディで
 * 受け取る（GETのクエリ文字列はアクセスログやブラウザ履歴に残るため認証情報を
 * 含めるのは避ける）。認証情報はこのリクエスト処理中のみ使用し、保存しない。
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as { q?: string; userId?: string; password?: string });
  const query = body.q?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ courses: [], warning: "検索語が空です" });
  }
  const credentials = body.userId && body.password ? { userId: body.userId, password: body.password } : undefined;
  const result = await scrapeSyllabus(query, credentials);
  return NextResponse.json(result);
}
