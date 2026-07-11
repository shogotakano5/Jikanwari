import type { Course, CompletedCourse, GraduationRequirementSet, RequirementCategory, CourseStatus, Track } from "@/types";

/**
 * 経済学部経営経済学科 卒業要件（入学年度・コース別）。
 *
 * 2023〜2025年度入学者(旧カリキュラム)と2026年度入学者以降(新カリキュラム)とで
 * 科目ナンバリング体系・卒業要件の区分構成そのものが異なるため、入学年度で
 * 判定ロジックを分ける。さらにどちらの年度も2年次以降に3コース
 * (経済学/経営(・法学)/会計(・商学))のいずれかに所属し、選択必修A〜Eの
 * 対象科目がコースごとに異なるため、コースも判定条件に含める。
 *
 * 出典:
 * - 2023〜2025年度入学者: 2024年度履修ガイド P.20-22
 *   「経営経済学科 コース別の卒業要件」表（科目ナンバリングのコード表：
 *   ＥＣ１＝総合科目・ＥＣ２〜７＝基幹科目・ＥＣ８＝教職課程科目、を含む）。
 *   2023年度・2025年度履修ガイドでも基幹科目群特論の科目名・単位数の構成が
 *   同一であることを確認済み。
 * - 2026年度入学者以降: 2026年度履修ガイド P.9, P.24-25
 *   「経営経済学科 コース別の卒業要件」表。
 */

const ELECTIVE_KEYS = ["A", "B", "C", "D", "E"] as const;
type ElectiveKey = (typeof ELECTIVE_KEYS)[number];

export const TRACK_OPTIONS: { value: Track; legacyLabel: string; currentLabel: string }[] = [
  { value: "economics", legacyLabel: "経済学コース", currentLabel: "経済学コース" },
  { value: "management", legacyLabel: "経営・法学コース", currentLabel: "経営学コース" },
  { value: "accounting", legacyLabel: "会計・商学コース", currentLabel: "会計学コース" },
];

function isLegacyCurriculum(entryYear: number): boolean {
  return entryYear <= 2025;
}

export function trackLabel(track: Track, entryYear: number): string {
  const option = TRACK_OPTIONS.find((o) => o.value === track) ?? TRACK_OPTIONS[0];
  return isLegacyCurriculum(entryYear) ? option.legacyLabel : option.currentLabel;
}

// ---- 2023〜2025年度入学者（旧カリキュラム） ----
const LEGACY_REQUIRED_GENERAL = ["英語Ⅰ", "英語Ⅱ", "数学Ⅰ", "情報処理Ⅰ", "情報処理Ⅱ", "ゼミナールⅠ", "キャリア形成論"];
const LEGACY_ELECTIVE_REQUIRED_LANGUAGE = [
  "英語Ⅲ",
  "英語Ⅳ",
  "ロシア語Ⅰ",
  "ロシア語Ⅱ",
  "中国語Ⅰ",
  "中国語Ⅱ",
  "ドイツ語Ⅰ",
  "ドイツ語Ⅱ",
  "ハングルⅠ",
  "ハングルⅡ",
];
const LEGACY_REQUIRED_PROFESSIONAL = ["経済学Ⅰ", "経済学Ⅱ", "ゼミナールⅡ", "ゼミナールⅢ", "ゼミナールⅣ"];

