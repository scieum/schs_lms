"use client";
import { useMemo, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { GradeClassSelect } from "@/components/grade-class-select";
import { Avatar, Button, Card, Row, cx } from "@/components/ui";
import { filterLabel, filterStudents, parseStudentQuery, type StudentFilter } from "@/lib/domain/teacher-assist";
import { studentSearchFilter, type SearchResult } from "./actions";

type S = { id: string; name: string; grade: number; classNo: number; number: number; gender: string; studentNo: string; pseudonymId: string };

/**
 * 학생 목록 + 말로 찾기 ("2학년 3반 여학생"). 입력하면 규칙으로 바로 거르고,
 * "AI로 찾기"는 규칙이 못 읽은 말을 필터로 바꾼다. 검색어는 URL에 남기지 않는다 (C3).
 */
export function StudentSearch({ students, aiOn }: { students: S[]; aiOn: boolean }) {
  const [q, setQ] = useState("");
  const [ai, setAi] = useState<(SearchResult & { q: string }) | null>(null);
  const [pending, start] = useTransition();
  const rule = useMemo(() => parseStudentQuery(q), [q]);
  // AI 결과는 그 검색어일 때만 쓴다
  const active = ai && ai.q === q ? ai : null;
  const filter: StudentFilter = active?.filter ?? rule.filter;
  // 검색어가 없으면 학년·반 드롭다운으로 한 반씩 (400명을 한 번에 늘어놓지 않음)
  const [gc, setGc] = useState<{ grade: number | null; classNo: number | null }>({ grade: students[0]?.grade ?? null, classNo: students[0]?.classNo ?? null });
  const byNo = /^\d{3,5}$/.test(q.trim());
  const shown = byNo ? students.filter((s) => s.studentNo.startsWith(q.trim())) : q.trim() ? filterStudents(students, filter) : students.filter((s) => s.grade === gc.grade && s.classNo === gc.classNo);
  const label = filterLabel(filter);
  const run = () => start(async () => {
    try {
      setAi({ ...(await studentSearchFilter(q)), q });
    } catch {
      setAi({ filter: rule.filter, label: "자동", notice: "AI로 찾지 못해 규칙으로 찾았어요", q });
    }
  });

  return (
    <Card>
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim() && aiOn) run(); }} className="mb-3 flex items-center gap-2">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-field bg-white px-3.5 focus-within:ring-2 focus-within:ring-key">
          <Search size={16} className="shrink-0 text-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} placeholder="이름·학번이나 말로 찾기 (예: 2학년 3반)" aria-label="학생 찾기"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="지우기" className="text-mute"><X size={16} /></button>}
        </label>
        <Button kind="outline" size="sm" disabled={!q.trim() || pending || !aiOn} title={aiOn ? undefined : "AI가 꺼져 있어 입력하는 대로 규칙으로 찾아요"}>
          {pending ? "찾는 중…" : "AI로 찾기"}
        </Button>
      </form>
      {!q.trim() && students.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          <GradeClassSelect items={students} grade={gc.grade} classNo={gc.classNo} onChange={(grade, classNo) => setGc({ grade, classNo })} />
          <div className="flex items-center justify-between text-[13px]"><span className="font-bold">{gc.grade}학년 {gc.classNo}반 · {shown.length}명</span><span className="text-mute">전체 {students.length}명 · 번호순</span></div>
        </div>
      )}
      {q.trim() && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
          <span className={cx("rounded-chip px-2 py-0.5 text-xs font-bold", active?.label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{active?.label ?? "자동"}</span>
          <span className="text-sub">{label || "조건을 읽지 못했어요"} · {shown.length}명</span>
          {!active && rule.rest && aiOn && <span className="text-mute">못 읽은 말이 있으면 AI로 찾기를 눌러 주세요</span>}
          {active?.notice && <span className="text-mute">{active.notice}</span>}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-mute">{students.length ? "맞는 학생이 없어요" : "아직 등록된 학생이 없어요"}</p>
      ) : (
        shown.map((s, i) => (
          <Row
            key={s.id}
            last={i === shown.length - 1}
            lead={<Avatar name={s.name} />}
            title={s.name}
            meta={`${s.grade}학년 ${s.classNo}반 ${s.number}번 · 학번 ${s.studentNo}`}
            right={<span className="shrink-0 text-[13px] font-medium tabular-nums text-key-strong">{s.pseudonymId}</span>}
          />
        ))
      )}
    </Card>
  );
}
