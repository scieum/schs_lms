"use client";
import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { Button, Field, cx } from "@/components/ui";
import { matchRosterText, type RosterMatch } from "@/lib/domain/teacher-assist";
import { createClub, saveMembers, type ClubState } from "./actions";

export function NewClubForm() {
  const [state, action, pending] = useActionState<ClubState, FormData>(createClub, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field name="name" label="동아리 이름" placeholder="예: 과학탐구반" required maxLength={30} />
      {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      <Button kind="outline" disabled={pending}>{pending ? "만드는 중…" : "동아리 만들기"}</Button>
    </form>
  );
}

type S = { id: string; name: string; grade: number; classNo: number; number: number; studentNo: string };

// 부원 고르기: 학년·반으로 좁혀서 체크
export function MembersForm({ clubId, students, initial }: { clubId: string; students: S[]; initial: string[] }) {
  const [state, action, pending] = useActionState<ClubState, FormData>(saveMembers, {});
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  const [grade, setGrade] = useState(students[0]?.grade ?? 1);
  const [classNo, setClassNo] = useState<number | 0>(0);
  const classes = [...new Set(students.filter((s) => s.grade === grade).map((s) => s.classNo))].sort((a, b) => a - b);
  const shown = students.filter((s) => s.grade === grade && (!classNo || s.classNo === classNo));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="payload" value={JSON.stringify({ clubId, studentIds: [...picked] })} />
      <RosterPaste students={students} picked={picked} onApply={(ids) => setPicked((p) => new Set([...p, ...ids]))} />
      <div className="flex flex-wrap gap-1.5">
        {[1, 2, 3].map((g) => (
          <button key={g} type="button" onClick={() => { setGrade(g); setClassNo(0); }} aria-pressed={grade === g}
            className={cx("rounded-full px-3.5 py-2 text-sm", grade === g ? "bg-key font-bold text-white" : "bg-white text-sub")}>{g}학년</button>
        ))}
        <span className="mx-1 w-px self-stretch bg-line" />
        {[0, ...classes].map((c) => (
          <button key={c} type="button" onClick={() => setClassNo(c)} aria-pressed={classNo === c}
            className={cx("rounded-full px-2.5 py-1.5 text-[13px]", classNo === c ? "bg-key-soft font-bold text-key-strong" : "bg-white text-mute")}>{c ? `${c}반` : "전체"}</button>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
        {shown.map((s) => {
          const on = picked.has(s.id);
          return (
            <li key={s.id}>
              <button type="button" onClick={() => toggle(s.id)} aria-pressed={on}
                className={cx("flex w-full items-center gap-2 rounded-inner px-3 py-2.5 text-left text-sm", on ? "bg-white font-medium" : "bg-white/50 text-sub")}>
                <span className={cx("flex size-5 shrink-0 items-center justify-center rounded-chip", on ? "bg-key text-white" : "bg-soft")}>{on && <Check size={13} strokeWidth={3} />}</span>
                <span className="truncate">{s.name}</span>
                <span className="ml-auto text-xs text-mute">{s.classNo}-{s.number}</span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="col-span-full py-4 text-center text-sm text-mute">학생이 없어요</li>}
      </ul>
      {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      {state.saved && <p className="text-sm text-ok" role="status">저장했어요</p>}
      <Button disabled={pending}>{pending ? "저장하는 중…" : `부원 ${picked.size}명 저장`}</Button>
    </form>
  );
}

/**
 * 부원 명단 붙여넣기(엑셀 복사·텍스트) → 학번·학년반번호·이름으로 학생 찾기.
 * 이름이 들어 있어 AI에 보내지 않고 브라우저 안에서 규칙으로만 맞춘다 ("자동").
 */
function RosterPaste({ students, picked, onApply }: { students: S[]; picked: Set<string>; onApply: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [res, setRes] = useState<RosterMatch | null>(null);
  const fresh = res ? res.matched.filter((id) => !picked.has(id)) : [];

  return (
    <div className="rounded-inner bg-soft px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="rounded-chip bg-key-soft px-2.5 py-1 text-xs font-bold text-key-strong">자동</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">명단으로 고르기</div>
          <div className="truncate text-[13px] text-sub">엑셀에서 복사한 부원 명단을 붙여 넣으면 학생을 찾아 골라요</div>
        </div>
        <Button type="button" kind="outline" size="sm" onClick={() => setOpen((o) => !o)}>{open ? "닫기" : "붙여넣기"}</Button>
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea value={text} onChange={(e) => { setText(e.target.value); setRes(null); }} rows={4} maxLength={10000}
            placeholder={"한 줄에 한 명 (예: 20312 김민수 / 2-3-12 / 2학년 3반 12번 김민수)"} aria-label="부원 명단"
            className="w-full resize-y rounded-field bg-white p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-key" />
          {res && (
            <div className="flex flex-col gap-1 text-[13px]">
              <p className="text-sub">찾은 학생 {res.matched.length}명{res.matched.length !== fresh.length ? ` (이미 고른 ${res.matched.length - fresh.length}명)` : ""}</p>
              {res.ambiguous.length > 0 && <p className="text-wait">같은 이름이 여러 명이라 직접 골라 주세요: {res.ambiguous.slice(0, 5).join(", ")}{res.ambiguous.length > 5 ? ` 외 ${res.ambiguous.length - 5}줄` : ""}</p>}
              {res.unknown.length > 0 && <p className="text-bad">명단에서 못 찾았어요: {res.unknown.slice(0, 5).join(", ")}{res.unknown.length > 5 ? ` 외 ${res.unknown.length - 5}줄` : ""}</p>}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" kind="ghost" size="sm" disabled={!text.trim()} onClick={() => setRes(matchRosterText(text, students))}>학생 찾기</Button>
            <Button type="button" kind="outline" size="sm" disabled={!fresh.length}
              onClick={() => { onApply(fresh); setText(""); setRes(null); setOpen(false); }}>
              {fresh.length ? `확인 후 ${fresh.length}명 고르기` : "확인 후 고르기"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
