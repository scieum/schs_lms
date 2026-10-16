import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Card, Row, Tag } from "@/components/ui";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export const metadata = { title: "감사 로그 · 속초고등학교 학생관리시스템" };

const LABEL: Record<string, string> = {
  login: "로그인", logout: "로그아웃", "login.locked": "로그인 잠김", "password.change": "비밀번호 변경", "student.register": "학생 등록",
};

export default async function AuditPage() {
  await requireCan("audit.view");
  const rows = await repo.listAudit(200);
  return (
    <>
      <PageHeader title="감사 로그" />
      <PageBody>
        <Card>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-mute">아직 기록이 없어요</p>
          ) : (
            rows.map((a, i) => (
              <Row
                key={a.id}
                last={i === rows.length - 1}
                title={LABEL[a.action] ?? a.action}
                meta={`${new Date(a.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}${a.target ? ` · ${a.target}` : ""}`}
                right={a.action === "login.locked" ? <Tag>잠김</Tag> : undefined}
              />
            ))
          )}
        </Card>
      </PageBody>
    </>
  );
}
