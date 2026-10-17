"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { GradeClassSelect } from "@/components/grade-class-select";
import { Card, cx } from "@/components/ui";

type S = { id: string; name: string; label: string; grade: number; classNo: number; count: number };

// 학생 고르기 (상담 기록 고르기와 같은 모양): 이름·학번 검색 + 학년·반 드롭다운 + 그 반 학생 (조각 수)
export function PiecesPicker({ students, selected, area }: { students: S[]; selected: string | null; area: string }) {
  const sel = students.find((s) => s.id === selected) ?? students[0];
  const [q, setQ] = useState("");
  const [gc, setGc] = useState({ grade: sel?.grade ?? null as number | null, classNo: sel?.classNo ?? null as number | null });
  const term = q.trim();
  const shown = term ? students.filter((s) => s.name.includes(term) || s.label.includes(term)) : students.filter((s) => s.grade === gc.grade && s.classNo === gc.classNo);
  const router = useRouter();
  const inClass = students.filter((s) => s.grade === gc.grade && s.classNo === gc.classNo);
  const href = (id: string) => `/teacher/pieces?student=${id}${area !== "all" ? `&area=${encodeURIComponent(area)}` : ""}`;

  return (
    <Card title="담당 학생" action={<span className="text-[13px] text-mute">{students.length}명</span>}>
      <div className="flex flex-col gap-2.5">
        <label className="hidden h-11 items-center gap-2 rounded-control border border-hair md:flex bg-[#fff] px-3.5 focus-within:ring-2 focus-within:ring-key">
          <Search size={16} className="text-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름이나 학번으로 찾기" aria-label="학생 검색" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
        </label>
        {!term && <GradeClassSelect items={students} grade={gc.grade} classNo={gc.classNo} onChange={(grade, classNo) => setGc({ grade, classNo })} />}
        {/* 모바일 (Figma N13 Mobile 261:50003): 학년·반 + 학생 하나 고르기 */}
        <label className="relative md:hidden">
          <span className="sr-only">학생</span>
          <select value={inClass.some((s) => s.id === selected) ? selected ?? "" : ""} onChange={(e) => e.target.value && router.push(href(e.target.value))}
            className="h-12 w-full appearance-none rounded-control border border-hair bg-[#fff] pl-3.5 pr-9 text-[15px] font-bold outline-none focus:ring-2 focus:ring-key">
            {!inClass.some((s) => s.id === selected) && <option value="">학생 고르기</option>}
            {inClass.map((s) => <option key={s.id} value={s.id}>{s.label} {s.name} · {s.count ? `조각 ${s.count}` : "조각 없음"}</option>)}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute" />
        </label>
      </div>
      <ul className="-mx-1 mt-2 hidden max-h-[560px] flex-col overflow-y-auto md:flex">
        {shown.map((s) => {
          const on = s.id === selected;
          return (
            <li key={s.id}>
              <Link href={href(s.id)} aria-current={on ? "true" : undefined} className={cx("flex h-12 items-center gap-3 rounded-inner px-3", on ? "bg-key-soft/60" : "hover:bg-soft")}>
                <span className={cx("w-12 shrink-0 text-[13px] tabular-nums", on ? "font-bold text-key-strong" : "text-mute")}>{s.label}</span>
                <span className={cx("min-w-0 flex-1 truncate text-[15px]", on && "font-bold")}>{s.name}</span>
                <span className={cx("shrink-0 text-[12px]", on ? "text-key-strong" : s.count ? "text-mute" : "text-faint")}>{s.count ? `조각 ${s.count}` : "조각 없음"}</span>
              </Link>
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-6 text-center text-sm text-mute">학생이 없어요</li>}
      </ul>
    </Card>
  );
}
