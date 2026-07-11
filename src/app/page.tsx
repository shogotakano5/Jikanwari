import TimetableGrid from "@/components/TimetableGrid";

export default function Home() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-5rem)] max-w-3xl flex-col sm:h-auto">
      <header className="shrink-0 px-4 pt-4 pb-1 sm:pt-6 sm:pb-2">
        <h1 className="text-lg font-bold sm:text-xl">時間割</h1>
        <p className="hidden text-sm text-zinc-500 sm:mt-1 sm:block">
          セルをタップすると、割当済みの授業の詳細や、その時間帯の候補授業を確認できます。
        </p>
      </header>
      <TimetableGrid />
    </div>
  );
}
