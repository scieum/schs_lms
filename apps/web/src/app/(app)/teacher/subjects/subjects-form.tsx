"use client";
import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { Button, Card, cx } from "@/components/ui";
import { SUBJECT_GROUPS, type Course, type SubjectGroup, type TeacherCourse } from "@/lib/domain/curriculum";
import { saveSubjects, type SubjectsState } from "./actions";

const chip = (on: boolean) =>
  cx("rounded-full px-3.5 py-2 text-sm transition-colors", on ? "bg-key font-bold text-white" : "bg-white text-sub hover:bg-key-soft");

// ① 교과 고르기 → ② 그 교과의 개설 과목 고르기 → ③ 과목마다 맡은 반 고르기
export function SubjectsForm({
  teacherId,
  initialGroups,
  initialCourses,
  courses,
  classesByGrade,
}: {
  teacherId: string;
  initialGroups: SubjectGroup[];
  initialCourses: TeacherCourse[];
  courses: Course[];
  classesByGrade: Record<number, number[]>;
}) {
  const [state, action, pending] = useActionState<SubjectsState, FormData>(saveSubjects, {});
  const [groups, setGroups] = useState<SubjectGroup[]>(initialGroups);
  const [picked, setPicked] = useState<Record<string, number[]>>(
    Object.fromEntries(initialCourses.map((c) => [c.courseId, c.classes])),
  );

  const toggleGroup = (g: SubjectGroup) => setGroups((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]));
  const toggleCourse = (c: Course) =>
    setPicked((p) => {
      const next = { ...p };
      if (next[c.id]) delete next[c.id];
      else next[c.id] = [...(classesByGrade[c.grade] ?? [])]; // 처음엔 그 학년 반 전체
      return next;
    });
  const toggleClass = (id: string, n: number) =>
    setPicked((p) => ({ ...p, [id]: p[id].includes(n) ? p[id].filter((x) => x !== n) : [...p[id], n].sort((a, b) => a - b) }));

  const visible = courses.filter((c) => groups.includes(c.group));
  const payload = JSON.stringify({
    teacherId,
    groups,
    courses: Object.entries(picked)
      .filter(([id]) => visible.some((c) => c.id === id))
      .map(([courseId, classes]) => ({ courseId, classes })),
  });
  const count = visible.filter((c) => picked[c.id]?.length).length;

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

        <Card title="담당 과목" action={<span className="text-[13px] text-mute">{count}개 선택</span>}>
          {groups.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">교과를 먼저 골라 주세요</p>
          ) : visible.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">편제표에 이 교과 과목이 아직 없어요</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((c) => {
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
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-9">
                        {classes.map((n) => (
                          <button key={n} type="button" aria-pressed={picked[c.id].includes(n)} onClick={() => toggleClass(c.id, n)}
                            className={cx("min-w-11 rounded-full px-2.5 py-1.5 text-[13px]", picked[c.id].includes(n) ? "bg-key-soft font-bold text-key-strong" : "bg-soft text-mute")}>
                            {n}반
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title="저장">
        <dl className="mb-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between"><dt className="text-mute">교과</dt><dd className="font-medium">{groups.join(", ") || "-"}</dd></div>
          <div className="flex justify-between"><dt className="text-mute">담당 과목</dt><dd className="font-medium">{count}개</dd></div>
        </dl>
        {state.error && <p className="mb-3 text-sm text-bad" role="alert">{state.error}</p>}
        {state.saved && <p className="mb-3 text-sm text-ok" role="status">저장했어요</p>}
        <Button disabled={pending} className="w-full">{pending ? "저장하는 중…" : "저장하기"}</Button>
      </Card>
    </form>
  );
}
