"use client";
import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { Button, Field, cx } from "@/components/ui";
import { StudentListImport } from "@/components/student-list-import";
import { createClub, saveMembers, type ClubState } from "./actions";
import { makeStudentNo } from "@/lib/domain/roster";

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
      <StudentListImport pool={students} picked={picked} onAdd={(ids) => setPicked((p) => new Set([...p, ...ids]))} className="self-start" />
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
                <span className="ml-auto text-xs text-mute">{makeStudentNo(s.grade, s.classNo, s.number)}</span>
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
