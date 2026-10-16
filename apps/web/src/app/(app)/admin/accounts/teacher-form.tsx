"use client";
import { useActionState, useState } from "react";
import { Button, cx } from "@/components/ui";
import type { Teacher } from "@/lib/domain/types";
import { createTeacher, updateTeacher, type AccountFormState } from "./actions";

const SELECT = "h-12 w-full rounded-field bg-white px-3.5 text-[15px] outline-none focus:ring-2 focus:ring-key";
const ROLE_OPTIONS: [string, string][] = [["admin", "관리자"], ["subject", "교과"], ["program", "프로그램"]];

/** 교사 추가(teacher 없음)·편집(teacher 있음) 공용 폼 */
export function TeacherForm({ teacher }: { teacher?: Teacher }) {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(teacher ? updateTeacher : createTeacher, {});
  const [roles, setRoles] = useState<string[]>(teacher?.roles ?? ["subject"]);
  const [hg, setHg] = useState(String(teacher?.homeroom?.grade ?? 0));
  const toggle = (r: string) => setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  return (
    <form action={action} className="flex flex-col gap-4">
      {teacher ? (
        <input type="hidden" name="id" value={teacher.id} />
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">이름 (로그인 ID)</span>
          <input name="name" required maxLength={20} placeholder="예: 최현우" className={SELECT} />
        </label>
      )}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] font-medium text-sub">역할</legend>
        <div className="flex gap-1 rounded-full bg-white p-1">
          {ROLE_OPTIONS.map(([v, label]) => (
            <label key={v} className={cx("flex-1 cursor-pointer rounded-full py-2 text-center text-sm", roles.includes(v) ? "bg-key font-bold text-white" : "text-mute")}>
              <input type="checkbox" name="roles" value={v} checked={roles.includes(v)} onChange={() => toggle(v)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">담임 학년</span>
          <select name="hg" value={hg} onChange={(e) => setHg(e.target.value)} className={SELECT}>
            <option value="0">담임 아님</option>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}학년</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">반</span>
          <select name="hc" defaultValue={String(teacher?.homeroom?.classNo ?? 0)} disabled={hg === "0"} className={SELECT}>
            <option value="0">-</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}반</option>)}
          </select>
        </label>
      </div>
      {hg === "0" && <input type="hidden" name="hc" value="0" />}

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-sub">부서·교과</span>
        <input name="dept" maxLength={20} defaultValue={teacher?.dept ?? ""} placeholder="예: 과학과" className={SELECT} />
      </label>

      {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      {state.done && <p className="text-sm text-ok" role="status">{state.done}</p>}
      <Button disabled={pending}>{pending ? "저장하는 중…" : teacher ? "저장" : "교사 추가"}</Button>
    </form>
  );
}
