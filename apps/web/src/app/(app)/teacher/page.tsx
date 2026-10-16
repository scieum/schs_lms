import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, Avatar, ButtonLink, Card, Row, StatTiles, Tag } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { daysLeft, ddayLabel, effectiveStatus, latestVersion, reviewStatus } from "@/lib/domain/program";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";

export const metadata = { title: "홈 · 속초고등학교 학생관리시스템" };

export default async function TeacherHome() {
  const v = await requireViewer();
  if (v.kind !== "teacher") redirect("/");
  const now = today();
  const programs = (await repo.listPrograms({ ownerId: v.accountId })).filter((p) => p.status !== "draft");
  const ids = programs.map((p) => p.id);
  const [waiting, jobs, versions, responses, students] = await Promise.all([
    repo.countDraftReviewQueue(v.accountId),
    ids.length ? repo.listDraftJobs({ programIds: ids }) : Promise.resolve([]),
    ids.length ? repo.listDraftVersions({ programIds: ids }) : Promise.resolve([]),
    Promise.all(programs.map((p) => repo.listResponses(p.id))),
    repo.listStudents(),
  ]);
  const name = new Map(students.map((s) => [s.id, s]));
  const title = new Map(programs.map((p) => [p.id, p.title]));

  // 응답률: 설문을 쓰는 열린 프로그램만
  const open = programs.map((p, i) => ({ p, submitted: responses[i].filter((r) => r.submittedAt).length }))
    .filter(({ p }) => effectiveStatus(p, now) === "open" && p.source !== "docs");
  const rate = open.length ? Math.round((100 * open.reduce((a, o) => a + o.submitted / Math.max(1, o.p.targetIds.length), 0)) / open.length) : null;
  const dueSoon = open.filter(({ p }) => daysLeft(p.endDate, now) <= 7).sort((a, b) => a.p.endDate.localeCompare(b.p.endDate));
  const failed = jobs.filter((j) => j.state === "ERROR");
  const pending = jobs.filter((j) => reviewStatus(j, latestVersion(versions, j.id)) === "검토 대기");
  const queue = [...failed, ...pending].slice(0, 5);

  return (
    <>
      <PageHeader title={`안녕하세요, ${v.teacher.name} 선생님`} actions={<ButtonLink href="/teacher/programs/new" size="sm">새 프로그램</ButtonLink>} />
      <PageBody>
        <StatTiles items={[["검토 대기 초안", `${waiting}건`], ["평균 응답률", rate === null ? "–" : `${rate}%`], ["마감 임박", `${dueSoon.length}개`], ["생성 실패", `${failed.length}건`]]} />
        <AiBanner
          title="오늘 브리핑"
          line={failed.length ? `생성 실패 ${failed.length}건은 직접 작성이 필요해요` : waiting ? `검토 대기 초안 ${waiting}건이 있어요` : "오늘 먼저 볼 일이 없어요"}
          action={<ButtonLink href="/teacher/drafts" kind="outline" size="sm" className="hidden md:inline-flex">검토 시작</ButtonLink>}
        />
        <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
          <Card title="검토할 초안" action={<ButtonLink href="/teacher/drafts" kind="ghost" size="sm">전체</ButtonLink>}>
            {queue.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">검토할 초안이 없어요</p>
            ) : (
              queue.map((j, i) => {
                const s = name.get(j.studentId);
                return (
                  <Row key={j.id} last={i === queue.length - 1} lead={<Avatar name={s?.name ?? "?"} />} title={s?.name ?? "학생"}
                    meta={`${s ? `${s.grade}학년 ${s.classNo}반 · ` : ""}${title.get(j.programId) ?? ""}`}
                    right={<a href={`/teacher/drafts?d=${j.id}`} className="shrink-0"><Tag>{j.state === "ERROR" ? "생성 실패" : "검토 대기"}</Tag></a>} />
                );
              })
            )}
          </Card>
          <Card title="마감 임박 설문" action={<ButtonLink href="/teacher/programs" kind="ghost" size="sm">전체</ButtonLink>}>
            {dueSoon.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">이번 주 마감이 없어요</p>
            ) : (
              dueSoon.map(({ p, submitted }, i) => (
                <Row key={p.id} last={i === dueSoon.length - 1} title={p.title} meta={`미응답 ${p.targetIds.length - submitted}명`}
                  right={<a href={`/teacher/programs/${p.id}`} className="shrink-0"><Tag>{ddayLabel(p.endDate, now)}</Tag></a>} />
              ))
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
