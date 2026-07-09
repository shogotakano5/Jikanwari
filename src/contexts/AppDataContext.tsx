"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Course, TimetableEntry, CompletedCourse, FavoriteEntry, Settings, Grade, Term, CourseStatus } from "@/types";
import * as db from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/db";

interface AppDataState {
  ready: boolean;
  courses: Course[];
  timetable: TimetableEntry[];
  completed: CompletedCourse[];
  favorites: FavoriteEntry[];
  settings: Settings;
}

interface AppDataContextValue extends AppDataState {
  courseById: Map<string, Course>;
  statusByCourseId: Map<string, CourseStatus>;
  refreshCourses: () => Promise<void>;
  addCourses: (courses: Course[]) => Promise<void>;
  assignToTimetable: (grade: Grade, term: Term, day: TimetableEntry["day"], period: TimetableEntry["period"], courseId: string) => Promise<void>;
  removeFromTimetable: (grade: Grade, term: Term, day: string, period: number) => Promise<void>;
  setCourseStatus: (courseId: string, status: CourseStatus, completedYear: number, creditsEarned: number) => Promise<void>;
  clearCourseStatus: (courseId: string) => Promise<void>;
  toggleFavorite: (courseId: string) => Promise<void>;
  updateSettings: (settings: Settings) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function timetableSlotId(grade: Grade, term: Term, day: string, period: number): string {
  return `${grade}-${term}-${day}-${period}`;
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppDataState>({
    ready: false,
    courses: [],
    timetable: [],
    completed: [],
    favorites: [],
    settings: DEFAULT_SETTINGS,
  });

  const loadAll = useCallback(async () => {
    const [courses, timetable, completed, favorites, settings] = await Promise.all([
      db.getAllCourses(),
      db.getTimetable(),
      db.getCompletedCourses(),
      db.getFavorites(),
      db.getSettings(),
    ]);
    setState({ ready: true, courses, timetable, completed, favorites, settings });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial IndexedDB load on mount
    loadAll();
  }, [loadAll]);

  const refreshCourses = useCallback(async () => {
    const courses = await db.getAllCourses();
    setState((s) => ({ ...s, courses }));
  }, []);

  const addCourses = useCallback(async (courses: Course[]) => {
    await db.upsertCourses(courses);
    await refreshCourses();
  }, [refreshCourses]);

  const assignToTimetable = useCallback(
    async (grade: Grade, term: Term, day: TimetableEntry["day"], period: TimetableEntry["period"], courseId: string) => {
      const id = timetableSlotId(grade, term, day, period);
      const entry: TimetableEntry = { id, grade, term, day, period, courseId, addedAt: Date.now() };
      await db.setTimetableEntry(entry);
      setState((s) => ({ ...s, timetable: [...s.timetable.filter((t) => t.id !== id), entry] }));
    },
    []
  );

  const removeFromTimetable = useCallback(async (grade: Grade, term: Term, day: string, period: number) => {
    const id = timetableSlotId(grade, term, day, period);
    await db.removeTimetableEntry(id);
    setState((s) => ({ ...s, timetable: s.timetable.filter((t) => t.id !== id) }));
  }, []);

  const setCourseStatus = useCallback(
    async (courseId: string, status: CourseStatus, completedYear: number, creditsEarned: number) => {
      const entry: CompletedCourse = { courseId, status, completedYear, creditsEarned, updatedAt: Date.now() };
      await db.setCompletedCourse(entry);
      setState((s) => ({ ...s, completed: [...s.completed.filter((c) => c.courseId !== courseId), entry] }));
    },
    []
  );

  const clearCourseStatus = useCallback(async (courseId: string) => {
    await db.removeCompletedCourse(courseId);
    setState((s) => ({ ...s, completed: s.completed.filter((c) => c.courseId !== courseId) }));
  }, []);

  const toggleFavorite = useCallback(async (courseId: string) => {
    const nowFav = await db.toggleFavorite(courseId);
    setState((s) => ({
      ...s,
      favorites: nowFav
        ? [...s.favorites, { courseId, addedAt: Date.now() }]
        : s.favorites.filter((f) => f.courseId !== courseId),
    }));
  }, []);

  const updateSettings = useCallback(async (settings: Settings) => {
    await db.saveSettings(settings);
    setState((s) => ({ ...s, settings }));
  }, []);

  const courseById = useMemo(() => new Map(state.courses.map((c) => [c.id, c])), [state.courses]);
  const statusByCourseId = useMemo(() => new Map(state.completed.map((c) => [c.courseId, c.status])), [state.completed]);

  const value: AppDataContextValue = {
    ...state,
    courseById,
    statusByCourseId,
    refreshCourses,
    addCourses,
    assignToTimetable,
    removeFromTimetable,
    setCourseStatus,
    clearCourseStatus,
    toggleFavorite,
    updateSettings,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
