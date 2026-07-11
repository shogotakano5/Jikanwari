import { NextRequest, NextResponse } from "next/server";
import { scrapeAllCourses } from "@/lib/scraper";

/**
 * 管理者用: 学年×曜日ごとに検索を繰り返し、「経営経済学科」所属の専門科目を
 * 全件取得する。学生向け画面（設定・シラバス検索）からは呼び出さない
 * （src/app/scraper-admin/page.tsx専用）。認証情報はこのリクエスト処理中のみ
 * メモリ上で使い、保存しない。
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}) as { userId?: string; password?: string });
  if (!body.userId || !body.password) {
    return NextResponse.json({ ok: false, error: "userId・passwordが必要です" }, { status: 400 });
  }
  const result = await scrapeAllCourses({ userId: body.userId, password: body.password });
  return NextResponse.json(result);
}
