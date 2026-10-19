"use client";
import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { Check, Minus, Search, Users, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import {
  classesOf, filterStudents, movedNote, otherSectionOf, pickAll, pickedByClass, pickState, togglePick,
  type PickStudent, type SectionMembers,
} from "@/lib/domain/roster-pick";
import { pickRoster, type RosterSave } from "./roster-actions";

// 이동반 명단 직접 고르기 (Figma N37 · PC 448:98727 / 모바일 449:356 · 전체 화면 시트 449:618).
// 학년(기본 = 과목 학년) · 반 칩 · 이름/학번 찾기 → 체크 목록. 같은 과목 다른 분반 학생은 분반 태그를 달고, 고르면 저장 때 그 분반에서 옮겨 온다.
// PC는 카드 안에 펼치고, 모바일은 "학생 고르기" → 전체 화면 시트(바닥 고정 "n명 저장"). 학번·이름은 URL에 넣지 않는다.

type Props = {
  teacherId: string;
  courseId: string;
  courseLabel: string;
  section: string;
  grade: number;
  students: PickStudent[];
  members: SectionMembers;
  onDone: () => void;
};

const CHIP_MAX = 12;

function Box({ state }: { state: "all" | "some" | "none" }) {
  return (
    <span aria-hidden className={cx("inline-flex size-[18px] shrink-0 items-center justify-center rounded-[4px] md:size-4.5", state === "none" ? "border-[1.5px] border-faint bg-[#fff]" : "bg-key text-white")}>
      {state === "all" && <Check size={12} strokeWidth={3} />}
      {state === "some" && <Minus size={12} strokeWidth={3} />}
    </span>
  );
}

export function RosterPicker({ teacherId, courseId, courseLabel, section, grade, students, members, onDone }: Props) {
  const [picked, setPicked] = useState<string[]>(() => [...(members[section] ?? [])]);
  const [g, setG] = useState(grade);
  const [cls, setCls] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // 저장되면 시트를 닫는다
  const [save, saveAction, saving] = useActionState<RosterSave, FormData>(async (prev, fd) => {
    const r = await pickRoster(prev, fd);
    if (r.done) setSheet(false);
    return r;
  }, {});

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const other = useMemo(() => otherSectionOf(members, section), [members, section]);
  const grades = useMemo(() => [...new Set([1, 2, 3, ...students.map((s) => s.grade)])].sort(), [students]);
  const classes = useMemo(() => classesOf(students, g), [students, g]);
  const visible = useMemo(() => filterStudents(students, { grade: g, classNo: cls, q }), [students, g, cls, q]);
  const counts = useMemo(() => pickedByClass(students, picked, g), [students, picked, g]);
  // 고른 학생 (학번 순, 등록에서 사라진 id는 뺀다)
  const chosen = useMemo(() => picked.map((id) => byId.get(id)).filter((s): s is PickStudent => !!s).sort((a, b) => a.studentNo.localeCompare(b.studentNo)), [picked, byId]);
  const ids = visible.map((s) => s.id);
  const all = pickState(picked, ids);
  const moved = movedNote(members, section, picked);
  const had = (members[section] ?? []).length;
  const n = chosen.length;
  const scope = q.trim() ? "찾은 학생" : cls ? `${cls}반` : `${g}학년`;
  const pickedHere = ids.filter((id) => picked.includes(id)).length;

  // 시트: 뒤 화면 스크롤 막기 · Esc 로 닫기
  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheet(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [sheet]);

  const submit = () => {
    const fd = new FormData();
    fd.set("teacherId", teacherId);
    fd.set("courseId", courseId);
    fd.set("section", section);
    for (const s of chosen) fd.append("studentId", s.id);
    startTransition(() => saveAction(fd));
  };
  const saveLabel = saving ? "저장 중…" : n ? `${n}명 저장` : "명단 비우기";
  const canSave = !saving && (n > 0 || had > 0);
  const movedLine = moved && `${moved} 옮겨 와요 · 저장하면 그 분반 명단에서 빠져요`;

  const searchBox = (big: boolean) => (
    <label className={cx("flex min-w-0 flex-1 items-center gap-2 rounded-control bg-soft px-3", big ? "h-11" : "h-9")}>
      <Search size={16} className="shrink-0 text-mute" aria-hidden />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름이나 학번으로 찾기" aria-label="이름이나 학번으로 찾기"
        className={cx("min-w-0 flex-1 bg-transparent outline-none placeholder:text-mute", big ? "text-[15px]" : "text-[13px]")} />
      {q && <button type="button" onClick={() => setQ("")} aria-label="찾는 말 지우기" className="text-mute"><X size={14} /></button>}
    </label>
  );
  const gradeSelect = (big: boolean) => (
    <select value={g} onChange={(e) => { setG(Number(e.target.value)); setCls(null); }} aria-label="학년"
      className={cx("shrink-0 rounded-full border border-hair bg-[#fff] pl-3 pr-2 font-bold text-ink", big ? "h-9 text-[13px]" : "h-9 rounded-control text-[13px] font-medium")}>
      {grades.map((x) => <option key={x} value={x}>{x}학년</option>)}
    </select>
  );
  const classChips = (
    <>
      {[null, ...classes].map((c) => {
        const on = !q.trim() && cls === c;
        const k = c ? counts[c] ?? 0 : 0;
        return (
          <button key={c ?? 0} type="button" onClick={() => { setCls(c); setQ(""); }} aria-pressed={on}
            className={cx("inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-[13px] md:h-8",
              on ? "border-key bg-key-soft font-bold text-key-strong" : "border-hair bg-[#fff] font-medium text-sub")}>
            {c ? `${c}반` : "전체"}{k > 0 && <span className="text-[12px] font-bold text-key">{k}</span>}
          </button>
        );
      })}
    </>
  );
  const listHead = (big: boolean) => (
    <button type="button" role="checkbox" aria-checked={all === "all" ? true : all === "some" ? "mixed" : false} disabled={!ids.length}
      onClick={() => setPicked(pickAll(picked, ids, all !== "all"))}
      className={cx("flex w-full items-center gap-2.5 text-left", big ? "px-4 py-3" : "bg-bg px-3.5 py-2.5")}>
      <Box state={all} />
      <span className={cx("min-w-0 flex-1 truncate font-bold", big ? "text-[14px]" : "text-[13px]")}>{scope} 모두 고르기</span>
      <span className="shrink-0 text-[12px] font-medium text-sub">{visible.length}명 · 고름 {pickedHere}</span>
    </button>
  );
  const rows = (big: boolean) => visible.length ? visible.map((s) => {
    const on = picked.includes(s.id);
    const from = other.get(s.id);
    return (
      <button key={s.id} type="button" role="checkbox" aria-checked={on} onClick={() => setPicked(togglePick(picked, s.id))}
        className={cx("flex w-full items-center gap-3 border-t border-soft text-left", big ? "px-4 py-3.5" : "px-3.5 py-2.5", on ? "bg-[#F8F9FF]" : "bg-[#fff] hover:bg-bg")}>
        <Box state={on ? "all" : "none"} />
        <span className="shrink-0 text-[13px] font-medium tabular-nums text-sub">{s.studentNo}</span>
        <span className={cx("min-w-0 truncate", big ? "text-[15px]" : "text-[14px]", on ? "font-bold" : "font-medium")}>{s.name}</span>
        {from && (
          <span className={cx("shrink-0 whitespace-nowrap rounded-chip px-2 py-0.5 text-[12px] font-bold", on ? "bg-wait-soft text-[#9A6400]" : "bg-soft text-sub")}>
            {on ? `${from} → 옮김` : from}
          </span>
        )}
        {!big && <span className="ml-auto shrink-0 text-[12px] text-mute">{s.classNo}반</span>}
      </button>
    );
  }) : <p className="border-t border-soft px-4 py-8 text-center text-[13px] text-mute">{q.trim() ? "찾는 학생이 없어요" : "이 반에 등록된 학생이 없어요"}</p>;

  const removeChip = (s: PickStudent) => (
    <button key={s.id} type="button" onClick={() => setPicked(picked.filter((x) => x !== s.id))} aria-label={`${s.name} 빼기`}
      className={cx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-chip border bg-[#fff] py-1 pl-2.5 pr-2 text-[12px] font-medium tabular-nums",
        other.has(s.id) ? "border-wait" : "border-line")}>
      {s.studentNo} {s.name} <X size={12} className="text-mute" aria-hidden />
    </button>
  );
  const messages = (
    <>
      {save.error && <p className="text-sm text-bad" role="alert">{save.error}</p>}
      {save.done && <p className="text-sm text-ok" role="status">{save.done}</p>}
    </>
  );

  return (
    <>
      {/* PC: 카드 안 두 칸 (목록 | 고른 학생) */}
      <div className="hidden flex-col gap-3.5 md:flex">
        <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex items-center gap-2">{gradeSelect(false)}{searchBox(false)}</div>
            <div className="flex flex-wrap gap-1.5">{classChips}</div>
            <div className="overflow-hidden rounded-inner border border-line bg-[#fff]">
              {listHead(false)}
              <div className="max-h-[400px] overflow-y-auto">{rows(false)}</div>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-3 rounded-inner bg-bg p-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-bold">고른 학생</span>
              <span className="text-[14px] font-bold text-key">{n}명</span>
              <button type="button" disabled={!n} onClick={() => setPicked([])} className="ml-auto text-[12px] font-medium text-sub disabled:text-faint">모두 빼기</button>
            </div>
            {n ? (
              <div className="flex max-h-[300px] flex-wrap gap-1.5 overflow-y-auto">
                {(showAll ? chosen : chosen.slice(0, CHIP_MAX)).map(removeChip)}
                {n > CHIP_MAX && (
                  <button type="button" onClick={() => setShowAll(!showAll)} className="rounded-chip bg-line px-2.5 py-1 text-[12px] font-bold text-sub">
                    {showAll ? "접기" : `외 ${n - CHIP_MAX}명`}
                  </button>
                )}
              </div>
            ) : <p className="text-[13px] text-mute">아직 고른 학생이 없어요 · 왼쪽 목록에서 체크해요</p>}
            {movedLine && <p className="rounded-control bg-wait-soft px-3 py-2.5 text-[12px] font-medium leading-[18px] text-[#9A6400]">{movedLine}</p>}
          </div>
        </div>
        {messages}
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[12px] text-mute">저장하면 {section} 명단이 고른 {n}명으로 바뀌어요</span>
          <Button type="button" kind="outline" onClick={onDone}>취소</Button>
          <Button type="button" disabled={!canSave} onClick={submit}>{saveLabel}</Button>
        </div>
      </div>

      {/* 모바일: 요약 + 전체 화면 시트 */}
      <div className="flex flex-col gap-2.5 md:hidden">
        <p className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <span className="shrink-0 font-medium text-sub">지금 명단</span>
          <span className="shrink-0 font-bold text-key">{had}명</span>
        </p>
        {had > 0 && (
          <p className="truncate text-[12px] tabular-nums text-sub">
            {(members[section] ?? []).map((id) => byId.get(id)).filter((s): s is PickStudent => !!s).slice(0, 3).map((s) => `${s.studentNo} ${s.name}`).join(", ")}
            {had > 3 ? ` 외 ${had - 3}명` : ""}
          </p>
        )}
        {messages}
        <Button type="button" onClick={() => setSheet(true)} className="h-12"><Users size={16} aria-hidden /> 학생 고르기</Button>
        <p className="text-[12px] leading-[18px] text-mute">학년·반으로 거르고 이름이나 학번으로 찾아요 · 다른 분반 학생은 옮겨져요</p>
      </div>

      {sheet && (
        <div role="dialog" aria-modal="true" aria-label={`${section} 명단 고르기`} className="fixed inset-0 z-[90] flex flex-col bg-[#fff] md:hidden">
          <div className="flex shrink-0 items-center gap-1.5 py-2 pl-2 pr-4">
            <button type="button" onClick={() => setSheet(false)} aria-label="닫기" className="inline-flex size-11 items-center justify-center text-ink"><X size={22} /></button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-bold">{section} 명단 고르기</p>
              <p className="truncate text-[12px] text-mute">{courseLabel}</p>
            </div>
            <button type="button" disabled={!n} onClick={() => setPicked([])} className="shrink-0 py-2 text-[13px] font-medium text-sub disabled:text-faint">모두 빼기</button>
          </div>
          <div className="flex shrink-0 flex-col gap-2.5 px-4 pb-3 pt-1">
            {searchBox(true)}
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5">{gradeSelect(true)}{classChips}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto bg-bg px-4 py-2.5">
            <span className="shrink-0 text-[12px] font-medium text-sub">고름</span>
            <span className="shrink-0 text-[13px] font-bold text-key">{n}</span>
            {chosen.length ? chosen.map(removeChip) : <span className="shrink-0 text-[12px] text-mute">아직 없어요</span>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listHead(true)}
            {rows(true)}
          </div>
          <div className="flex shrink-0 flex-col gap-2.5 border-t border-line bg-[#fff] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2.5">
            {movedLine && <p className="truncate rounded-control bg-wait-soft px-3 py-2 text-[12px] font-medium text-[#9A6400]">{moved} 옮겨 와요 · 저장하면 그 분반에서 빠져요</p>}
            {save.error && <p className="text-sm text-bad" role="alert">{save.error}</p>}
            <div className="flex gap-2">
              <Button type="button" kind="outline" className="h-12" onClick={() => setSheet(false)}>취소</Button>
              <Button type="button" className="h-12 flex-1" disabled={!canSave} onClick={submit}>{saveLabel}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
