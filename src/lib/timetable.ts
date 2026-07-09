import type { Course, Grade, Semester, Term } from "@/types";

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
