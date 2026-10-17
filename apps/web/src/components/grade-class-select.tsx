"use client";
import { ChevronDown } from "lucide-react";

// 학년·반 드롭다운 두 개 (Figma T5 46:2058 · N8 204:5565): 반 버튼을 모두 늘어놓지 않고 골라서 본다
type GC = { grade: number; classNo: number };

const SELECT = "h-11 w-full appearance-none rounded-control border border-hair bg-[#fff] pl-3.5 pr-9 text-[15px] outline-none focus:ring-2 focus:ring-key";

export function GradeClassSelect({ items, grade, classNo, onChange }: {
  items: GC[]; grade: number | null; classNo: number | null; onChange: (g: number, c: number) => void;
}) {
  const grades = [...new Set(items.map((x) => x.grade))].sort((a, b) => a - b);
  const classes = [...new Set(items.filter((x) => x.grade === grade).map((x) => x.classNo))].sort((a, b) => a - b);
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="relative">
        <span className="sr-only">학년</span>
        <select className={SELECT} value={grade ?? ""} onChange={(e) => {
          const g = Number(e.target.value);
          const first = [...new Set(items.filter((x) => x.grade === g).map((x) => x.classNo))].sort((a, b) => a - b)[0] ?? 1;
          onChange(g, first);
        }}>
          {grades.map((g) => <option key={g} value={g}>{g}학년</option>)}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute" />
      </label>
      <label className="relative">
        <span className="sr-only">반</span>
        <select className={SELECT} value={classNo ?? ""} onChange={(e) => grade != null && onChange(grade, Number(e.target.value))}>
          {classes.map((c) => <option key={c} value={c}>{c}반</option>)}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute" />
      </label>
    </div>
  );
}
