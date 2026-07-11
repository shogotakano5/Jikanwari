import { NextRequest, NextResponse } from "next/server";
import { testCampusLogin } from "@/lib/scraper";

/**
 * 管理者用: 大学ポータルへのログインだけを試し、成否・遷移先タイトル・取得できた
 * Cookie名などの診断情報を返す。検索が0件になるとき、原因がログイン失敗なのか
 * 検索側なのかを切り分けるために使う。認証情報は保存しない。
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}) as { userId?: string; password?: string });
  if (!body.userId || !body.password) {
    return NextResponse.json({ ok: false, error: "userId・passwordが必要です" }, { status: 400 });
  }
  const result = await testCampusLogin({ userId: body.userId, password: body.password });
  return NextResponse.json(result);
}
