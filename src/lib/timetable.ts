import type { Course, GraduationRequirementSet, Grade, Period, Semester, Term, TimetableEntry, Weekday } from "@/types";
import { GRADES, TERMS } from "@/types";
import { classifyCourse, matchedGuideName } from "./graduation-requirements";

/** 科目の開講学期(通年含む)が、選択中の学期タブと一致するか */
export function termMatchesSemester(semester: Semester, term: Term): boolean {
  if (semester === "通年") return term === "前期" || term === "後期";
  return semester === term;
}

export interface CourseSlot {
  day: Weekday;
  period: Period;
}

/**
 * 科目の週あたり全コマを返す。外国語科目のように週2コマの科目はmeetings（2件）を、
 * 通常の週1コマ科目はday/periodの1件を返す。曜日時限未定（集中講義等）は空配列。
 */
export function courseSlots(course: Course): CourseSlot[] {
  if (course.meetings && course.meetings.length > 0) return course.meetings;
  if (course.day && course.period) return [{ day: course.day, period: course.period }];
  return [];
}

/** 科目が指定の曜日・時限にコマを持つか（週2コマ科目は両方のコマで真になる） */
export function courseOccupiesSlot(course: Course, day: Weekday, period: Period): boolean {
  return courseSlots(course).some((slot) => slot.day === day && slot.period === period);
}

/**
 * 科目を全コマぶん時間割へ配置する。週2コマの科目（外国語等）は2コマとも配置する。
 * forceSlot（ユーザーがタップしたセル等）は既存の授業があっても上書きし、
 * それ以外のコマは空いている場合のみ配置する（既存があればskippedにカウント）。
 */
export async function assignCourseSlots(
  course: Course,
  grade: Grade,
  term: Term,
  timetable: TimetableEntry[],
  assign: AssignFn,
  forceSlot?: CourseSlot
): Promise<AutoPlaceResult> {
  let placed = 0;
  let skipped = 0;
  for (const slot of courseSlots(course)) {
    const isForced = forceSlot && slot.day === forceSlot.day && slot.period === forceSlot.period;
    const existing = timetable.find((t) => t.grade === grade && t.term === term && t.day === slot.day && t.period === slot.period);
    if (isForced || !existing) {
      await assign(grade, term, slot.day, slot.period, course.id);
      placed += 1;
    } else if (existing.courseId !== course.id) {
      skipped += 1;
    }
  }
  return { placed, skipped };
}

/** 科目の配当学年に、選択中の学年が含まれるか（未設定の科目は常に候補に含める） */
export function gradeMatchesCourse(course: Course, grade: Grade): boolean {
  if (!course.targetYears || course.targetYears.length === 0) return true;
  return course.targetYears.includes(grade);
}

/**
 * ある学年に在籍していたのは西暦何年度か（入学年度+学年-1）。
 * 例: 2024年度入学の学生が今3年次なら、3年次の時間割は2026年度のシラバスを
 * 参照し、1年次の時間割は2024年度のシラバスを参照する。
 */
export function expectedSyllabusYear(entryYear: number, grade: Grade): number {
  return entryYear + grade - 1;
}

/** 現在の学事年度（4月始まり: 1〜3月は前年の年度に属する） */
export function currentAcademicYear(now: Date = new Date()): number {
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
}

/** 入学年度から現在の学年（1〜4年にクランプ）を求める。時間割の初期表示学年に使う */
export function currentGradeFor(entryYear: number, now: Date = new Date()): Grade {
  const grade = currentAcademicYear(now) - entryYear + 1;
  return Math.min(4, Math.max(1, grade)) as Grade;
}

/** 現在の日付から学期タブの初期値を求める（4〜9月=前期・10〜3月=後期） */
export function currentTermFor(now: Date = new Date()): Term {
  const month = now.getMonth() + 1;
  return month >= 4 && month <= 9 ? "前期" : "後期";
}

/**
 * 科目が指定した開講年度に属するか。syllabusYear未設定の科目（手入力科目等）は
 * 年度を問わず常に候補に含める。
 */
export function courseMatchesSyllabusYear(course: Course, year: number): boolean {
  return course.syllabusYear === undefined || course.syllabusYear === year;
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
  assign: AssignFn,
  syllabusYear?: number
): Promise<AutoPlaceResult> {
  const requiredCourses = courses.filter(
    (c) =>
      courseSlots(c).length > 0 &&
      classifyCourse(c, requirementSet).label === "必修" &&
      gradeMatchesCourse(c, grade) &&
      termMatchesSemester(c.semester, term) &&
      (syllabusYear === undefined || courseMatchesSyllabusYear(c, syllabusYear))
  );
  let placed = 0;
  let skipped = 0;
  let workingTimetable = timetable;

  // 「英語Ⅰａ〜ｄ」のようなクラス分けされた開講科目は履修ガイド上同一の1科目
  // （例:「英語Ⅰ」）なので、1クラスだけ配置する。すでに時間割に同一ガイド科目の
  // 別クラスが入っている場合も配置しない。
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const placedGuideNames = new Set<string>();
  for (const entry of timetable) {
    if (entry.grade !== grade || entry.term !== term) continue;
    const existingCourse = courseById.get(entry.courseId);
    if (!existingCourse) continue;
    const guideName = matchedGuideName(existingCourse, requirementSet);
    if (guideName) placedGuideNames.add(guideName);
  }

  for (const course of requiredCourses) {
    const guideName = matchedGuideName(course, requirementSet);
    if (guideName && placedGuideNames.has(guideName)) continue;

    // 週2コマの科目（外国語等）は全コマを配置する
    const result = await assignCourseSlots(course, grade, term, workingTimetable, async (...args) => {
      await assign(...args);
      const [g, t, day, period, courseId] = args;
      workingTimetable = [
        ...workingTimetable.filter((e) => !(e.grade === g && e.term === t && e.day === day && e.period === period)),
        { id: `${g}-${t}-${day}-${period}`, grade: g, term: t, day, period, courseId, addedAt: Date.now() },
      ];
    });
    placed += result.placed;
    skipped += result.skipped;
    if (guideName && result.placed > 0) placedGuideNames.add(guideName);
  }
  return { placed, skipped };
}

/** 全学年×全学期について必修科目を一括自動配置する（設定保存時などに使う） */
export async function autoPlaceRequiredCoursesEverywhere(
  courses: Course[],
  timetable: TimetableEntry[],
  requirementSet: GraduationRequirementSet,
  assign: AssignFn,
  entryYear?: number
): Promise<AutoPlaceResult> {
  let placed = 0;
  let skipped = 0;
  let workingTimetable = timetable;
  for (const grade of GRADES) {
    const syllabusYear = entryYear !== undefined ? expectedSyllabusYear(entryYear, grade) : undefined;
    for (const term of TERMS) {
      const result = await autoPlaceRequiredCourses(courses, workingTimetable, requirementSet, grade, term, async (...args) => {
        await assign(...args);
        const [g, t, day, period, courseId] = args;
        workingTimetable = [
          ...workingTimetable.filter((e) => !(e.grade === g && e.term === t && e.day === day && e.period === period)),
          { id: `${g}-${t}-${day}-${period}`, grade: g, term: t, day, period, courseId, addedAt: Date.now() },
        ];
      }, syllabusYear);
      placed += result.placed;
      skipped += result.skipped;
    }
  }
  return { placed, skipped };
}