const LEGACY_ELECTIVE_GROUPS: Record<Track, Record<ElectiveKey, string[]>> = {
  economics: {
    A: ["マクロ経済学Ⅰ", "マクロ経済学Ⅱ", "ミクロ経済学Ⅰ", "ミクロ経済学Ⅱ"],
    B: ["経済原論Ⅰ", "経済原論Ⅱ", "経済学史Ⅰ", "経済学史Ⅱ"],
    C: ["日本経済史Ⅰ", "日本経済史Ⅱ", "西洋経済史Ⅰ", "西洋経済史Ⅱ"],
    D: ["国際経済論Ⅰ", "国際経済論Ⅱ", "北海道経済論", "あさひかわ学"],
    E: [
      "経営学Ⅰ",
      "経営学Ⅱ",
      "人的資源管理論Ⅰ",
      "人的資源管理論Ⅱ",
      "民法Ⅰ（物権法）",
      "民法Ⅱ（契約法）",
      "会社法Ⅰ",
      "会社法Ⅱ",
      "簿記原理Ⅰ",
      "簿記原理Ⅱ",
      "簿記原理Ⅲ",
      "会計学",
      "会計基準論",
      "マーケティング論Ⅰ",
      "マーケティング論Ⅱ",
    ],
  },
  management: {
    A: ["マクロ経済学Ⅰ", "マクロ経済学Ⅱ", "ミクロ経済学Ⅰ", "ミクロ経済学Ⅱ", "経済原論Ⅰ", "経済原論Ⅱ", "経済学史Ⅰ", "経済学史Ⅱ"],
    B: ["日本経済史Ⅰ", "日本経済史Ⅱ", "西洋経済史Ⅰ", "西洋経済史Ⅱ", "国際経済論Ⅰ", "国際経済論Ⅱ", "北海道経済論", "あさひかわ学"],
    C: ["経営学Ⅰ", "経営学Ⅱ", "人的資源管理論Ⅰ", "人的資源管理論Ⅱ"],
    D: ["民法Ⅰ（物権法）", "民法Ⅱ（契約法）", "会社法Ⅰ", "会社法Ⅱ", "行政法Ⅰ（作用法）", "行政法Ⅱ（救済法）"],
    E: ["簿記原理Ⅰ", "簿記原理Ⅱ", "簿記原理Ⅲ", "会計学", "会計基準論", "商品流通論", "マーチャンダイジング論", "マーケティング論Ⅰ", "マーケティング論Ⅱ"],
  },
  accounting: {
    A: ["マクロ経済学Ⅰ", "マクロ経済学Ⅱ", "ミクロ経済学Ⅰ", "ミクロ経済学Ⅱ", "経済原論Ⅰ", "経済原論Ⅱ", "経済学史Ⅰ", "経済学史Ⅱ"],
    B: ["日本経済史Ⅰ", "日本経済史Ⅱ", "西洋経済史Ⅰ", "西洋経済史Ⅱ"],
    C: ["経営学Ⅰ", "経営学Ⅱ", "人的資源管理論Ⅰ", "人的資源管理論Ⅱ", "民法Ⅰ（物権法）", "民法Ⅱ（契約法）", "会社法Ⅰ", "会社法Ⅱ"],
    D: ["簿記原理Ⅰ", "簿記原理Ⅱ", "簿記原理Ⅲ", "財務会計Ⅰ", "財務会計Ⅱ", "財務会計Ⅲ"],
    E: ["会計学", "会計基準論", "商品流通論", "マーチャンダイジング論", "マーケティング論Ⅰ", "マーケティング論Ⅱ", "金融論"],
  },
};

// ---- 2026年度入学者以降（新カリキュラム） ----
const CURRENT_REQUIRED_GENERAL = [
  "地域社会学",
  "あさひかわ学",
  "アカデミック・スキルズ",
  "数理・データサイエンス",
  "EnglishCommunicationⅠ",
  "EnglishCommunicationⅡ",
  "数学",
  "経済学",
  "EnglishCommunicationⅢ",
  "情報処理Ⅰ",
];
const CURRENT_REQUIRED_PROFESSIONAL = ["理論経済学入門", "人文・社会科学演習", "専門演習Ⅰ", "専門演習Ⅱ", "卒業論文"];

