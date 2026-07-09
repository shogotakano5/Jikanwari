import type { Course, CompletedCourse, GraduationRequirementSet, RequirementCategory } from "@/types";

/**
 * 経済学部経済学科 卒業要件（入学年度別）。
 *
 * NOTE: この数値は https://www.asahikawa-u.ac.jp/student-guide/ (学生便覧) を
 * 参照して作成する想定だが、本セッションの開発環境からは大学サイトへの
 * ネットワークアクセスがブロックされており実データを取得できなかったため、
 * 一般的な経済学部カリキュラムを参考にしたプレースホルダー値になっている。
 * 実際に使用する前に学生便覧の該当年度版と突き合わせて `requiredCredits` /
 * `totalCreditsRequired` を修正すること。
 */
export const GRADUATION_REQUIREMENT_SETS: GraduationRequirementSet[] = [
  {
    id: "keizai-2024",
    entryYearFrom: 2024,
    entryYearTo: 2024,
    faculty: "経済学部",
    department: "経済学科",
    totalCreditsRequired: 124,
    note: "2024年度入学者向けカリキュラム（要・学生便覧突合）",
    categories: [
      { key: "必修", label: "必修", requiredCredits: 24 },
      { key: "選択必修:専門", label: "選択必修", groupLabel: "専門選択必修", requiredCredits: 16 },
      { key: "選択必修:教養", label: "選択必修", groupLabel: "教養選択必修", requiredCredits: 8 },
      { key: "選択", label: "選択", requiredCredits: 38 },
      { key: "自由選択", label: "自由選択", requiredCredits: 8 },
    ],
  },
  {
    id: "keizai-2025",
    entryYearFrom: 2025,
    entryYearTo: 2025,
    faculty: "経済学部",
    department: "経済学科",
    totalCreditsRequired: 124,
    note: "2025年度入学者向けカリキュラム（要・学生便覧突合）",
    categories: [
      { key: "必修", label: "必修", requiredCredits: 22 },
      { key: "選択必修:専門", label: "選択必修", groupLabel: "専門選択必修", requiredCredits: 18 },
      { key: "選択必修:教養", label: "選択必修", groupLabel: "教養選択必修", requiredCredits: 8 },
      { key: "選択", label: "選択", requiredCredits: 38 },
      { key: "自由選択", label: "自由選択", requiredCredits: 8 },
    ],
  },
  {
    id: "keizai-2026",
    entryYearFrom: 2026,
    entryYearTo: 2026,
    faculty: "経済学部",
    department: "経済学科",
    totalCreditsRequired: 124,
    note: "2026年度入学者向けカリキュラム（要・学生便覧突合）",
    categories: [
      { key: "必修", label: "必修", requiredCredits: 20 },
      { key: "選択必修:専門", label: "選択必修", groupLabel: "専門選択必修", requiredCredits: 20 },
      { key: "選択必修:教養", label: "選択必修", groupLabel: "教養選択必修", requiredCredits: 8 },
      { key: "選択", label: "選択", requiredCredits: 38 },
      { key: "自由選択", label: "自由選択", requiredCredits: 8 },
    ],
  },
];

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

function courseCategoryKey(course: Course): string {
  if (course.categoryKey === "選択必修" && course.categoryGroup) {
    return `選択必修:${course.categoryGroup.replace(/選択必修$/, "")}`;
  }
  return course.categoryKey;
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
  totalEarnedCredits: number; // 要件カテゴリに計上された単位のみの合計
  totalCreditsRequired: number;
  totalOverallEarnedCredits: number; // 履修済み全科目の単位合計（要件外含む）
  shortfallCredits: number;
  canGraduate: boolean;
  advice: string[];
  unmappedCourses: { courseId: string; courseName: string; credits: number }[];
}

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
  const unmappedCourses: GraduationJudgement["unmappedCourses"] = [];

  let totalOverallEarnedCredits = 0;

  for (const record of completed) {
    const course = courseById.get(record.courseId);
    if (!course) continue;
    totalOverallEarnedCredits += record.creditsEarned;
    const key = courseCategoryKey(course);
    const cat = categoryByKey.get(key);
    if (!cat) {
      unmappedCourses.push({ courseId: course.id, courseName: course.name, credits: record.creditsEarned });
      continue;
    }
    cat.earnedCredits += record.creditsEarned;
    cat.courses.push({ courseId: course.id, courseName: course.name, credits: record.creditsEarned });
  }

  // 各カテゴリの必要単位を超過した分は「総取得単位」には算入するが、
  // カテゴリ自体はrequiredCreditsで頭打ちにせず実値を表示する。
  for (const cat of categories) {
    cat.remainingCredits = Math.max(0, cat.requiredCredits - cat.earnedCredits);
    cat.satisfied = cat.earnedCredits >= cat.requiredCredits;
  }

  // 総取得単位は「各カテゴリの必要単位を満たした分(上限required) + 超過分 + 自由選択扱いできる余剰」
  // を単純化し、実際に取得した全単位の合計を採用する（自由選択が余剰の受け皿になるのが一般的なため）。
  const totalEarnedCredits = Math.min(totalOverallEarnedCredits, requirementSet.totalCreditsRequired) + 0;
  const shortfallCredits = Math.max(0, requirementSet.totalCreditsRequired - totalOverallEarnedCredits);
  const categoriesSatisfied = categories.every((c) => c.satisfied);
  const totalSatisfied = totalOverallEarnedCredits >= requirementSet.totalCreditsRequired;
  const canGraduate = categoriesSatisfied && totalSatisfied;

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
    const necessaryCourses = collectAdviceCourses(categories, courseById);
    advice.push(...necessaryCourses);
  }

  const futureOnlyHint = Array.from(courseById.values()).find(
    (c) => c.offeredYears && c.offeredYears.length > 0 && !completed.some((r) => r.courseId === c.id)
  );
  if (futureOnlyHint) {
    advice.push(
      `「${futureOnlyHint.name}」は${futureOnlyHint.offeredYears?.join("・")}年度開講のみのため、履修計画に注意してください。`
    );
  }

  return {
    requirementSet,
    categories,
    totalEarnedCredits,
    totalCreditsRequired: requirementSet.totalCreditsRequired,
    totalOverallEarnedCredits,
    shortfallCredits,
    canGraduate,
    advice,
    unmappedCourses,
  };
}

function collectAdviceCourses(categories: CategoryProgress[], courseById: Map<string, Course>): string[] {
  const advice: string[] = [];
  const takenIds = new Set(categories.flatMap((c) => c.courses.map((cc) => cc.courseId)));
  for (const cat of categories) {
    if (cat.satisfied) continue;
    const key = cat.key;
    const candidates = Array.from(courseById.values()).filter((course) => {
      const courseKey = courseCategoryKey(course);
      return courseKey === key && !takenIds.has(course.id);
    });
    if (candidates.length > 0) {
      const names = candidates.slice(0, 3).map((c) => c.name).join("・");
      const label = cat.groupLabel ?? cat.label;
      advice.push(`${label}の候補: ${names}${candidates.length > 3 ? " など" : ""}`);
    }
  }
  return advice;
}
