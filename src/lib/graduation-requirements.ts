import type { Course, CompletedCourse, GraduationRequirementSet, RequirementCategory, CourseStatus } from "@/types";

/**
 * 経済学部経営経済学科 卒業要件（入学年度別）。
 *
 * ユーザー提供の参考実装（学生便覧ベースで作成されたと思われるプロトタイプ）の
 * 区分構成・必修科目名・単位数をそのまま採用している:
 *   総取得単位124 = 必修20 + 選択必修A〜E(各8=40) + 選択44 + 自由選択20
 * 2023〜2026年度入学まで同一の値だったため、年度が変わっても要件が変わらない
 * 可能性もあるが、本アプリの卒業判定は入学年度別にセットを引く設計を維持し、
 * 学生便覧の改定が確認され次第、年度ごとに数値を差し替えられるようにしてある。
 * 数値の最終確認は学生便覧（https://www.asahikawa-u.ac.jp/student-guide/）で行うこと。
 */

// 必修科目（参考実装のrequiredCourseNamesをそのまま採用）
const REQUIRED_COURSE_NAMES = [
  "経済学(経済)",
  "理論経済学入門",
  "経営学Ⅰ",
  "経営学Ⅱ",
  "簿記原理Ⅰ",
  "簿記原理Ⅱ",
  "会計学Ⅰ",
  "会計学Ⅱ",
  "情報処理Ⅰa",
  "情報処理Ⅰb",
  "キャリア形成論",
];

// 選択必修A〜Eの自動分類ルール（科目名の部分一致・参考実装のrequirementBucketをそのまま採用）
const ELECTIVE_REQUIRED_PATTERNS: Record<"A" | "B" | "C" | "D" | "E", string> = {
  A: "マクロ|ミクロ|理論|経済学史|日本経済史|西洋経済史",
  B: "国際|地域|北海道|農業|労働|政策|社会保障|経済地理",
  C: "経営|企業|組織|人的資源|キャリア",
  D: "会計|簿記|財務|原価|商品|マーチャン",
  E: "法|憲法|民法|行政法|情報|数学|地理|地誌|倫理|異文化|総合",
};

function electiveRequiredCategories(): RequirementCategory[] {
  return (Object.keys(ELECTIVE_REQUIRED_PATTERNS) as Array<keyof typeof ELECTIVE_REQUIRED_PATTERNS>).map((k) => ({
    key: `選択必修${k}`,
    label: "選択必修",
    groupLabel: `選択必修${k}`,
    requiredCredits: 8,
    matchPattern: ELECTIVE_REQUIRED_PATTERNS[k],
  }));
}

function baseCategories(): RequirementCategory[] {
  return [
    { key: "必修", label: "必修", requiredCredits: 20, matchNames: REQUIRED_COURSE_NAMES },
    ...electiveRequiredCategories(),
    { key: "選択", label: "選択", requiredCredits: 44 },
    { key: "自由選択", label: "自由選択", requiredCredits: 20 },
  ];
}

export const GRADUATION_REQUIREMENT_SETS: GraduationRequirementSet[] = [2023, 2024, 2025, 2026].map((year) => ({
  id: `keiei-keizai-${year}`,
  entryYearFrom: year,
  entryYearTo: year,
  faculty: "経済学部",
  department: "経営経済学科",
  totalCreditsRequired: 124,
  note: `${year}年度入学者向けカリキュラム（要・学生便覧突合）`,
  categories: baseCategories(),
}));

export function findRequirementSet(entryYear: number, faculty: string, department: string): GraduationRequirementSet | undefined {
  return (
    GRADUATION_REQUIREMENT_SETS.find(
      (set) =>
        entryYear >= set.entryYearFrom &&
        entryYear <= set.entryYearTo &&
        set.faculty === faculty &&
        set.department === department
    ) ??
    // フォールバック: 完全一致がなければ直近の学部一致セットを使う
    GRADUATION_REQUIREMENT_SETS.filter((s) => s.faculty === faculty && s.department === department).sort(
      (a, b) => b.entryYearFrom - a.entryYearFrom
    )[0]
  );
}

/**
 * 科目がどの卒業要件区分としてカウントされるかを判定する。
 * 1. 科目に手動で区分(categoryKey/categoryGroup)が設定されていればそれを優先
 * 2. 必修科目名リストに完全一致すれば必修
 * 3. 選択必修A〜Eの科目名パターンに部分一致すればそのグループ
 * 4. 自由選択が明示されていれば自由選択
 * 5. それ以外はすべて「選択」
 */
export function classifyCourse(course: Course, requirementSet: GraduationRequirementSet): RequirementCategory {
  if (course.categoryKey === "必修") {
    const req = requirementSet.categories.find((c) => c.label === "必修");
    if (req) return req;
  }
  if (course.categoryKey === "選択必修" && course.categoryGroup) {
    const req = requirementSet.categories.find((c) => c.groupLabel === course.categoryGroup);
    if (req) return req;
  }
  if (course.categoryKey === "自由選択") {
    const req = requirementSet.categories.find((c) => c.label === "自由選択");
    if (req) return req;
  }

  const required = requirementSet.categories.find((c) => c.label === "必修");
  if (required?.matchNames?.includes(course.name)) return required;

  for (const cat of requirementSet.categories) {
    if (cat.matchPattern && new RegExp(cat.matchPattern).test(course.name)) return cat;
  }

  return requirementSet.categories.find((c) => c.label === "選択") ?? requirementSet.categories[requirementSet.categories.length - 1];
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
