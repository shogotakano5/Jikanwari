import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Course, TimetableEntry, CompletedCourse, FavoriteEntry, Settings } from "@/types";
import { fetchRealCourseSeed } from "./real-course-import";

const DB_NAME = "jikanwari";
const DB_VERSION = 4;

interface JikanwariDB extends DBSchema {
  courses: {
    key: string;
    value: Course;
    indexes: { "by-day-period": [string, number] };
  };
  timetable: {
    key: string;
    value: TimetableEntry;
  };
  graduation: {
    key: string;
    value: CompletedCourse;
  };
  favorites: {
    key: string;
    value: FavoriteEntry;
  };
  settings: {
    key: string;
    value: Settings;
  };
}

let dbPromise: Promise<IDBPDatabase<JikanwariDB>> | null = null;

export const DEFAULT_SETTINGS: Settings = {
  id: "app-settings",
  entryYear: 2024,
  faculty: "経済学部",
  department: "経営経済学科",
  theme: "system",
};

export function getDB(): Promise<IDBPDatabase<JikanwariDB>> {
  if (typeof window === "undefined") {
    throw new Error("getDB() must be called in the browser");
  }
  if (!dbPromise) {
    dbPromise = openDB<JikanwariDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains("courses")) {
          const store = db.createObjectStore("courses", { keyPath: "id" });
          store.createIndex("by-day-period", ["day", "period"]);
        }
        if (!db.objectStoreNames.contains("timetable")) {
          db.createObjectStore("timetable", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("graduation")) {
          db.createObjectStore("graduation", { keyPath: "courseId" });
        }
        if (!db.objectStoreNames.contains("favorites")) {
          db.createObjectStore("favorites", { keyPath: "courseId" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
        // v1->v2: timetableのキー形式が `day-period` から `grade-term-day-period` に、
        // graduationの値に status フィールドが追加された。古い形式のデータは
        // 意味が変わってしまうため、開発初期段階につき単純にクリアする。
        if (oldVersion < 2 && oldVersion > 0) {
          db.clear("timetable");
          db.clear("graduation");
          db.clear("courses"); // 学科名・区分分類ロジック変更に伴いデモデータを再投入
        }
        // v2->v3: 実データ(asahikawa-courses-2026.json)をシードするため、
        // デモデータのみで初期化済みのcoursesストアを再投入対象にする。
        // v3->v4: デモデータへのフォールバックを完全に廃止したため、v3時点で
        // デモデータのまま残っている可能性のあるcoursesストアを再投入対象にする。
        if (oldVersion < 4 && oldVersion > 0) {
          db.clear("courses");
        }
      },
    }).then(async (db) => {
      await seedIfEmpty(db);
      return db;
    });
  }
  return dbPromise;
}

async function seedIfEmpty(db: IDBPDatabase<JikanwariDB>) {
  const count = await db.count("courses");
  if (count === 0) {
    // 実データの取得に失敗した場合はcoursesストアを空のままにしておく
    // （フェイクデータで埋めない）。countが0のままなので次回起動時に再度取得を試みる。
    try {
      const seed = await fetchRealCourseSeed();
      const tx = db.transaction("courses", "readwrite");
      await Promise.all(seed.map((c) => tx.store.put(c)));
      await tx.done;

      const settings = (await db.get("settings", DEFAULT_SETTINGS.id)) ?? DEFAULT_SETTINGS;
      await db.put("settings", {
        ...settings,
        lastSyllabusSyncNote: `実データ ${seed.length}件を読み込み済み（${new Date().toLocaleDateString("ja-JP")}）`,
      });
    } catch {
      const settings = (await db.get("settings", DEFAULT_SETTINGS.id)) ?? DEFAULT_SETTINGS;
      await db.put("settings", {
        ...settings,
        lastSyllabusSyncNote: "初期科目データの取得に失敗しました。ページを再読み込みしてください。",
      });
    }
    return;
  }
  const settings = await db.get("settings", DEFAULT_SETTINGS.id);
  if (!settings) {
    await db.put("settings", DEFAULT_SETTINGS);
  }
}

// ---- Courses ----
export async function getAllCourses(): Promise<Course[]> {
  const db = await getDB();
  return db.getAll("courses");
}

export async function getCourse(id: string): Promise<Course | undefined> {
  const db = await getDB();
  return db.get("courses", id);
}

export async function upsertCourse(course: Course): Promise<void> {
  const db = await getDB();
  await db.put("courses", course);
}

export async function upsertCourses(courses: Course[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("courses", "readwrite");
  await Promise.all(courses.map((c) => tx.store.put(c)));
  await tx.done;
}

export async function getCoursesByDayPeriod(day: string, period: number): Promise<Course[]> {
  const db = await getDB();
  return db.getAllFromIndex("courses", "by-day-period", [day, period]);
}

// ---- Timetable ----
export async function getTimetable(): Promise<TimetableEntry[]> {
  const db = await getDB();
  return db.getAll("timetable");
}

export async function setTimetableEntry(entry: TimetableEntry): Promise<void> {
  const db = await getDB();
  await db.put("timetable", entry);
}

export async function removeTimetableEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("timetable", id);
}

// ---- Graduation / completed courses ----
export async function getCompletedCourses(): Promise<CompletedCourse[]> {
  const db = await getDB();
  return db.getAll("graduation");
}

export async function setCompletedCourse(entry: CompletedCourse): Promise<void> {
  const db = await getDB();
  await db.put("graduation", entry);
}

export async function removeCompletedCourse(courseId: string): Promise<void> {
  const db = await getDB();
  await db.delete("graduation", courseId);
}

// ---- Favorites ----
export async function getFavorites(): Promise<FavoriteEntry[]> {
  const db = await getDB();
  return db.getAll("favorites");
}

export async function toggleFavorite(courseId: string): Promise<boolean> {
  const db = await getDB();
  const existing = await db.get("favorites", courseId);
  if (existing) {
    await db.delete("favorites", courseId);
    return false;
  }
  await db.put("favorites", { courseId, addedAt: Date.now() });
  return true;
}

// ---- Settings ----
export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const s = await db.get("settings", DEFAULT_SETTINGS.id);
  return s ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDB();
  await db.put("settings", settings);
}