const CURRENT_ELECTIVE_GROUPS: Record<Track, Record<ElectiveKey, string[]>> = {
  economics: {
    A: ["マクロ経済学Ⅰ", "マクロ経済学Ⅱ", "ミクロ経済学Ⅰ", "ミクロ経済学Ⅱ", "経済数学", "計量経済学"],
    B: ["北海道経済論", "農業経済論Ⅰ", "農業経済論Ⅱ", "労働経済論", "労働政策論"],
    C: ["経済学史Ⅰ", "経済学史Ⅱ", "日本経済史Ⅰ", "日本経済史Ⅱ", "西洋経済史Ⅰ", "西洋経済史Ⅱ"],
    D: ["国際経済論Ⅰ", "国際経済論Ⅱ", "開発経済論Ⅰ", "開発経済論Ⅱ", "金融論", "財政論"],
    E: [
      "経営学Ⅰ",
      "経営学Ⅱ",
      "人的資源管理論Ⅰ",
      "人的資源管理論Ⅱ",
      "会社法Ⅰ",
      "会社法Ⅱ",
      "マーケティング論Ⅰ",
      "マーケティング論Ⅱ",
      "民法Ⅰ（総則）",
      "民法Ⅱ（物権）",
      "民法Ⅲ（契約）",
      "簿記原理Ⅰ",
      "簿記原理Ⅱ",
      "会計学Ⅰ",
      "会計学Ⅱ",
    ],
  },
  management: {
    A: ["経営学Ⅰ", "経営学Ⅱ", "現代企業論Ⅰ", "現代企業論Ⅱ", "会社法Ⅰ", "会社法Ⅱ"],
    B: ["経営組織論Ⅰ", "経営組織論Ⅱ", "人的資源管理論Ⅰ", "人的資源管理論Ⅱ", "労働法Ⅰ", "労働法Ⅱ"],
    C: ["流通論Ⅰ", "流通論Ⅱ", "マーケティング論Ⅰ", "マーケティング論Ⅱ", "民法Ⅲ（契約）"],
    D: ["簿記原理Ⅰ", "簿記原理Ⅱ", "財務会計Ⅰ", "財務会計Ⅱ", "会計学Ⅰ", "会計学Ⅱ"],
    E: [
      "マクロ経済学Ⅰ",
      "マクロ経済学Ⅱ",
      "ミクロ経済学Ⅰ",
      "ミクロ経済学Ⅱ",
      "経済学史Ⅰ",
      "経済学史Ⅱ",
      "日本経済史Ⅰ",
      "日本経済史Ⅱ",
      "西洋経済史Ⅰ",
      "西洋経済史Ⅱ",
      "国際経済論Ⅰ",
      "国際経済論Ⅱ",
      "北海道経済論",
      "金融論",
      "財政論",
    ],
  },
  accounting: {
    A: ["簿記原理Ⅰ", "簿記原理Ⅱ", "会計学Ⅰ", "会計学Ⅱ"],
    B: ["税法Ⅰ（総論）", "税法Ⅱ（事例研究）", "財務会計Ⅰ", "財務会計Ⅱ"],
    C: ["会社法Ⅰ", "会社法Ⅱ", "民法Ⅰ（総則）", "民法Ⅱ（物権）", "民法Ⅲ（契約）"],
    D: ["経営学Ⅰ", "経営学Ⅱ", "人的資源管理論Ⅰ", "人的資源管理論Ⅱ", "流通論Ⅰ", "流通論Ⅱ", "マーケティング論Ⅰ", "マーケティング論Ⅱ"],
    E: [
      "マクロ経済学Ⅰ",
      "マクロ経済学Ⅱ",
      "ミクロ経済学Ⅰ",
      "ミクロ経済学Ⅱ",
      "経済学史Ⅰ",
      "経済学史Ⅱ",
      "日本経済史Ⅰ",
      "日本経済史Ⅱ",
      "西洋経済史Ⅰ",
      "西洋経済史Ⅱ",
      "国際経済論Ⅰ",
      "国際経済論Ⅱ",
      "北海道経済論",
      "金融論",
      "財政論",
    ],
  },
};

const GENERAL_ELECTIVE_KEY = "全学共通選択";
const PROFESSIONAL_ELECTIVE_KEY = "専門選択";

function electiveRequiredCategories(track: Track, entryYear: number): RequirementCategory[] {
  const groups = isLegacyCurriculum(entryYear) ? LEGACY_ELECTIVE_GROUPS[track] : CURRENT_ELECTIVE_GROUPS[track];
  return ELECTIVE_KEYS.map((k) => ({
    key: `専門選択必修${k}`,
    label: "選択必修" as const,
    groupLabel: `専門 選択必修${k}`,
    requiredCredits: 4,
    matchNames: groups[k],
  }));
}

function buildCategories(entryYear: number, track: Track): RequirementCategory[] {
  if (isLegacyCurriculum(entryYear)) {
    return [
      { key: "全学共通必修", label: "必修", groupLabel: "全学共通・一般 必修", requiredCredits: 16, matchNames: LEGACY_REQUIRED_GENERAL },
      {
        key: "全学共通選択必修",
        label: "選択必修",
        groupLabel: "全学共通・一般 選択必修（外国語）",
        requiredCredits: 4,
        matchNames: LEGACY_ELECTIVE_REQUIRED_LANGUAGE,
      },
      { key: GENERAL_ELECTIVE_KEY, label: "選択", groupLabel: "全学共通・一般 選択", requiredCredits: 24 },
      { key: "専門必修", label: "必修", groupLabel: "専門 必修", requiredCredits: 16, matchNames: LEGACY_REQUIRED_PROFESSIONAL },
      ...electiveRequiredCategories(track, entryYear),
      { key: PROFESSIONAL_ELECTIVE_KEY, label: "選択", groupLabel: "専門 選択", requiredCredits: 44 },
    ];
  }
  return [
    { key: "全学共通必修", label: "必修", groupLabel: "全学共通・一般 必修", requiredCredits: 16, matchNames: CURRENT_REQUIRED_GENERAL },
    { key: GENERAL_ELECTIVE_KEY, label: "選択", groupLabel: "全学共通・一般 選択", requiredCredits: 28 },
    { key: "専門必修", label: "必修", groupLabel: "専門 必修", requiredCredits: 16, matchNames: CURRENT_REQUIRED_PROFESSIONAL },
    ...electiveRequiredCategories(track, entryYear),
    { key: PROFESSIONAL_ELECTIVE_KEY, label: "選択", groupLabel: "専門 選択", requiredCredits: 44 },
  ];
}

