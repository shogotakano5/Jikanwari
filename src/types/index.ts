export type Weekday = "月" | "火" | "水" | "木" | "金" | "土";

export const WEEKDAYS: Weekday[] = ["月", "火", "水", "木", "金", "土"];
export const PERIODS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Period = (typeof PERIODS)[number];

export type Semester = "前期" | "後期" | "通年" | "集中";

export type CategoryKey = "必修" | "選択必修" | "選択" | "自由選択";

export interface EvaluationItem {
  type: string; // 試験 / レポート / 出席 / 小テスト / 平常点 etc.
  percentage: number;
}

export interface Course {
  id: string;
  name: string;
  nameKana?: string;
  teacher: string;
  faculty: string;
  department: string;
  credits: number;
  targetYears: number[]; // 開講学年 e.g. [1,2]
  semester: Semester;
  day: Weekday;
  period: Period;
  room?: string;
  overview: string;
  evaluation: EvaluationItem[];
  textbook?: string;
  keywords: string[];
  categoryKey: CategoryKey;
  categoryGroup?: string; // e.g. 選択必修グループ名 "専門選択必修A"
  source: "scraped" | "demo";
  syllabusUrl?: string;
  cachedAt: number;
  offeredYears?: number[]; // 開講年度 (来年度開講のみ, etc.) — undefined = every year
}

export interface TimetableEntry {
  id: string; // `${day}-${period}`
  day: Weekday;
  period: Period;
  courseId: string;
  addedAt: number;
}

export interface CompletedCourse {
  courseId: string;
  completedYear: number; // 取得年度 (西暦)
  grade?: string;
  creditsEarned: number;
  completedAt: number;
}

export interface RequirementCategory {
  key: string; // unique within the requirement set, e.g. "必修" or "選択必修:専門"
  label: CategoryKey;
  groupLabel?: string; // display sub-label, e.g. "専門選択必修"
  requiredCredits: number;
}

export interface GraduationRequirementSet {
  id: string;
  entryYearFrom: number;
  entryYearTo: number;
  faculty: string;
  department: string;
  totalCreditsRequired: number;
  categories: RequirementCategory[];
  note?: string;
}

export interface Settings {
  id: "app-settings";
  entryYear: number;
  faculty: string;
  department: string;
  displayName?: string;
  theme: "system" | "light" | "dark";
  lastSyllabusSyncNote?: string;
}

export interface FavoriteEntry {
  courseId: string;
  addedAt: number;
}
