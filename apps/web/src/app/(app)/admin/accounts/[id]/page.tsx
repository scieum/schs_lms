import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Button, ButtonLink, Card, Row, StatTiles, Tag } from "@/components/ui";
import { accountStatus, lastSeenLabel, ROLE_LABEL } from "@/lib/domain/accounts";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { resetPassword, unlockAccount } from "../actions";
import { TeacherForm } from "../teacher-form";

export const metadata = { title: "교사 계정 · 속초고등학교 학생관리시스템" };

type Props = { params: Promise<{ id: string }> };

export default async function TeacherAccountPage({ params }: Props) {
  await requireCan("account.manage");
  const { id } = await params;
  const summary = (await repo.adminListAccounts()).find((a) => a.id === id && a.kind === "teacher");
  if (!summary?.teacher) notFound();
  const t = summary.teacher;
  const now = new Date();
  const st = accountStatus(summary, now);

  return (
    <>
      <PageHeader title={`${t.name} 선생님`} actions={<ButtonLink href="/admin/accounts" kind="outline" size="sm">목록</ButtonLink>} />
      <PageBody>
        <StatTiles
          items={[
            ["역할", t.roles.map((r) => ROLE_LABEL[r]).join("·")],
            ["담임", t.homeroom ? `${t.homeroom.grade}-${t.homeroom.classNo}` : "없음"],
            ["최근 접속", lastSeenLabel(summary.lastLoginAt, now)],
            ["상태", st],
          ]}
        />
        <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
          <Card title="역할·담임 반·부서">
            <TeacherForm teacher={t} />
          </Card>
          <Card title="계정">
            <Row title="로그인 ID" right={<span className="text-sm font-medium">{summary.loginId}</span>} />
            <Row title="상태" right={<Tag>{st}</Tag>} last />
            <div className="mt-4 flex flex-col gap-2">
              <form action={resetPassword}>
                <input type="hidden" name="id" value={t.id} />
                <ConfirmButton kind="outline" className="w-full" message="비밀번호를 학교 인증코드로 되돌릴까요? 다음 로그인 때 새로 정해요">
                  비밀번호 초기화
                </ConfirmButton>
              </form>
              {st === "잠김" && (
                <form action={unlockAccount}>
                  <input type="hidden" name="id" value={t.id} />
                  <Button kind="soft" className="w-full">잠금 해제</Button>
                </form>
              )}
            </div>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
