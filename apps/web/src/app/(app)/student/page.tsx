import Link from "next/link";
import { BookOpen, ClipboardList, ListChecks, Moon, Upload } from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card, Tag } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { countByArea, isFresh, matchRecs, RECORD_AREAS } from "@/lib/domain/counsel";
import { ddayLabel, md } from "@/lib/domain/program";
import { orderTodos } from "@/lib/domain/student-assist";
import { aiEnabled } from "@/lib/server/ai/claude";
import { loadMyRecords } from "@/lib/server/counsel";
import { greeting } from "@/lib/domain/greeting";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";
import { myTodoInputs } from "./_lib/todos";
import { KindIcon } from "./recs/client";
import { TodoPlan } from "./todo-plan";
import { SchoolInfoRow } from "@/components/school-info";
import { seoulNow } from "@/lib/domain/night";

export const metadata = { title: "홈 · 속초고등학교 학생관리시스템" };

// S1 학생 홈 (Figma 50:294 / 50:452)
const tile = (Icon: typeof BookOpen) => (
  <span className="flex size-11 shrink-0 items-center justify-center rounded-field bg-soft"><Icon size={22} /></span>
);
// 줄 전체가 링크라서 오른쪽 버튼은 버튼 모양 글자(PC만)
const pill = (label: string) => (
  <span className="hidden shrink-0 rounded-control border border-hair bg-white px-3.5 py-2 text-[13px] font-medium md:inline-flex">{label}</span>
);
const more = (href: string, label: string) => <Link href={href} className="text-[13px] text-sub hover:text-ink">{label}</Link>;

function Stat({ label, value, action }: { label: string; value: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col surface rounded-card p-4 md:min-h-[144px] md:px-[22px] md:py-5">
      <div className="text-[13px] text-mute">{label}</div>
      <div className="mt-1.5 text-[22px] font-bold md:text-[28px]">{value}</div>
      {action && <div className="mt-2 hidden md:block">{action}</div>}
    </div>
  );
}

function TodoRow({ href, icon, title, tag, meta, button }: { href: string; icon: ReactNode; title: string; tag?: string; meta: string; button: string }) {
  return (
    <Link href={href} className="flex items-center gap-3.5 rounded-inner bg-white p-4 hover:bg-key-soft">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-bold">
          <span className="truncate">{title}</span>
          {tag && <Tag>{tag}</Tag>}
        </div>
        <div className="truncate text-[13px] text-mute">{meta}</div>
      </div>
      {pill(button)}
    </Link>
  );
}

export default async function StudentHome() {
  const v = await requireViewer();
  if (v.kind !== "student") redirect("/");
  const s = v.student;
  const now = today();
  const [todos, scores, night, inputs, records, recItems] = await Promise.all([
    repo.listStudentTodos(s.id, now),
    repo.scoresStudentSummary(s.id),
    repo.nightStudentWeek(s.id),
    myTodoInputs(s, now),
    loadMyRecords(v),
    repo.listRecItems(),
  ]);
  const surveys = todos.filter((t) => t.kind === "survey");
  const docs = todos.filter((t) => t.kind === "docs");
  const steps = orderTodos(inputs, now);
  const planLine = steps.length ? `${steps[0].title}부터 · ${steps[0].why}` : "지금 낼 것이 없어요";
  const firstSurvey = surveys[0] ? `/student/submit?p=${surveys[0].programId}` : null;
  const nightTodo = inputs.find((x) => x.kind === "night");
  const courseTodo = inputs.find((x) => x.kind === "courses");
  const counts = countByArea(records);
  const recs = matchRecs(recItems, s.careerGoal).slice(0, 2);
  const respond = firstSurvey && (
    <ButtonLink href={firstSurvey} size="sm"><ClipboardList size={15} /> 설문 응답하기</ButtonLink>
  );

  return (
    <>
      <PageHeader
        title={greeting(`${s.name} 학생`)}
        actions={<span className="hidden md:block"><ButtonLink href="/student/record" kind="outline"><BookOpen size={18} /> 내 생활기록부</ButtonLink></span>}
      />
      <PageBody>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
          <Stat label="제출할 설문" value={`${surveys.length}개`} action={respond} />
          <Stat label="제출할 서류" value={`${docs.length}개`} />
          <Stat
            label={scores.latestExam ? `${scores.latestExam.month}월 모의 평균` : "모의 평균"}
            value={scores.latestAverage === null ? "–" : `${scores.latestAverage.toFixed(1)}등급`}
          />
          <Stat label="이번 주 야자" value={`${night.signed}일`} />
        </div>
        {firstSurvey && (
          <ButtonLink href={firstSurvey} className="w-full md:hidden"><ClipboardList size={18} /> 설문 응답하기</ButtonLink>
        )}
        <TodoPlan initial={{ steps, line: planLine }} aiOn={aiEnabled()} />

        <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
          <Card title="오늘 할 일" action={more("/student/submit", "전체 보기")} className="h-full">
            <div className="flex flex-col gap-3">
              {todos.map((t) => (
                <TodoRow
                  key={`${t.programId}-${t.kind}`}
                  href={`/student/submit?p=${t.programId}`}
                  icon={tile(t.kind === "survey" ? ClipboardList : Upload)}
                  title={`${t.title} ${t.kind === "survey" ? "설문" : "서류 제출"}`}
                  tag={ddayLabel(t.endDate, now)}
                  meta={`${t.progress} · ${md(t.endDate)} 마감`}
                  button={t.kind === "survey" ? "응답하기" : "제출하기"}
                />
              ))}
              {courseTodo && (
                <TodoRow href={courseTodo.href} icon={tile(ListChecks)} title={courseTodo.title} meta={`${courseTodo.progress} · ${md(courseTodo.due)} 마감`} button="신청" />
              )}
              {nightTodo ? (
                <TodoRow href="/student/night" icon={tile(Moon)} title="다음 주 야자 신청" meta={`${nightTodo.progress} · ${md(nightTodo.due)} 마감`} button="신청" />
              ) : (
                <TodoRow href="/student/night" icon={tile(Moon)} title="야자 신청" meta={`이번 주 ${night.signed}일 · 출석 ${night.attended}일`} button="보기" />
              )}
            </div>
          </Card>

          <div className="flex flex-col gap-4 md:gap-6">
            <Card title="내 생활기록부" action={more("/student/record", "열기")}>
              <p className="mb-3 text-[14px] text-sub">확정된 기록 {records.length}건</p>
              <dl className="flex flex-col gap-2.5 text-[14px]">
                {RECORD_AREAS.map((a) => (
                  <div key={a} className="flex justify-between">
                    <dt className="text-mute">{a}</dt>
                    <dd className="font-medium">{counts[a]}건</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card title="나에게 맞는 추천" action={more("/student/recs", "더 보기")} className="flex-1">
              {recs.length === 0 ? (
                <p className="py-4 text-center text-sm text-mute">희망 진로를 정하면 보여요</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {recs.map((it) => (
                    <li key={it.id}>
                      <Link href="/student/recs" className="flex items-center gap-3">
                        <KindIcon kind={it.kind} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[15px] font-bold">{it.title}</span>
                            {isFresh(it.createdAt) && <Tag>새로 추가</Tag>}
                          </span>
                          <span className="block truncate text-[13px] text-mute">{[it.meta, it.kind].filter(Boolean).join(" · ")}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
        <SchoolInfoRow today={seoulNow().date} grade={v.student.grade} />
      </PageBody>
    </>
  );
}
