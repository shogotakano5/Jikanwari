import { NextRequest, NextResponse } from "next/server";
import { scrapeAllCourses } from "@/lib/scraper";

/**
 * 学年ごとに検索を繰り返して全科目を再取得する（実データ収集時の手法を再現）。
 * 大学サイトのシラバス検索はログイン必須のため、リクエストボディに
 * { userId, password } が含まれる場合はその場でログインしてから取得する。
 * この認証情報はこのリクエスト処理中のみメモリ上で使い、レスポンスを返したら
 * 破棄する（サーバー側のDB・キャッシュ・ログには一切書き込まない）。
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}) as { userId?: string; password?: string });
  const credentials = body.userId && body.password ? { userId: body.userId, password: body.password } : undefined;
  const result = await scrapeAllCourses(credentials);
  return NextResponse.json(result);
}