/**
 * 全カリキュラム(2023〜2025年度入学者・2026年度入学者以降)×全コースの必修・選択必修
 * 科目名を重複排除して集約したもの。全学共通・一般教育科目もここに含まれる
 * （CURRENT_REQUIRED_GENERAL / LEGACY_REQUIRED_GENERAL 由来）。
 * スクレイピング時に「所属」フィルタの値を推測する代わりに、この科目名リストで
 * 直接検索することで、経営経済学科に限らず全学共通科目も含めて確実に検索できる。
 */
export function allKnownCourseNames(): string[] {
  const names = new Set<string>([
    ...LEGACY_REQUIRED_GENERAL,
    ...LEGACY_ELECTIVE_REQUIRED_LANGUAGE,
    ...LEGACY_REQUIRED_PROFESSIONAL,
    ...CURRENT_REQUIRED_GENERAL,
    ...CURRENT_REQUIRED_PROFESSIONAL,
  ]);
  for (const groups of [LEGACY_ELECTIVE_GROUPS, CURRENT_ELECTIVE_GROUPS]) {
    for (const track of Object.values(groups)) {
      for (const key of ELECTIVE_KEYS) {
        for (const name of track[key]) names.add(name);
      }
    }
  }
  return [...names];
}

/**
 * 履修ガイドの科目名一覧表に記載された単位数（出典: 2024年度履修ガイドP.21・
 * 2026年度履修ガイドP.25の「単位」列）。ほぼ全科目が一律2単位のため、例外的に
 * 異なる単位数の科目のみ個別指定し、それ以外はデフォルト2単位として扱う。
 * このデフォルト値もPDFの記載を目視確認した上での値であり、推測ではない。
 */
const LEGACY_CREDIT_OVERRIDES: Record<string, number> = {
  ゼミナールⅠ: 4,
  ゼミナールⅡ: 4,
  ゼミナールⅢ: 4,
  ゼミナールⅣ: 4,
};
const CURRENT_CREDIT_OVERRIDES: Record<string, number> = {
  あさひかわ学: 1,
  EnglishCommunicationⅠ: 1,
  EnglishCommunicationⅡ: 1,
  EnglishCommunicationⅢ: 1,
  専門演習Ⅰ: 4,
  専門演習Ⅱ: 4,
  卒業論文: 4,
};

function guideCreditsFor(name: string, entryYear: number): number {
  const overrides = isLegacyCurriculum(entryYear) ? LEGACY_CREDIT_OVERRIDES : CURRENT_CREDIT_OVERRIDES;
  return overrides[name] ?? 2;
}

/**
 * スクレイピングで取得できなかった必修・選択必修科目を、履修ガイドの科目名一覧
 * （出典: 2024年度・2026年度履修ガイド）から簡易的なCourseとして補う。
 * 単位数のみ履修ガイドの表から直接取得した確定値（guideCreditsFor）を使い、
 * それ以外の詳細（担当教員・開講曜日時限・評価方法等）はシラバスでしか分からない
 * ため一切推測せず、シラバス検索で確認するよう案内文に明記する。
 * `existingCourses`に同名の科目が既にある場合は生成しない（スクレイピング済みの
 * 実データを簡易データで上書きしないため）。
 */
