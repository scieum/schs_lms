"use client";
import { useActionState, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button, Card, Tag, cx } from "@/components/ui";
import { SUBJECT_GROUPS, type Course, type SubjectGroup, type TeacherCourse } from "@/lib/domain/curriculum";
import { adviseCourses, saveSubjects, type CourseAdvice, type SubjectsState } from "./actions";

const chip = (on: boolean) =>
  cx("rounded-full px-3.5 py-2 text-sm transition-colors", on ? "bg-key font-bold text-white" : "bg-white text-sub hover:bg-key-soft");

// ① 교과 고르기 → ② 그 교과의 개설 과목 고르기 → ③ 과목마다 맡은 반 고르기
export function SubjectsForm({
  teacherId,
  initialGroups,
  initialCourses,
  courses,
  classesByGrade,
  aiOn,
  dept,
}: {
  aiOn: boolean;
  dept: string | null;
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

  const [advice, setAdvice] = useState<CourseAdvice | null>(null);
  const [advising, startAdvice] = useTransition();
  const runAdvice = () => startAdvice(async () => {
    try {
      setAdvice(await adviseCourses({ teacherId, groups }));
    } catch {
      setAdvice({ ok: false, error: "추천을 만들지 못했어요. 직접 골라 주세요" });
    }
  });
  const applyAdvice = (a: Extract<CourseAdvice, { ok: true }>) => {
    setGroups((gs) => [...new Set([...gs, ...a.groups])]);
    setPicked((p) => {
      const next = { ...p };
      for (const id of a.courseIds) {
        const c = courses.find((x) => x.id === id);
        if (c && !next[id]) next[id] = [...(classesByGrade[c.grade] ?? [])];
      }
      return next;
    });
    setAdvice(null);
  };
  const label = advice?.ok ? advice.label : aiOn ? "AI" : "자동";

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
        <div className="rounded-inner bg-soft px-4 py-3.5 md:px-5 md:py-4">
          <div className="flex items-center gap-3 md:gap-4">
            <span className={cx("rounded-chip px-2.5 py-1 text-xs font-bold", label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{label}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold">내 교과로 추천</div>
              <div className="truncate text-[13px] text-sub">
                {advising ? "고르는 중이에요" : advice?.ok ? advice.reason : dept ? `${dept} 기준으로 편제표에서 맡을 과목을 골라요` : "고른 교과로 편제표에서 맡을 과목을 골라요"}
              </div>
            </div>
            <Button type="button" kind="outline" size="sm" onClick={runAdvice} disabled={advising || courses.length === 0}>
              {advising ? "고르는 중…" : advice?.ok ? "다시 추천" : "추천 받기"}
            </Button>
          </div>
          {advice && !advice.ok && <p className="mt-2 text-[13px] text-bad" role="alert">{advice.error}</p>}
          {advice?.ok && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {advice.groups.map((g) => <Tag key={g} tone="bg-key-soft text-key-strong">{g}</Tag>)}
                {advice.courseIds.map((id) => courses.find((c) => c.id === id)).filter((c): c is Course => !!c).map((c) => (
                  <Tag key={c.id} tone="bg-white text-sub">{`${c.subject} ${c.grade}-${c.semester}`}</Tag>
                ))}
              </div>
              {advice.notice && <p className="text-[12px] text-mute">{advice.notice}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" kind="ghost" size="sm" onClick={() => setAdvice(null)}>닫기</Button>
                <Button type="button" kind="outline" size="sm" onClick={() => applyAdvice(advice)}>확인 후 담기</Button>
              </div>
              <p className="text-[12px] text-mute">담은 뒤 반을 고르고 저장해야 반영돼요</p>
            </div>
          )}
        </div>

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
