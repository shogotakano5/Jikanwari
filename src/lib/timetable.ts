import type { Course, GraduationRequirementSet, Grade, Semester, Term, TimetableEntry } from "@/types";
import { GRADES, TERMS } from "@/types";
import { classifyCourse } from "./graduation-requirements";

/** 科目の開講学期(通年含む)が、選択中の学期タブと一致するか */
export function termMatchesSemester(semester: Semester, term: Term): boolean {
  if (semester === "通年") return term === "前期" || term === "後期";
  return semester === term;
}

/** 科目の配当学年に、選択中の学年が含まれるか（未設定の科目は常に候補に含める） */
export function gradeMatchesCourse(course: Course, grade: Grade): boolean {
  if (!course.targetYears || course.targetYears.length === 0) return true;
  return course.targetYears.includes(grade);
}

export type AssignFn = (grade: Grade, term: Term, day: NonNullable<Course["day"]>, period: NonNullable<Course["period"]>, courseId: string) => Promise<void>;

export interface AutoPlaceResult {
  placed: number;
  skipped: number;
}

/**
 * Ver.11方針: 必修科目は履修ガイド上「選ぶ」ものではないため、対象の学年・学期の
 * 空きコマへデフォルトで自動配置する。既に何か別の科目が入っているコマは
 * 上書きせずスキップする（skippedとしてカウント）。
 */
export async function autoPlaceRequiredCourses(
  courses: Course[],
  timetable: TimetableEntry[],
  requirementSet: GraduationRequirementSet,
  grade: Grade,
  term: Term,
  assign: AssignFn
): Promise<AutoPlaceResult> {
  const requiredCourses = courses.filter(
    (c) =>
      c.day &&
      c.period &&
      classifyCourse(c, requirementSet).label === "必修" &&
      gradeMatchesCourse(c, grade) &&
      termMatchesSemester(c.semester, term)
  );
  let placed = 0;
  let skipped = 0;
  for (const course of requiredCourses) {
    if (!course.day || !course.period) continue;
    const existing = timetable.find((t) => t.grade === grade && t.term === term && t.day === course.day && t.period === course.period);
    if (!existing) {
      await assign(grade, term, course.day, course.period, course.id);
      placed += 1;
    } else if (existing.courseId !== course.id) {
      skipped += 1;
    }
  }
  return { placed, skipped };
}

/** 全学年×全学期について必修科目を一括自動配置する（設定保存時などに使う） */
export async function autoPlaceRequiredCoursesEverywhere(
  courses: Course[],
  timetable: TimetableEntry[],
  requirementSet: GraduationRequirementSet,
  assign: AssignFn
): Promise<AutoPlaceResult> {
  let placed = 0;
  let skipped = 0;
  let workingTimetable = timetable;
  for (const grade of GRADES) {
    for (const term of TERMS) {
      const result = await autoPlaceRequiredCourses(courses, workingTimetable, requirementSet, grade, term, async (...args) => {
        await assign(...args);
        const [g, t, day, period, courseId] = args;
        workingTimetable = [
          ...workingTimetable.filter((e) => !(e.grade === g && e.term === t && e.day === day && e.period === period)),
          { id: `${g}-${t}-${day}-${period}`, grade: g, term: t, day, period, courseId, addedAt: Date.now() },
        ];
      });
      placed += result.placed;
      skipped += result.skipped;
    }
  }
  return { placed, skipped };
}