export function buildGuideFallbackCourses(
  requirementSet: GraduationRequirementSet,
  entryYear: number,
  existingCourses: Course[]
): Course[] {
  const existingNames = new Set(existingCourses.map((c) => c.name));
  const era = isLegacyCurriculum(entryYear) ? "legacy" : "current";
  const seen = new Set<string>();
  const result: Course[] = [];

  for (const cat of requirementSet.categories) {
    if (!cat.matchNames) continue;
    for (const name of cat.matchNames) {
      if (existingNames.has(name) || seen.has(name)) continue;
      seen.add(name);
      result.push({
        id: `guide-${era}-${name}`,
        name,
        teacher: "（履修ガイド記載・担当教員はシラバス検索で確認してください）",
        faculty: requirementSet.faculty,
        department: requirementSet.department,
        credits: guideCreditsFor(name, entryYear),
        targetYears: [],
        semester: "通年",
        overview:
          "履修ガイドの科目名一覧に掲載されている科目です。担当教員・開講曜日時限・評価方法などシラバスの詳細情報は未確認のため、大学ポータルへログインしてシラバス検索でご確認ください。",
        evaluation: [],
        keywords: [],
        categoryKey: cat.label,
        categoryGroup: cat.groupLabel,
        source: "guide",
        cachedAt: Date.now(),
      });
    }
  }

  return result;
}

export const SUPPORTED_ENTRY_YEARS = [2023, 2024, 2025, 2026] as const;

/**
 * 入学年度・学部・学科・所属コースから卒業要件セットを組み立てる。
 * 対応する学部・学科は現状「経済学部経営経済学科」のみ。定義済み年度範囲外
 * (将来入学者等)は直近の年度の要件にフォールバックする。
 */
export function findRequirementSet(
  entryYear: number,
  faculty: string,
  department: string,
  track: Track = "economics"
): GraduationRequirementSet | undefined {
  if (faculty !== "経済学部" || department !== "経営経済学科") return undefined;
  const year = Math.min(2026, Math.max(2023, entryYear));
  return {
    id: `keiei-keizai-${year}-${track}`,
    entryYearFrom: year,
    entryYearTo: year,
    faculty,
    department,
    totalCreditsRequired: 124,
    note: `${year}年度入学者向けカリキュラム・${trackLabel(track, year)}（出典: ${year <= 2025 ? "2024" : "2026"}年度履修ガイド）`,
    categories: buildCategories(year, track),
  };
}

/**
 * 科目がどの卒業要件区分としてカウントされるかを判定する。
 * 1. 科目に手動で区分(categoryKey/categoryGroup)が設定されていればそれを優先
 * 2. 必修科目名リストに完全一致すれば必修
 * 3. 選択必修A〜Eの科目名リストに完全一致すればそのグループ
 * 4. それ以外はすべて「専門 選択」とする
 *    （現在搭載している実データ130科目はすべて専門科目のため。全学共通・
 *    一般教育科目のデータが搭載されれば、そちらの判定も別途必要になる）
 */
export function classifyCourse(course: Course, requirementSet: GraduationRequirementSet): RequirementCategory {
  if (course.categoryKey === "必修") {
    const req = requirementSet.categories.find((c) => c.label === "必修" && c.key === "専門必修");
    if (req) return req;
  }
  if (course.categoryKey === "選択必修" && course.categoryGroup) {
    const req = requirementSet.categories.find((c) => c.groupLabel === course.categoryGroup);
    if (req) return req;
  }

  const requiredGeneral = requirementSet.categories.find((c) => c.key === "全学共通必修");
  if (requiredGeneral?.matchNames?.includes(course.name)) return requiredGeneral;
  const requiredProfessional = requirementSet.categories.find((c) => c.key === "専門必修");
  if (requiredProfessional?.matchNames?.includes(course.name)) return requiredProfessional;
  const electiveRequiredLanguage = requirementSet.categories.find((c) => c.key === "全学共通選択必修");
  if (electiveRequiredLanguage?.matchNames?.includes(course.name)) return electiveRequiredLanguage;

  for (const cat of requirementSet.categories) {
    if (cat.matchNames?.includes(course.name) && cat.key.startsWith("専門選択必修")) return cat;
  }

  return (
    requirementSet.categories.find((c) => c.key === PROFESSIONAL_ELECTIVE_KEY) ??
    requirementSet.categories[requirementSet.categories.length - 1]
  );
}

export interface CategoryProgress extends RequirementCategory {
  earnedCredits: number;
  remainingCredits: number;
  satisfied: boolean;
  courses: { courseId: string; courseName: string; credits: number }[];
}

export interface GraduationJudgement {
  requirementSet: GraduationRequirementSet;
  categories: CategoryProgress[];
  totalCreditsRequired: number;
  totalOverallEarnedCredits: number; // 履修済み・履修中の単位合計
  shortfallCredits: number;
  canGraduate: boolean;
  advice: string[];
  scorePercent: number;
}

