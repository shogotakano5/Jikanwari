export type Weekday = "月" | "火" | "水" | "木" | "金" | "土";

export const WEEKDAYS: Weekday[] = ["月", "火", "水", "木", "金", "土"];
export const PERIODS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Period = (typeof PERIODS)[number];

export type Semester = "前期" | "後期" | "通年" | "集中";
/** 時間割上のタブとして扱う学期区分（通年科目は前期・後期の両方に現れる） */
export type Term = "前期" | "後期" | "集中";
export const TERMS: Term[] = ["前期", "後期", "集中"];

export const GRADES = [1, 2, 3, 4] as const;
export type Grade = (typeof GRADES)[number];

export type CategoryKey = "必修" | "選択必修" | "選択" | "自由選択";

export type CourseStatus = "completed" | "inProgress" | "planned";
export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  completed: "履修済み",
  inProgress: "履修中",
  planned: "履修予定",
};

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
  targetYears: number[]; // 配当学年 e.g. [1,2]
  semester: Semester;
  day: Weekday;
  period: Period;
  room?: string;
  overview: string;
  goals?: string; // 到達目標
  prerequisites?: string; // 履修条件
  courseNumbering?: string; // 科目ナンバリング
  evaluation: EvaluationItem[];
  textbook?: string;
  references?: string; // 参考書
  keywords: string[];
  /**
   * 手動指定の区分（必修/選択必修/選択/自由選択）。未指定の場合は
   * `classifyCourse()` による科目名ベースの自動判定にフォールバックする。
   */
  categoryKey?: CategoryKey;
  categoryGroup?: string; // e.g. 選択必修グループ名 "選択必修A"
  source: "scraped" | "demo";
  syllabusUrl?: string;
  cachedAt: number;
  offeredYears?: number[]; // 開講年度 (来年度開講のみ, etc.) — undefined = every year
}

export interface TimetableEntry {
  id: string; // `${grade}-${term}-${day}-${period}`
  grade: Grade;
  term: Term;
  day: Weekday;
  period: Period;
  courseId: string;
  addedAt: number;
}

export interface CompletedCourse {
  courseId: string;
  status: CourseStatus;
  completedYear: number; // 履修年度 (西暦)
  grade?: string;
  creditsEarned: number;
  updatedAt: number;
}

export interface RequirementCategory {
  key: string; // unique within the requirement set, e.g. "必修" or "選択必修A"
  label: CategoryKey;
  groupLabel?: string; // display sub-label, e.g. "選択必修A"
  requiredCredits: number;
  /** この区分に自動分類する際の科目名マッチルール */
  matchNames?: string[]; // 完全一致する科目名（必修科目リスト等）
  matchPattern?: string; // 部分一致させる正規表現ソース（例: "マクロ|ミクロ"）
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
