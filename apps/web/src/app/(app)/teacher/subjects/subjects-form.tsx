"use client";
import { useActionState, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button, Card, cx } from "@/components/ui";
import { defaultClassMode, nextSection, SUBJECT_GROUPS, type ClassMode, type Course, type SubjectGroup, type TeacherCourse } from "@/lib/domain/curriculum";
import type { PickStudent } from "@/lib/domain/roster-pick";
import { saveSubjects, type SubjectsState } from "./actions";
import { JointList, type JointRow } from "./joint-card";

const chip = (on: boolean) =>
  cx("rounded-full px-3.5 py-2 text-sm transition-colors", on ? "bg-key font-bold text-white" : "bg-white text-sub hover:bg-key-soft");

// ① 교과 고르기 → ② 그 교과의 개설 과목 고르기 → ③ 과목마다 맡은 반 고르기
export function SubjectsForm({
  teacherId,
  initialGroups,
  initialCourses,
  courses,
  classesByGrade,
  joint,
  semester: nowSemester,
}: {
  teacherId: string;
  initialGroups: SubjectGroup[];
  initialCourses: TeacherCourse[];
  courses: Course[];
  classesByGrade: Record<number, number[]>;
  /** 담당 과목 칸 맨 아래 공동교육과정 묶음 (N54) — 교과를 안 골라도 보인다. 다른 교사를 고른 관리자 화면에는 없음 */
  joint?: { rows: JointRow[]; students: PickStudent[] };
  /** 지금 학기 (3~8월 1학기) — 학기 탭 처음 값 */
  semester: 1 | 2;
}) {
  // 학기 탭 (2026-10-21): 과목 목록 · 공동교육과정을 1 · 2학기로 나눠 보인다. 고른 것은 두 학기 다 저장된다
  const [sem, setSem] = useState<1 | 2>(nowSemester);
  const [state, action, pending] = useActionState<SubjectsState, FormData>(saveSubjects, {});
  const [groups, setGroups] = useState<SubjectGroup[]>(initialGroups);
  const [picked, setPicked] = useState<Record<string, number[]>>(
    Object.fromEntries(initialCourses.map((c) => [c.courseId, c.classes])),
  );
  // 과목마다 고정반 | 이동반 (Figma N2 179:1456) + 이동반 분반
  const [modes, setModes] = useState<Record<string, ClassMode>>(Object.fromEntries(initialCourses.map((c) => [c.courseId, c.mode ?? "fixed"])));
  const [sections, setSections] = useState<Record<string, string[]>>(Object.fromEntries(initialCourses.map((c) => [c.courseId, c.sections?.length ? c.sections : ["1분반"]])));
  const modeOf = (c: Course) => modes[c.id] ?? defaultClassMode(c);
  const secOf = (id: string) => sections[id] ?? ["1분반"];

  const toggleGroup = (g: SubjectGroup) => setGroups((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]));
  const toggleCourse = (c: Course) =>
    setPicked((p) => {
      const next = { ...p };
      if (next[c.id]) delete next[c.id];
      else next[c.id] = [...(classesByGrade[c.grade] ?? [])]; // 처음엔 그 학년 반 전체
      return next;
    });
  const setMode = (c: Course, m: ClassMode) => setModes((x) => ({ ...x, [c.id]: m }));
  const addSection = (id: string) => setSections((x) => ({ ...x, [id]: [...secOf(id), nextSection(secOf(id))] }));
  const dropSection = (id: string, s: string) => setSections((x) => ({ ...x, [id]: secOf(id).filter((y) => y !== s) }));
  const toggleClass = (id: string, n: number) =>
    setPicked((p) => ({ ...p, [id]: p[id].includes(n) ? p[id].filter((x) => x !== n) : [...p[id], n].sort((a, b) => a - b) }));

  const visible = courses.filter((c) => groups.includes(c.group));
  const payload = JSON.stringify({
    teacherId,
    groups,
    courses: Object.entries(picked)
      .filter(([id]) => visible.some((c) => c.id === id))
      .map(([courseId, classes]) => {
        const c = visible.find((x) => x.id === courseId)!;
        return { courseId, classes, mode: modeOf(c), sections: modeOf(c) === "moving" ? secOf(courseId) : [] };
      }),
  });
  const ready = (c: Course) => !!picked[c.id] && (modeOf(c) === "moving" ? secOf(c.id).length > 0 : picked[c.id].length > 0);
  const count = visible.filter(ready).length;
  const jointRows = joint?.rows ?? [];
  const picks = (s: 1 | 2) => visible.filter((c) => c.semester === s && ready(c)).length + jointRows.filter((r) => r.semester === s).length;
  const shown = visible.filter((c) => c.semester === sem);

  return (
    <form action={action} className="grid gap-4 md:grid-cols-[1fr_320px] md:gap-6">
      <input type="hidden" name="payload" value={payload} />
      <div className="flex flex-col gap-4 md:gap-6">
        <Card title="교과">
          <div className="flex flex-wrap gap-2">
            {SUBJECT_GROUPS.map((g) => (
              <button key={g} type="button" aria-pressed={groups.includes(g)} onClick={() => toggleGroup(g)} className={chip(groups.includes(g))}>
                {g}
              </button>
            ))}
          </div>
        </Card>

        <Card title="담당 과목" action={<span className="text-[13px] text-mute">{count + jointRows.length}개 선택</span>}>
          <div className="mb-3 flex gap-1 rounded-inner bg-soft p-1" role="tablist" aria-label="학기">
            {([nowSemester, nowSemester === 2 ? 1 : 2] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={sem === s} onClick={() => setSem(s)}
                className={cx("flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-control text-[14px]", sem === s ? "border border-line bg-[#fff] font-bold text-ink" : "font-medium text-mute")}>
                {s}학기{s === nowSemester && " · 지금"}
                <span className={cx("rounded-chip px-1.5 text-[12px] font-bold", sem === s ? "bg-key-soft text-key-strong" : "bg-hair text-sub")}>{picks(s)}</span>
              </button>
            ))}
          </div>
          {groups.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">교과를 먼저 골라 주세요</p>
          ) : shown.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">편제표에 {sem}학기 이 교과 과목이 아직 없어요</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {shown.map((c) => {
                const on = !!picked[c.id];
                const classes = classesByGrade[c.grade] ?? [];
                return (
                  <li key={c.id} className={cx("rounded-inner p-3.5", on ? "bg-white" : "bg-white/60")}>
                    <button type="button" onClick={() => toggleCourse(c)} aria-pressed={on} className="flex w-full items-center gap-3 text-left">
                      <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-chip", on ? "bg-key text-white" : "bg-soft")}>
                        {on && <Check size={16} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{c.subject}</span>
                        <span className="block text-[13px] text-mute">{c.grade}학년 {c.semester}학기 · {c.type ?? "직접 입력"} · {c.credits}학점</span>
                      </span>
                    </button>
                    {on && (
                      <div className="mt-3 flex flex-col gap-2 pl-9">
                        <div className="flex w-fit rounded-full border border-hair bg-[#fff] p-0.5 text-[12px]" role="radiogroup" aria-label="반 방식">
                          {(["fixed", "moving"] as const).map((m) => (
                            <button key={m} type="button" role="radio" aria-checked={modeOf(c) === m} onClick={() => setMode(c, m)}
                              className={cx("rounded-full px-3 py-1", modeOf(c) === m ? "bg-key-soft font-bold text-key-strong" : "text-mute")}>
                              {m === "fixed" ? "고정반" : "이동반"}
                            </button>
                          ))}
                        </div>
                        {modeOf(c) === "fixed" ? (
                          <>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {classes.map((n) => (
                                <button key={n} type="button" aria-pressed={picked[c.id].includes(n)} onClick={() => toggleClass(c.id, n)}
                                  className={cx("min-w-11 rounded-full px-2.5 py-1.5 text-[13px]", picked[c.id].includes(n) ? "bg-key-soft font-bold text-key-strong" : "bg-soft text-mute")}>
                                  {n}반
                                </button>
                              ))}
                            </div>
                            <p className="text-[12px] text-mute">반 명단을 그대로 써요 · 담당 반을 골라요</p>
                          </>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {secOf(c.id).map((s) => (
                                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-key-soft py-1.5 pl-3 pr-2 text-[13px] font-bold text-key-strong">
                                  {s}
                                  <button type="button" aria-label={`${s} 빼기`} onClick={() => dropSection(c.id, s)} className="text-key-strong/70"><X size={12} /></button>
                                </span>
                              ))}
                              <button type="button" onClick={() => addSection(c.id)} className="inline-flex items-center gap-1 rounded-full border border-hair bg-[#fff] px-3 py-1.5 text-[13px] text-sub">
                                <Plus size={12} /> 분반
                              </button>
                            </div>
                            <p className="text-[12px] text-mute">분반마다 양식 명단을 올려 학생을 정해요 · 저장한 뒤 위 이동반 명단에서 올려요</p>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {joint && <JointList rows={jointRows.filter((r) => r.semester === sem)} semester={sem} students={joint.students} />}
        </Card>
      </div>

      <Card title="저장">
        <dl className="mb-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between"><dt className="text-mute">교과</dt><dd className="font-medium">{groups.join(", ") || "-"}</dd></div>
          <div className="flex justify-between"><dt className="text-mute">담당 과목</dt><dd className="font-medium">{count}개</dd></div>
          {jointRows.length > 0 && <div className="flex justify-between"><dt className="text-mute">공동교육과정</dt><dd className="font-medium">{jointRows.length}개 · 바로 저장</dd></div>}
          {visible.filter(ready).map((c) => (
            <div key={c.id} className="flex justify-between gap-2">
              <dt className="truncate text-mute">{c.subject}</dt>
              <dd className="shrink-0 font-medium">{modeOf(c) === "moving" ? `이동반 · ${secOf(c.id).length}분반` : `고정반 · ${picked[c.id].join(", ")}반`}</dd>
            </div>
          ))}
        </dl>
        {state.error && <p className="mb-3 text-sm text-bad" role="alert">{state.error}</p>}
        {state.saved && <p className="mb-3 text-sm text-ok" role="status">저장했어요</p>}
        <Button disabled={pending} className="w-full">{pending ? "저장하는 중…" : "저장하기"}</Button>
      </Card>
    </form>
  );
}
