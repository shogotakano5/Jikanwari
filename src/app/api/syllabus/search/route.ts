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