const COUNTS_TOWARD_PROGRESS: CourseStatus[] = ["completed", "inProgress"];

export function judgeGraduation(
  requirementSet: GraduationRequirementSet,
  completed: CompletedCourse[],
  courseById: Map<string, Course>
): GraduationJudgement {
  const categories: CategoryProgress[] = requirementSet.categories.map((cat) => ({
    ...cat,
    earnedCredits: 0,
    remainingCredits: cat.requiredCredits,
    satisfied: false,
    courses: [],
  }));
  const categoryByKey = new Map(categories.map((c) => [c.key, c]));

  let totalOverallEarnedCredits = 0;
  const countedRecords = completed.filter((r) => COUNTS_TOWARD_PROGRESS.includes(r.status));

  for (const record of countedRecords) {
    const course = courseById.get(record.courseId);
    if (!course) continue;
    totalOverallEarnedCredits += record.creditsEarned;
    const cat = categoryByKey.get(classifyCourse(course, requirementSet).key);
    if (!cat) continue;
    cat.earnedCredits += record.creditsEarned;
    cat.courses.push({ courseId: course.id, courseName: course.name, credits: record.creditsEarned });
  }

  for (const cat of categories) {
    cat.remainingCredits = Math.max(0, cat.requiredCredits - cat.earnedCredits);
    cat.satisfied = cat.earnedCredits >= cat.requiredCredits;
  }

  const shortfallCredits = Math.max(0, requirementSet.totalCreditsRequired - totalOverallEarnedCredits);
  const categoriesSatisfied = categories.every((c) => c.satisfied);
  const totalSatisfied = totalOverallEarnedCredits >= requirementSet.totalCreditsRequired;
  const canGraduate = categoriesSatisfied && totalSatisfied;
  const scorePercent = Math.min(100, Math.round((totalOverallEarnedCredits / requirementSet.totalCreditsRequired) * 100));

  const advice: string[] = [];
  if (canGraduate) {
    advice.push("卒業要件をすべて満たしています。卒業可能です。");
  } else {
    if (!totalSatisfied) {
      advice.push(`あと${shortfallCredits}単位で総取得単位の要件を達成します。`);
    }
    for (const cat of categories) {
      if (!cat.satisfied) {
        const label = cat.groupLabel ?? cat.label;
        advice.push(`${label}が${cat.remainingCredits}単位不足しています。`);
      }
    }
    advice.push(...collectAdviceCourses(categories, requirementSet, courseById));
  }

  const examHeavyCount = Array.from(courseById.values()).filter(
    (c) =>
      countedRecords.some((r) => r.courseId === c.id) &&
      c.evaluation.some((e) => e.type === "試験" && e.percentage >= 80)
  ).length;
  if (examHeavyCount >= 3) {
    advice.push("試験比率の高い科目が多いため、レポート評価の科目を混ぜると負担を分散できます。");
  }

  const futureOnlyHint = Array.from(courseById.values()).find(
    (c) => c.offeredYears && c.offeredYears.length > 0 && !countedRecords.some((r) => r.courseId === c.id)
  );
  if (futureOnlyHint) {
    advice.push(
      `「${futureOnlyHint.name}」は${futureOnlyHint.offeredYears?.join("・")}年度開講のみのため、履修計画に注意してください。`
    );
  }

  return {
    requirementSet,
    categories,
    totalCreditsRequired: requirementSet.totalCreditsRequired,
    totalOverallEarnedCredits,
    shortfallCredits,
    canGraduate,
    advice,
    scorePercent,
  };
}

function collectAdviceCourses(
  categories: CategoryProgress[],
  requirementSet: GraduationRequirementSet,
  courseById: Map<string, Course>
): string[] {
  const advice: string[] = [];
  const takenIds = new Set(categories.flatMap((c) => c.courses.map((cc) => cc.courseId)));
  for (const cat of categories) {
    if (cat.satisfied) continue;
    const candidates = Array.from(courseById.values()).filter(
      (course) => classifyCourse(course, requirementSet).key === cat.key && !takenIds.has(course.id)
    );
    if (candidates.length > 0) {
      const names = candidates.slice(0, 3).map((c) => c.name).join("・");
      const label = cat.groupLabel ?? cat.label;
      advice.push(`${label}の候補: ${names}${candidates.length > 3 ? " など" : ""}`);
    }
  }
  return advice;
}
