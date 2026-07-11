import { NextRequest, NextResponse } from "next/server";
import { debugSearch } from "@/lib/scraper";

/**
 * 管理者用: 検索結果が0件になる原因調査用。ログインしてから1回だけ検索を実行し、
 * 生HTMLの診断情報（タイトル・ログイン画面らしさ・テーブル数・詳細リンク数・
 * HTML先頭部分）を一緒に返す。学生向け画面からは呼び出さない。
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}) as { userId?: string; password?: string; query?: string });
  if (!body.userId || !body.password) {
    return NextResponse.json({ ok: false, error: "userId・passwordが必要です" }, { status: 400 });
  }
  const result = await debugSearch(body.query ?? "", { userId: body.userId, password: body.password });
  return NextResponse.json(result);
}
