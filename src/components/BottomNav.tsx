"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "時間割", icon: "🗓️" },
  { href: "/syllabus", label: "シラバス検索", icon: "🔍" },
  { href: "/planner", label: "履修プランナー", icon: "🧭" },
  { href: "/graduation", label: "卒業判定", icon: "🎓" },
  { href: "/favorites", label: "お気に入り", icon: "⭐" },
  { href: "/settings", label: "設定", icon: "⚙️" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* モバイル: 画面下部のタブバー */}
      <nav className="fixed bottom-0 inset-x-0 z-20 border-t border-zinc-200 bg-white/95 backdrop-blur sm:hidden dark:border-zinc-800 dark:bg-zinc-950/95">
        <ul className="mx-auto flex max-w-3xl items-stretch justify-between px-1">
          {ITEMS.map((item) => (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                  isActive(item.href) ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* タブレット・PC: 左サイドナビ */}
      <nav className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col gap-1 border-r border-zinc-200 bg-white p-4 sm:flex dark:border-zinc-800 dark:bg-zinc-950">
        <p className="mb-3 px-2 text-lg font-bold text-blue-700 dark:text-blue-400">Jikanwari</p>
        <ul className="flex flex-col gap-1">
          {ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive(item.href)
                    ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
