"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Course, TimetableEntry, CompletedCourse, FavoriteEntry, Settings } from "@/types";
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
  refreshCourses: () => Promise<void>;
  addCourses: (courses: Course[]) => Promise<void>;
  assignToTimetable: (day: TimetableEntry["day"], period: TimetableEntry["period"], courseId: string) => Promise<void>;
  removeFromTimetable: (day: string, period: number) => Promise<void>;
  markCompleted: (courseId: string, completedYear: number, creditsEarned: number, grade?: string) => Promise<void>;
  unmarkCompleted: (courseId: string) => Promise<void>;
  toggleFavorite: (courseId: string) => Promise<void>;
  updateSettings: (settings: Settings) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

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
    async (day: TimetableEntry["day"], period: TimetableEntry["period"], courseId: string) => {
      const id = `${day}-${period}`;
      const entry: TimetableEntry = { id, day, period, courseId, addedAt: Date.now() };
      await db.setTimetableEntry(entry);
      setState((s) => ({ ...s, timetable: [...s.timetable.filter((t) => t.id !== id), entry] }));
    },
    []
  );

  const removeFromTimetable = useCallback(async (day: string, period: number) => {
    const id = `${day}-${period}`;
    await db.removeTimetableEntry(id);
    setState((s) => ({ ...s, timetable: s.timetable.filter((t) => t.id !== id) }));
  }, []);

  const markCompleted = useCallback(
    async (courseId: string, completedYear: number, creditsEarned: number, grade?: string) => {
      const entry: CompletedCourse = { courseId, completedYear, creditsEarned, grade, completedAt: Date.now() };
      await db.setCompletedCourse(entry);
      setState((s) => ({ ...s, completed: [...s.completed.filter((c) => c.courseId !== courseId), entry] }));
    },
    []
  );

  const unmarkCompleted = useCallback(async (courseId: string) => {
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

  const value: AppDataContextValue = {
    ...state,
    courseById,
    refreshCourses,
    addCourses,
    assignToTimetable,
    removeFromTimetable,
    markCompleted,
    unmarkCompleted,
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
