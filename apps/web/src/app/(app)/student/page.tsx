import Link from "next/link";
import { BookOpen, ClipboardList, Moon, Upload } from "lucide-react";
import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card, Row, StatTiles, Tag } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { ddayLabel } from "@/lib/domain/program";
import { orderTodos } from "@/lib/domain/student-assist";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";
import { myTodoInputs } from "./_lib/todos";
import { TodoPlan } from "./todo-plan";

export const metadata = { title: "홈 · 속초고등학교 학생관리시스템" };

const tile = (Icon: typeof BookOpen) => (
  <span className="flex size-11 shrink-0 items-center justify-center rounded-field bg-white"><Icon size={22} /></span>
);

export default async function StudentHome() {
  const v = await requireViewer();
  if (v.kind !== "student") redirect("/");
  const s = v.student;
  const now = today();
  const [todos, scores, night, inputs] = await Promise.all([
    repo.listStudentTodos(s.id, now),
    repo.scoresStudentSummary(s.id),
    repo.nightStudentWeek(s.id),
    myTodoInputs(s, now),
  ]);
  const surveys = todos.filter((t) => t.kind === "survey");
  const docs = todos.filter((t) => t.kind === "docs");
  const steps = orderTodos(inputs, now);
  const planLine = steps.length ? `${steps[0].title}부터 · ${steps[0].why}` : "지금 낼 것이 없어요";

  return (
    <>
      <PageHeader title={`안녕하세요, ${s.name} 학생`} actions={<ButtonLink href="/student/record" kind="outline" size="sm">내 생활기록부</ButtonLink>} />
      <PageBody>
        <StatTiles items={[
          ["제출할 설문", `${surveys.length}개`],
          ["제출할 서류", `${docs.length}개`],
          [scores.latestExam ? `${scores.latestExam.month}월 모의 평균` : "모의 평균", scores.latestAverage === null ? "–" : `${scores.latestAverage.toFixed(1)}등급`],
          ["이번 주 야자", `${night.signed}일`],
        ]} />
        <TodoPlan initial={{ steps, line: planLine }} aiOn={aiEnabled()} />
        <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
          <Card title="오늘 할 일">
            <div className="flex flex-col gap-2">
              {todos.map((t) => (
                <Link key={`${t.programId}-${t.kind}`} href={`/student/submit?p=${t.programId}`} className="flex items-center gap-3.5 rounded-inner bg-white p-4 hover:bg-key-soft">
                  {tile(t.kind === "survey" ? ClipboardList : Upload)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className="truncate">{t.title} {t.kind === "survey" ? "설문" : "서류 제출"}</span>
                      <Tag>{ddayLabel(t.endDate, now)}</Tag>
                    </div>
                    <div className="text-[13px] text-mute">{t.progress}</div>
                  </div>
                </Link>
              ))}
              <Link href="/student/night" className="flex items-center gap-3.5 rounded-inner bg-white p-4 hover:bg-key-soft">
                {tile(Moon)}
                <div className="min-w-0 flex-1">
                  <div className="font-bold">야자 신청</div>
                  <div className="text-[13px] text-mute">이번 주 {night.signed}일 · 출석 {night.attended}일</div>
                </div>
              </Link>
            </div>
          </Card>
          <Card title="목표 대학 최저" action={<ButtonLink href="/student/scores" kind="ghost" size="sm">성적</ButtonLink>}>
            {scores.targets.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">목표 대학을 정해 보세요</p>
            ) : (
              scores.targets.map((t, i) => (
                <Row key={t.rank} last={i === scores.targets.length - 1} title={`${t.university} ${t.major}`} right={<Tag>{t.status}</Tag>} />
              ))
            )}
            <Row last title="희망 진로" right={<Link href="/me" className="text-sm font-medium text-key">{s.careerGoal ?? "정하기"}</Link>} />
          </Card>
        </div>
      </PageBody>
    </>
  );
}
