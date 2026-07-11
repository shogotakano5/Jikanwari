import { NextRequest, NextResponse } from "next/server";
import { scrapeKnownRequiredCourses } from "@/lib/scraper";
import { allKnownCourseNames } from "@/lib/graduation-requirements";

/**
 * 管理者用: 履修ガイドに記載された必修・選択必修科目名（全学共通・一般教育科目を
 * 含む）を1件ずつ科目名で直接検索する。「経営経済学科」所属フィルタに頼らないため、
 * 全学共通科目や所属フィルタの推測が外れて見つからない科目を補完できる。
 * 科目数が多いため数分かかる（学生向け画面からは呼び出さない）。
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}) as { userId?: string; password?: string });
  if (!body.userId || !body.password) {
    return NextResponse.json({ ok: false, error: "userId・passwordが必要です" }, { status: 400 });
  }
  const result = await scrapeKnownRequiredCourses(allKnownCourseNames(), { userId: body.userId, password: body.password });
  return NextResponse.json(result);
}
