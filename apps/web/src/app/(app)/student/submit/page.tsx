import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ClipboardList } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Card, Tag, cx } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { daysLeft, ddayLabel, effectiveStatus, md, usesDocs, usesSurvey } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { SurveyForm } from "./survey-form";
import { noticeLine } from "@/lib/domain/retention";
import { programRetention } from "@/lib/server/retention-sweep";

export const metadata = { title: "설문·서류 제출 · 속초고등학교 학생관리시스템" };

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const v = await requireCan("student.self");
  if (v.kind !== "student") redirect("/");
  const me = v.student;
  const t = today();
  const q = await searchParams;
  const [programs, mats, reminders] = await Promise.all([
    // 교사 메모만 쓰는 프로그램(N41)은 학생이 낼 것이 없다
    repo.listProgramsForStudent(me.id).then((ps) => ps.filter((p) => p.source !== "memo" && p.source !== "external")),
    repo.listMaterialsByStudent(me.id),
    repo.listReminders({ studentId: me.id }),
  ]);
  const responses = await Promise.all(programs.map((p) => repo.getResponse(p.id, me.id)));
  const rows = programs.map((p, i) => {
    const r = responses[i];
    const docs = usesDocs(p.source) && p.requestDocs;
    const myDocs = mats.filter((m) => m.programId === p.id);
    const surveyDone = !usesSurvey(p.source) || !!r?.submittedAt;
    const docsDone = !docs || myDocs.length > 0;
    const closed = effectiveStatus(p, t) === "closed" || daysLeft(p.endDate, t) < 0;
    const state = surveyDone && docsDone ? "제출 완료" : closed ? "마감" : r && !r.submittedAt ? "임시 저장" : "미응답";
    return { p, r, docs, myDocs, closed, state };
  });
  // 열린 것 먼저, 마감 임박 순
  rows.sort((a, b) => Number(a.closed) - Number(b.closed) || Number(a.state === "제출 완료") - Number(b.state === "제출 완료") || a.p.endDate.localeCompare(b.p.endDate));
  const sel = rows.find((x) => x.p.id === q.p) ?? rows.find((x) => !x.closed && x.state !== "제출 완료") ?? rows[0];
  const lastReminder = sel ? reminders.find((r) => r.programId === sel.p.id) : undefined;
  // N39: 올린 서류 원본이 지워지는 날 (이미 지웠으면 그 날)
  const ret = sel && sel.docs && sel.myDocs.length ? await programRetention(sel.p) : null;
  const purgedOn = sel && sel.myDocs.length && sel.myDocs.every((m) => m.purgedAt) ? sel.myDocs.reduce((d, m) => (m.purgedAt! > d ? m.purgedAt! : d), "").slice(0, 10) : null;
  const retLine = purgedOn ? { text: `서류 원본은 ${purgedOn}에 지웠어요 · 선생님이 쓴 기록은 그대로예요`, soon: false } : ret?.rawDue ? (() => { const n = noticeLine(ret.rawDue, t); return { text: `올린 서류 원본은 ${n.soon ? n.title.replace("이 자료는 ", "") : `${ret.rawDue}에 지워져요`} · 선생님이 쓴 기록은 남아요`, soon: n.soon }; })() : null;

  return (
    <>
      <PageHeader title={sel ? sel.p.title : "설문·서류 제출"} />
      <PageBody>
        {rows.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <ClipboardList size={28} className="text-mute" />
              <p className="font-bold">지금 낼 설문·서류가 없어요</p>
            </div>
          </Card>
        ) : (
          <>
            {rows.length > 1 && (
              <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
                {rows.map((x) => (
                  <Link key={x.p.id} href={`/student/submit?p=${x.p.id}`} aria-current={x === sel ? "page" : undefined}
                    className={cx("flex shrink-0 items-center gap-2 rounded-control px-3.5 py-2 text-[14px]", x === sel ? "bg-key font-bold text-white" : "bg-soft text-sub")}>
                    {x.p.title}
                    {!x.closed && x.state !== "제출 완료" ? <Tag>{ddayLabel(x.p.endDate, t)}</Tag> : <span className={cx("text-[12px]", x === sel ? "text-white/80" : "text-mute")}>{x.state}</span>}
                  </Link>
                ))}
              </nav>
            )}
            {sel && (
              <>
                <div className={cx("flex flex-wrap items-center gap-1.5 text-[13px] text-mute", rows.length <= 1 && "-mt-2 md:-mt-4")}>
                  <span>{md(sel.p.startDate)} ~ {md(sel.p.endDate)}</span>
                  <Tag>{sel.state === "미응답" || sel.state === "임시 저장" ? ddayLabel(sel.p.endDate, t) : sel.state}</Tag>
                  {sel.state === "임시 저장" && <Tag>임시 저장</Tag>}
                </div>
                {lastReminder && sel.state !== "제출 완료" && (
                  <p className="flex items-center gap-2 rounded-inner bg-due-soft px-4 py-3 text-[14px]"><Bell size={16} className="shrink-0 text-due" /> {lastReminder.message}</p>
                )}
                <SurveyForm
                  key={sel.p.id}
                  programId={sel.p.id}
                  questions={sel.p.questions}
                  initial={sel.r?.answers ?? {}}
                  submittedAt={sel.r?.submittedAt ?? null}
                  survey={usesSurvey(sel.p.source)}
                  docs={sel.docs}
                  docTitle={sel.p.docKinds[0] ?? "서류"}
                  myDocs={sel.myDocs.map((m) => ({ id: m.id, name: m.fileName, mine: m.uploaderId === me.id && m.matchedBy === "student" }))}
                  deadline={`${md(sel.p.endDate)} (${WEEK[new Date(`${sel.p.endDate}T00:00:00`).getDay()]}) 23:59`}
                  closed={sel.closed}
                  aiOn={aiEnabled()}
                />
                {retLine && <p className={cx("text-[12px]", retLine.soon ? "font-bold text-[#9A6400]" : "text-mute")}>{retLine.text}</p>}
              </>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
