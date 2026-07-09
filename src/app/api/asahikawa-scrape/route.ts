import { NextResponse, type NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import {
  scrapeCampusCourseWithDetail,
  scrapeCampusSyllabus,
  scrapeLatestStudentGuideLinks,
  scrapeStudentGuideLinks,
} from "@/lib/scraping/asahikawa-scraper";
import type { CampusSearchInput } from "@/lib/scraping/scraper-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * サーバー側共有キャッシュ。メモリキャッシュ（サーバーレスでは再起動のたび消える）
 * の代わりに、Jikanwariの他のAPI (`src/lib/scraper.ts`) と同じくNext.jsのData Cache
 * (`unstable_cache`) を使い、外部DB・環境変数なしで複数ユーザー間の共有キャッシュを
 * 実現する（Ver.11-④方針）。
 */
const cachedStudentGuideLinks = unstable_cache(async () => scrapeStudentGuideLinks(), ["asahikawa-student-guide-all"], {
  revalidate: 60 * 60 * 24 * 7,
  tags: ["asahikawa-student-guide"],
});
const cachedLatestStudentGuideLinks = unstable_cache(
  async (year: number) => scrapeLatestStudentGuideLinks(year as Parameters<typeof scrapeLatestStudentGuideLinks>[0]),
  ["asahikawa-student-guide-latest"],
  { revalidate: 60 * 60 * 24 * 7, tags: ["asahikawa-student-guide"] }
);
const cachedSyllabus = unstable_cache(async (input: CampusSearchInput) => scrapeCampusSyllabus(input), ["asahikawa-syllabus"], {
  revalidate: 60 * 60 * 24 * 30,
  tags: ["asahikawa-syllabus"],
});
const cachedSyllabusDetail = unstable_cache(
  async (input: CampusSearchInput) => scrapeCampusCourseWithDetail(input),
  ["asahikawa-syllabus-detail"],
  { revalidate: 60 * 60 * 24 * 30, tags: ["asahikawa-syllabus"] }
);

function toNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const type = params.get("type") ?? "syllabus";
  const year = toNumber(params.get("year")) ?? 2026;

  try {
    if (type === "student-guide") {
      const data = params.get("latest") === "1" ? await cachedLatestStudentGuideLinks(year) : await cachedStudentGuideLinks();
      return NextResponse.json({ ok: true, data });
    }

    if (type === "syllabus") {
      const data = await cachedSyllabus({
        year,
        subjectName: params.get("q") ?? undefined,
        instructorName: params.get("teacher") ?? undefined,
        keyword: params.get("keyword") ?? undefined,
        grade: toNumber(params.get("grade")),
        day: toNumber(params.get("day")),
        period: toNumber(params.get("period")),
        limit: toNumber(params.get("limit")) ?? 80,
      });
      return NextResponse.json({ ok: true, data });
    }

    if (type === "syllabus-detail") {
      const data = await cachedSyllabusDetail({
        year,
        subjectName: params.get("q") ?? undefined,
        lectureCode: params.get("lectureCode") ?? undefined,
        limit: toNumber(params.get("limit")) ?? 20,
      });
      return NextResponse.json({ ok: true, data });
    }

    return NextResponse.json({ ok: false, error: "unknown type" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "scrape failed",
      },
      { status: 500 }
    );
  }
}
