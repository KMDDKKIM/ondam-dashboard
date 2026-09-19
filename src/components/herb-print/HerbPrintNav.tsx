import Link from "next/link";

export default function HerbPrintNav() {
  return (
    <nav className="no-print border-b border-[#e4d9c4] bg-white/70 px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <p className="font-serif-kr text-sm font-semibold text-[#5b3a29]">
          한약 복용법 안내문
        </p>
        <div className="flex gap-4 text-sm">
          <Link href="/herb-print" className="text-[#6b5a44] no-underline hover:text-[#a63a2e]">
            새 안내문
          </Link>
          <Link href="/herb-print/records" className="text-[#6b5a44] no-underline hover:text-[#a63a2e]">
            저장된 기록
          </Link>
        </div>
      </div>
    </nav>
  );
}
