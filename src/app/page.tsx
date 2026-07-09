import TimetableGrid from "@/components/TimetableGrid";

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="px-4 pt-6 pb-2">
        <h1 className="text-xl font-bold">時間割</h1>
        <p className="mt-1 text-sm text-zinc-500">セルをタップすると、割当済みの授業の詳細や、その時間帯の候補授業を確認できます。</p>
      </header>
      <TimetableGrid />
    </div>
  );
}
