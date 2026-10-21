"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, ClipboardPaste, Plus, Search, Trash2, Users, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { JOINT_KIND_LABEL, parseExternalPaste, type ExternalInput, type JointKind } from "@/lib/domain/joint-curriculum";
import { classesOf, filterStudents, type PickStudent } from "@/lib/domain/roster-pick";
import { deleteJointCourse, saveJointCourse } from "./joint-actions";

// 공동교육과정 (Figma N54, 2026-10-21 고침): 내 수업 "담당 과목" 칸 맨 아래 묶음 — 수업 줄 + [＋ 공동교육과정 수업 추가] → 등록 창.
// 수업 = 종류 · 과목 · 학년 · 학기 + 우리 학교 · 다른 학교 학생. 창에서 저장하면 바로 반영(담당 과목 [저장하기]와 따로).
// 저장하면 세특 조각 모으기 · 글 짓기에 "공동 · 과목" 탭으로 나온다. 학번 · 이름은 URL에 넣지 않는다 (C3).

export type JointRow = {
  id: string; kind: JointKind; subject: string; grade: number; semester: 1 | 2;
  own: string[]; external: (ExternalInput & { id: string })[];
};

const KIND_CHIP: Record<JointKind, string> = { school: "bg-key-soft text-key-strong", online: "bg-new-soft text-new" };

/** semester: 지금 보고 있는 학기 탭 — 새 수업의 학기 기본값 */
export function JointList({ rows, students, semester }: { rows: JointRow[]; students: PickStudent[]; semester: 1 | 2 }) {
  const [open, setOpen] = useState<JointRow | "new" | null>(null);
  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[12px] font-bold text-mute">공동교육과정</span>
        <span className="h-px flex-1 bg-line" />
        <Link href="/teacher/joint" className="text-[12px] font-medium text-mute hover:text-ink">운영 안내 ›</Link>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="flex flex-col gap-2.5 rounded-inner bg-white p-3.5 md:flex-row md:items-center md:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-chip bg-key text-white"><Check size={16} strokeWidth={3} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium">{r.subject}</span>
                <span className={cx("shrink-0 rounded-chip px-1.5 py-px text-[11px] font-bold", KIND_CHIP[r.kind])}>공동 · {JOINT_KIND_LABEL[r.kind]}</span>
              </span>
              <span className="block text-[13px] text-mute">{r.grade}학년 {r.semester}학기 · 우리 학교 {r.own.length} · 다른 학교 {r.external.length}</span>
            </span>
          </div>
          <Button type="button" kind="outline" size="sm" className="md:shrink-0" onClick={() => setOpen(r)}><Users size={14} /> 명단 · 수업 고치기</Button>
        </div>
      ))}
      <button type="button" onClick={() => setOpen("new")}
        className="flex h-12 items-center justify-center gap-1.5 rounded-inner border border-dashed border-faint text-[14px] font-bold text-key-strong hover:bg-key-soft">
        <Plus size={16} /> 공동교육과정 수업 추가
      </button>
      {/* 담당 과목 폼 안이라 창은 body 로 띄운다 (Enter 가 그 폼을 보내지 않게) */}
      {open && createPortal(<JointDialog row={open === "new" ? null : open} semester={semester} students={students} onClose={() => setOpen(null)} />, document.body)}
    </div>
  );
}

type Ext = ExternalInput & { key: string };
const toExt = (e: ExternalInput, i: number): Ext => ({ ...e, key: e.id ?? `n${Date.now()}-${i}-${Math.random()}` });
const INPUT = "h-10 w-full min-w-0 rounded-control bg-soft px-1.5 text-[13px] md:px-2.5 md:text-[14px] font-medium outline-none focus:ring-2 focus:ring-key";

