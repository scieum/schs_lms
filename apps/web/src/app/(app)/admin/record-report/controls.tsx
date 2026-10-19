"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, FileText, X } from "lucide-react";

/** 학년 고르기 (120) — 바꾸면 주소(?grade=)로 다시 그린다 */
export function GradeSelect({ grades, grade, area }: { grades: number[]; grade: number; area: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="학년" value={grade}
      onChange={(e) => router.push(`/admin/record-report?grade=${e.target.value}&area=${area}`)}
      className="h-11 w-[104px] shrink-0 rounded-control border border-hair bg-[#fff] px-3.5 text-[14px] outline-none focus:ring-2 focus:ring-key md:w-[120px]"
    >
      {grades.map((g) => <option key={g} value={g}>{g}학년</option>)}
    </select>
  );
}

/** 인쇄용 미리보기 (PC만): 회색 바탕 위 A4 종이 + 도구 줄. 체크로 선생님별 진행률 · 결재란을 넣고 뺀다 */
export function PrintFrame({ back, title, line, children }: { back: string; title: string; line: string; children: ReactNode }) {
  const [teachers, setTeachers] = useState(true);
  const [sign, setSign] = useState(true);
  return (
    <div className="print-root fixed inset-0 z-[200] overflow-auto bg-[#E5E8EB]" data-teachers={teachers ? "on" : "off"} data-sign={sign ? "on" : "off"}>
      <div className="print-toolbar sticky top-0 z-10 flex items-center gap-3 bg-[#fff] px-6 py-4 shadow-[0_1px_0_#e5e8eb] md:px-8">
        <Link href={back} aria-label="닫기" className="flex size-9 items-center justify-center rounded-control text-sub hover:bg-soft"><X size={22} /></Link>
        <h1 className="text-[18px] font-bold">{title}</h1>
        <span className="hidden text-[13px] text-mute lg:inline">{line}</span>
        <span className="flex-1" />
        <label className="flex items-center gap-1.5 whitespace-nowrap text-[14px] text-sub"><input type="checkbox" checked={teachers} onChange={(e) => setTeachers(e.target.checked)} className="size-4 accent-[#4e5968]" />선생님별 진행률 넣기</label>
        <label className="flex items-center gap-1.5 whitespace-nowrap text-[14px] text-sub"><input type="checkbox" checked={sign} onChange={(e) => setSign(e.target.checked)} className="size-4 accent-[#4e5968]" />결재란 넣기</label>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-control border border-hair bg-[#fff] px-4 text-[14px] font-bold hover:bg-soft"><Download size={16} />PDF로 저장</button>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-control bg-key px-5 text-[14px] font-bold text-white hover:bg-key-strong"><FileText size={16} />인쇄</button>
      </div>
      <div className="flex flex-col items-center gap-6 py-10">{children}</div>
    </div>
  );
}
