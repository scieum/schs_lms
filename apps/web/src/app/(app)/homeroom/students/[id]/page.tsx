import { notFound, redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ActivityList } from "@/components/counsel/activity-list";
import { AiAttach } from "@/components/counsel/ai-attach";
import { CounselList } from "@/components/counsel/counsel-list";
import { TabLinks } from "@/components/counsel/tab-links";
import { BarChart, KV } from "@/components/scores/parts";
import { ButtonLink, Card, Row, StatTiles, Tag } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { SUBJECT_LABEL, SUBJECTS } from "@/lib/domain/scores";
import { canViewStudentRecord, countByArea, RECORD_AREAS } from "@/lib/domain/counsel";
import {
  activityItems, fmtDate, loadCounsel, loadStudentLogs, loadStudentService, loadStudentSetuk, teacherNames,
} from "@/lib/server/counsel";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { summarizeFlow } from "./actions";

export const metadata = { title: "학생 기록 · 속초고등학교 학생관리시스템" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };
const TABS = ["draft", "scores", "counsel", "night", "logs"] as const;
type TabKey = (typeof TABS)[number];

export default async function StudentRecordPage({ params, searchParams }: Props) {
  const v = await requireCan("homeroom.view");
  const { id } = await params;
  const q = await searchParams;
  const student = await repo.getStudent(id);
  if (!student) notFound();
  if (!canViewStudentRecord(v, student)) redirect("/forbidden");
  const tab: TabKey = (TABS as readonly string[]).includes(q.tab ?? "") ? (q.tab as TabKey) : "draft";

  const names = await teacherNames();
  const [setuk, logs, service, counsel, past, corrections] = await Promise.all([
    loadStudentSetuk(student),
    loadStudentLogs(student.id),
    loadStudentService(student.id),
    loadCounsel(v, [student]),
    repo.listPastRecords([student.id]),
    repo.listCorrectionRequests([student.id]),
  ]);
  const [scores, night, finals] = await Promise.all([repo.scoresStudentSummary(student.id), repo.nightStudentWeek(student.id), repo.listDraftsForStudents([student.id])]);
  const drafts = activityItems(setuk, [], [], names);
  const logItems = activityItems([], logs, service, names);
  const pastCount = countByArea(past);
  const now = today();
  const base = `/homeroom/students/${student.id}`;

  return (
    <>
      <PageHeader title={student.name} actions={
        <ButtonLink href={`/teacher/counseling?student=${student.id}`} kind="outline" size="sm"><MessageSquare size={16} /> 상담 기록</ButtonLink>
      } />
      <PageBody>
        <p className="-mt-3 text-[13px] text-mute md:-mt-4">{student.grade}학년 {student.classNo}반 {student.number}번 · 희망 진로 {student.careerGoal ?? "미정"}</p>
        <AiAttach title="기록 흐름 요약" line="1·2학년 기록에서 진로 키워드·보완점·겹치는 소재를 찾아요" run={summarizeFlow}
          studentId={student.id} today={now} attachLabel="상담 메모에 붙이기" topicsLabel="보완점" />

        <TabLinks tone="none" active={tab} items={[
          { key: "draft", label: `생기부 초안 ${drafts.length + finals.length}`, href: base },
          { key: "scores", label: "성적", href: `${base}?tab=scores` },
          { key: "counsel", label: `상담 ${counsel.length}`, href: `${base}?tab=counsel` },
          { key: "night", label: "야자", href: `${base}?tab=night` },
          { key: "logs", label: `누가기록·봉사 ${logItems.length}`, href: `${base}?tab=logs` },
        ]} />

        {tab === "draft" && (
          <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
            <div className="flex min-w-0 flex-col gap-4 md:gap-6">
              <Card title="생기부 초안 모음" action={<span className="text-[13px] text-mute">올해 교과세특</span>}>
                <ActivityList items={drafts} empty="올해 쓴 교과세특이 없어요" />
              </Card>
              <Card title="프로그램 초안" action={<span className="text-[13px] text-mute">확정 {finals.length}건</span>}>
                {finals.length === 0 ? (
                  <p className="py-6 text-center text-sm text-mute">확정된 프로그램 초안이 없어요</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {finals.map((d) => (
                      <li key={d.programId} className="rounded-inner bg-white p-4">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate font-bold">{d.programTitle}</span>
                          <Tag>확정</Tag>
                        </div>
                        <p className="mt-0.5 text-xs text-mute">{d.area}{d.subject ? ` · ${d.subject}` : ""} · {(d.authorId && names.get(d.authorId)) || "교사"} · {fmtDate(d.finalizedAt)}</p>
                        <p className="mt-2 text-sm leading-relaxed text-sub">{d.content}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            <div className="flex flex-col gap-4 md:gap-6">
              <Card title="지난 학년도 확정본">
                {past.length === 0 ? (
                  <p className="py-4 text-center text-sm text-mute">확정본이 없어요</p>
                ) : (
                  RECORD_AREAS.map((a, i) => (
                    <Row key={a} last={i === RECORD_AREAS.length - 1} title={a} right={<span className="text-sm font-bold">{pastCount[a]}건</span>} />
                  ))
                )}
              </Card>
              <Card title="정정 요청" action={<span className="text-[13px] text-mute">{corrections.length}건</span>}>
                {corrections.length === 0 ? (
                  <p className="py-4 text-center text-sm text-mute">받은 요청이 없어요</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {corrections.map((c) => {
                      const rec = past.find((p) => p.id === c.recordId);
                      return (
                        <li key={c.id} className="rounded-inner bg-white p-3.5">
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-bold">{rec ? `${rec.area} · ${rec.title}` : "교과세특"}</span>
                            <Tag>{c.status === "done" ? "완료" : "대기"}</Tag>
                          </div>
                          <p className="mt-1 text-[13px] text-sub">{c.reason}</p>
                          <p className="mt-1 text-xs text-mute">{fmtDate(c.createdAt)}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}

        {tab === "scores" && (
          <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
            <Card title="모의고사 평균 등급" action={<ButtonLink href="/homeroom/scores" kind="ghost" size="sm">성적 업로드</ButtonLink>}>
              {scores.trend.length === 0 ? (
                <p className="py-8 text-center text-sm text-mute">아직 올린 성적이 없어요</p>
              ) : (
                <BarChart invert items={scores.trend.map((t) => ({ label: t.label, value: t.average }))} format={(n) => n.toFixed(1)} />
              )}
              {scores.latestGrades && (
                <dl className="mt-4 grid grid-cols-3 gap-x-4 md:grid-cols-6">
                  {SUBJECTS.map((k) => <KV key={k} k={SUBJECT_LABEL[k]} v={scores.latestGrades![k] === null ? "–" : `${scores.latestGrades![k]}`} />)}
                </dl>
              )}
            </Card>
            <Card title="수능 최저 판정" action={<span className="text-[13px] text-mute">{scores.latestExam?.name ?? ""}</span>}>
              {scores.targets.length === 0 ? (
                <p className="py-6 text-center text-sm text-mute">목표 대학이 없어요</p>
              ) : (
                scores.targets.map((t, i) => (
                  <Row key={t.rank} last={i === scores.targets.length - 1} title={`${t.university} ${t.major}`} meta={t.reason} right={<Tag>{t.status}</Tag>} />
                ))
              )}
            </Card>
          </div>
        )}

        {tab === "counsel" && (
          <Card title="상담 기록" action={<ButtonLink href={`/teacher/counseling?student=${student.id}#new-counsel`} size="sm">기록 쓰기</ButtonLink>}>
            <CounselList studentId={student.id} today={now} items={counsel.map((r) => ({
              id: r.id, date: r.date, area: r.area, content: r.content, author: names.get(r.authorId) ?? "교사",
              mine: r.authorId === v.accountId, revised: !!r.prevId,
            }))} />
          </Card>
        )}

        {tab === "night" && (
          <div className="flex flex-col gap-4 md:gap-6">
            <StatTiles items={[["이번 주 신청", `${night.signed}일`], ["출석", `${night.attended}일`]]} />
            <ButtonLink href="/homeroom/night" kind="outline" size="sm" className="w-fit">야간 자율학습 관리</ButtonLink>
          </div>
        )}

        {tab === "logs" && (
          <Card title="누가기록·봉사">
            <ActivityList items={logItems} empty="아직 누가기록·봉사가 없어요" />
          </Card>
        )}
      </PageBody>
    </>
  );
}
