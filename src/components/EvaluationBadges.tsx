import type { EvaluationItem } from "@/types";

const COLOR_MAP: Record<string, string> = {
  試験: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  レポート: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  出席: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  小テスト: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  平常点: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  課題: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  発表: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
};
const DEFAULT_COLOR = "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

export default function EvaluationBadges({ items }: { items: EvaluationItem[] }) {
  if (!items || items.length === 0) {
    return <span className="text-xs text-zinc-400">評価方法未登録</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span
          key={`${item.type}-${i}`}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            COLOR_MAP[item.type] ?? DEFAULT_COLOR
          }`}
        >
          {item.type} {item.percentage}%
        </span>
      ))}
    </div>
  );
}