function JointDialog({ row, semester: sem, students, onClose }: { row: JointRow | null; semester: 1 | 2; students: PickStudent[]; onClose: () => void }) {
  const [kind, setKind] = useState<JointKind>(row?.kind ?? "school");
  const [subject, setSubject] = useState(row?.subject ?? "");
  const [grade, setGrade] = useState(row?.grade ?? 2);
  const [semester, setSemester] = useState<1 | 2>(row?.semester ?? sem);
  const [own, setOwn] = useState<string[]>(row?.own ?? []);
  const [ext, setExt] = useState<Ext[]>(() => (row?.external ?? []).map(toExt));
  const [tab, setTab] = useState<"own" | "ext">(row && row.external.length ? "ext" : "own");
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const parsed = useMemo(() => parseExternalPaste(paste, { school: ext.at(-1)?.school, grade }), [paste, ext, grade]);
  const total = own.length + ext.length;
  const setE = (key: string, patch: Partial<ExternalInput>) => setExt((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const addOne = () => setExt((xs) => [...xs, toExt({ school: xs.at(-1)?.school ?? "", grade, classNo: 1, number: 1, name: "" }, xs.length)]);
  const addPaste = () => {
    setExt((xs) => [...xs, ...parsed.rows.map((r, i) => toExt(r, xs.length + i))]);
    setNote(parsed.bad ? `${parsed.rows.length}명 넣었어요 · ${parsed.bad}줄은 칸이 모자라 뺐어요` : `${parsed.rows.length}명 넣었어요`);
    setPaste("");
  };
  const save = () => start(async () => {
    setError("");
    const r = await saveJointCourse({
      id: row?.id, kind, subject, grade, semester, ownIds: own,
      external: ext.map((e) => ({ id: e.id, school: e.school.trim(), name: e.name.trim(), grade: Number(e.grade), classNo: Number(e.classNo), number: Number(e.number) })),
    });
    if (!r.ok) return setError(r.error);
    onClose();
  });
  const remove = () => start(async () => {
    if (!row) return;
    const r = await deleteJointCourse(row.id);
    if (!r.ok) return setError(r.error);
    onClose();
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="공동교육과정 수업 등록">
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-[#fff] md:max-w-[640px] md:rounded-[16px]">
        <div className="flex flex-col gap-[18px] overflow-y-auto px-5 pb-4 pt-3 md:px-7 md:pt-6">
          <span aria-hidden className="mx-auto h-1 w-10 rounded-full bg-hair md:hidden" />
          <div className="flex items-center">
            <h2 className="flex-1 text-[18px] font-bold">{row ? "공동교육과정 수업 고치기" : "공동교육과정 수업 등록"}</h2>
            <button type="button" onClick={onClose} aria-label="닫기" className="text-mute hover:text-ink"><X size={20} /></button>
          </div>
          <Seg items={[["school", "학교 간"], ["online", "온라인"]]} value={kind} onChange={(k) => setKind(k as JointKind)} />
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">
            과목
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={40} placeholder="예: 데이터 과학" className="h-11 rounded-control bg-soft px-3 text-[15px] font-medium text-ink outline-none focus:ring-2 focus:ring-key" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">
              학년
              <select value={grade} onChange={(e) => setGrade(Number(e.target.value))} className="h-11 rounded-control bg-soft px-3 text-[15px] font-medium text-ink">
                {[1, 2, 3].map((g) => <option key={g} value={g}>{g}학년</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">
              학기
              <select value={semester} onChange={(e) => setSemester(Number(e.target.value) as 1 | 2)} className="h-11 rounded-control bg-soft px-3 text-[15px] font-medium text-ink">
                <option value={1}>1학기</option><option value={2}>2학기</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold">학생</span>
            <span className="rounded-chip bg-key-soft px-2 py-0.5 text-[12px] font-bold text-key-strong">{total}명</span>
          </div>
          <Seg items={[["own", `우리 학교 ${own.length}`], ["ext", `다른 학교 ${ext.length}`]]} value={tab} onChange={(t) => setTab(t as "own" | "ext")} />

          {tab === "own" ? (
            <OwnPicker students={students} grade={grade} picked={own} onChange={setOwn} />
          ) : (
            <>
              <div className="overflow-hidden rounded-inner border border-line">
                <div className="grid grid-cols-[minmax(0,1.3fr)_34px_34px_38px_minmax(0,1.6fr)_18px] items-center gap-1 bg-bg px-3 py-2 text-[12px] font-bold text-mute md:grid-cols-[170px_64px_64px_64px_minmax(0,1fr)_24px] md:gap-2">
                  <span>학교</span><span>학년</span><span>반</span><span>번호</span><span>이름</span><span />
                </div>
                <ul className="max-h-72 overflow-y-auto">
                  {ext.map((e) => (
                    <li key={e.key} className="grid grid-cols-[minmax(0,1.3fr)_34px_34px_38px_minmax(0,1.6fr)_18px] items-center gap-1 border-t border-soft px-3 py-1.5 md:grid-cols-[170px_64px_64px_64px_minmax(0,1fr)_24px] md:gap-2">
                      <input aria-label="학교" value={e.school} onChange={(x) => setE(e.key, { school: x.target.value })} maxLength={20} placeholder="강릉고" className={INPUT} />
                      <input aria-label="학년" inputMode="numeric" value={e.grade || ""} onChange={(x) => setE(e.key, { grade: Number(x.target.value.replace(/\D/g, "")) })} className={INPUT} />
                      <input aria-label="반" inputMode="numeric" value={e.classNo || ""} onChange={(x) => setE(e.key, { classNo: Number(x.target.value.replace(/\D/g, "")) })} className={INPUT} />
                      <input aria-label="번호" inputMode="numeric" value={e.number || ""} onChange={(x) => setE(e.key, { number: Number(x.target.value.replace(/\D/g, "")) })} className={INPUT} />
                      <input aria-label="이름" value={e.name} onChange={(x) => setE(e.key, { name: x.target.value })} maxLength={20} placeholder="이름" className={INPUT} />
                      <button type="button" aria-label={`${e.name || "이 학생"} 빼기`} onClick={() => setExt((xs) => xs.filter((x) => x.key !== e.key))} className="text-faint hover:text-bad"><X size={16} /></button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={addOne} className="flex h-11 w-full items-center gap-1.5 border-t border-soft px-3 text-[14px] font-bold text-key-strong hover:bg-soft"><Plus size={14} /> 한 명 추가</button>
              </div>
              <div className="flex flex-col gap-2 rounded-inner bg-bg px-3.5 py-3">
                <div className="flex items-center gap-1.5">
                  <ClipboardPaste size={14} className="text-sub" />
                  <span className="flex-1 text-[14px] font-bold">엑셀에서 붙여넣기</span>
                  <span className="hidden text-[12px] text-mute sm:inline">학교 · 학년 · 반 · 번호 · 이름</span>
                </div>
                <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} placeholder={"양양고\t2\t2\t9\t학생라\n속초여고\t2\t4\t3\t학생마"}
                  className="rounded-control border border-line bg-[#fff] px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-key" />
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[12px] text-mute">{note}</span>
                  <Button type="button" kind="soft" size="sm" disabled={!parsed.rows.length} onClick={addPaste}><Plus size={14} /> {parsed.rows.length}명 넣기</Button>
                </div>
              </div>
            </>
          )}
          {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        </div>
        <div className="flex items-center gap-2 border-t border-line px-5 py-3 md:px-7 md:py-4">
          {row && <button type="button" onClick={remove} disabled={pending} className="flex items-center gap-1 text-[14px] font-medium text-bad"><Trash2 size={14} /> 수업 지우기</button>}
          <span className="hidden flex-1 md:block" />
          <Button type="button" kind="outline" className="flex-1 md:flex-none" onClick={onClose}>취소</Button>
          <Button type="button" className="flex-1 md:flex-none" disabled={pending || !subject.trim()} onClick={save}>{pending ? "저장 중…" : `${total}명으로 저장`}</Button>
        </div>
      </div>
    </div>
  );
}

function Seg({ items, value, onChange }: { items: [string, string][]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-1 rounded-inner bg-soft p-1">
      {items.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={k === value}
          className={cx("h-8 flex-1 whitespace-nowrap rounded-control text-[14px]", k === value ? "border border-line bg-[#fff] font-bold text-ink" : "font-medium text-mute")}>{l}</button>
      ))}
    </div>
  );
}

/** 우리 학교 학생 고르기: 학년 · 반 칩 · 이름/학번 찾기 → 체크 */
function OwnPicker({ students, grade, picked, onChange }: { students: PickStudent[]; grade: number; picked: string[]; onChange: (ids: string[]) => void }) {
  const [g, setG] = useState(grade);
  const [cls, setCls] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const set = new Set(picked);
  const visible = filterStudents(students, { grade: g, classNo: cls, q });
  const toggle = (id: string) => onChange(set.has(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <select value={g} onChange={(e) => { setG(Number(e.target.value)); setCls(null); }} aria-label="학년" className="h-10 rounded-control bg-soft px-2.5 text-[14px] font-medium">
          {[1, 2, 3].map((x) => <option key={x} value={x}>{x}학년</option>)}
        </select>
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-control bg-soft px-3">
          <Search size={15} className="text-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름이나 학번으로 찾기" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
        </label>
      </div>
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {[null, ...classesOf(students, g)].map((c) => (
          <button key={c ?? "all"} type="button" onClick={() => setCls(c)} aria-pressed={cls === c}
            className={cx("h-8 shrink-0 whitespace-nowrap rounded-control border px-3 text-[13px]", cls === c ? "border-key bg-key-soft font-bold text-key-strong" : "border-line font-medium text-sub")}>{c === null ? "전체" : `${c}반`}</button>
        ))}
      </div>
      <ul className="max-h-64 overflow-y-auto rounded-inner border border-line">
        {visible.length === 0 && <li className="py-6 text-center text-[13px] text-mute">학생이 없어요</li>}
        {visible.map((s) => (
          <li key={s.id} className="border-t border-soft first:border-0">
            <label className="flex h-11 cursor-pointer items-center gap-3 px-3 hover:bg-soft">
              <input type="checkbox" checked={set.has(s.id)} onChange={() => toggle(s.id)} className="size-4 accent-[#536DFE]" />
              <span className="w-12 text-[13px] text-mute">{s.studentNo}</span>
              <span className="text-[15px] font-medium">{s.name}</span>
            </label>
          </li>
        ))}
      </ul>
      <span className="text-[12px] text-mute">고른 학생 {picked.length}명</span>
    </div>
  );
}
