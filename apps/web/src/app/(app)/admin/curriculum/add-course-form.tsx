"use client";
import { useActionState, useState } from "react";
import { Button, cx } from "@/components/ui";
import { COURSE_TYPES, SUBJECT_GROUPS, subjectsOf, type SubjectGroup } from "@/lib/domain/curriculum";
import { addCourse, type CourseFormState } from "./actions";

const SELECT = "h-12 w-full rounded-field bg-white px-3.5 text-[15px] outline-none focus:ring-2 focus:ring-key";
const CUSTOM = "__custom__";

function Pills({ name, options, value, onChange }: { name: string; options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 rounded-control bg-white p-1">
      <input type="hidden" name={name} value={value} />
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cx("flex-1 rounded-chip py-2 text-sm", value === v ? "bg-key font-bold text-white" : "text-mute")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// 과목 추가: 학년·학기 → 교과 → 과목(2022 개정 목록, 없으면 직접 입력) → 학점
export function AddCourseForm() {
  const [state, action, pending] = useActionState<CourseFormState, FormData>(addCourse, {});
  const [grade, setGrade] = useState("1");
  const [semester, setSemester] = useState("1");
  const [group, setGroup] = useState<SubjectGroup>("국어");
  const [subject, setSubject] = useState("");
  const custom = subject === CUSTOM;
  const list = subjectsOf(group);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Pills name="grade" value={grade} onChange={setGrade} options={[["1", "1학년"], ["2", "2학년"], ["3", "3학년"]]} />
      <Pills name="semester" value={semester} onChange={setSemester} options={[["1", "1학기"], ["2", "2학기"]]} />
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-sub">교과</span>
        <select
          name="group"
          value={group}
          onChange={(e) => { setGroup(e.target.value as SubjectGroup); setSubject(""); }}
          className={SELECT}
        >
          {SUBJECT_GROUPS.map((g) => <option key={g}>{g}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-sub">과목</span>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} className={SELECT} required>
          <option value="" disabled>과목 고르기</option>
          {COURSE_TYPES.map((t) => {
            const items = list.filter((s) => s.type === t);
            return items.length ? (
              <optgroup key={t} label={t}>
                {items.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </optgroup>
            ) : null;
          })}
          <option value={CUSTOM}>직접 입력 (2015 개정·학교 지정)</option>
        </select>
      </label>
      <input type="hidden" name="custom" value={custom ? "1" : "0"} />
      {custom ? (
        <input name="subject" required maxLength={30} placeholder="예: 물리학Ⅰ" className={SELECT} aria-label="과목 이름" />
      ) : (
        <input type="hidden" name="subject" value={subject} />
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-sub">학점</span>
        <input name="credits" type="number" min={1} max={10} defaultValue={4} required className={SELECT} />
      </label>
      {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      {state.added && <p className="text-sm text-ok" role="status">{state.added} 추가했어요</p>}
      <Button disabled={pending || !subject}>{pending ? "추가하는 중…" : "편제표에 추가"}</Button>
    </form>
  );
}
