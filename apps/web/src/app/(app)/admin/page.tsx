import { AlertCircle } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, ButtonLink, Card, Row, StatTiles, Tag } from "@/components/ui";
import { accountStatus } from "@/lib/domain/accounts";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { actionLabel } from "./audit/labels";

export const metadata = { title: "관리 홈 · 속초고등학교 학생관리시스템" };

export default async function AdminHome() {
  await requireCan("account.manage");
  const now = new Date();
  const [students, audit, accounts, jobs, programs] = await Promise.all([
    repo.listStudents(), repo.listAudit(5), repo.adminListAccounts(), repo.listDraftJobs({}), repo.listPrograms(),
  ]);
  const errors = jobs.filter((j) => j.state === "ERROR");
  const running = jobs.filter((j) => j.state === "PENDING" || j.state === "RUNNING").length;
  const waiting = accounts.filter((a) => accountStatus(a, now) === "대기").length;
  const byStudent = new Map(students.map((s) => [s.id, s.name]));
  const byProgram = new Map(programs.map((p) => [p.id, p.title]));
  const names = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <>
      <PageHeader title="관리 홈" actions={<ButtonLink href="/students/new" kind="outline" size="sm">학생 등록</ButtonLink>} />
      <PageBody>
        <StatTiles items={[["학생 계정", `${students.length}명`], ["오류", `${errors.length}건`], ["생성 중", `${running}건`], ["계정 대기", `${waiting}명`]]} />
        <AiBanner
          title="오늘 점검"
          label="자동"
          line={errors.length ? `초안 생성 실패 ${errors.length}건 — 재시도하거나 담당 교사에게 직접 작성을 요청하세요` : "실패한 초안이 없어요"}
          action={<ButtonLink href="/admin/errors" size="sm" className="hidden md:inline-flex">오류 처리</ButtonLink>}
        />
        <div className="grid gap-4 md:grid-cols-[1fr_360px] md:gap-6">
          <Card title="오류 처리" action={<ButtonLink href="/admin/errors" kind="ghost" size="sm">전체</ButtonLink>}>
            {errors.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">처리할 오류가 없어요</p>
            ) : (
              errors.slice(0, 5).map((j, i, a) => (
                <Row key={j.id} last={i === a.length - 1}
                  lead={<span className="flex size-10 items-center justify-center rounded-field bg-white"><AlertCircle size={20} /></span>}
                  title={`${byStudent.get(j.studentId) ?? "학생"} · ${byProgram.get(j.programId) ?? ""}`}
                  meta={j.error ?? `초안 ${j.attempts}회 생성 실패`} right={<Tag>실패</Tag>} />
              ))
            )}
          </Card>
          <Card title="최근 활동" action={<ButtonLink href="/admin/audit" kind="ghost" size="sm">전체</ButtonLink>}>
            {audit.length === 0 ? (
              <p className="text-sm text-mute">아직 기록이 없어요</p>
            ) : (
              audit.map((a, i) => (
                <Row key={a.id} last={i === audit.length - 1} title={actionLabel(a.action)}
                  meta={`${new Date(a.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}${a.actorId ? ` · ${names.get(a.actorId) ?? ""}` : ""}`} />
              ))
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
