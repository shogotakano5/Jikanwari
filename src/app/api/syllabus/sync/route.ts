import { NextResponse } from "next/server";
import { scrapeAllCourses } from "@/lib/scraper";

/**
 * 学年ごとに検索を繰り返して全科目を再取得する（実データ収集時の手法を再現）。
 * 大学サイトへ到達できない環境では失敗し、搭載済みの130科目はそのまま維持される。
 */
export async function POST() {
  const result = await scrapeAllCourses();
  return NextResponse.json(result);
}
