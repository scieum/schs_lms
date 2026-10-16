import { AlertCircle } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { SampleTag } from "@/components/sample";
import { AiBanner, ButtonLink, Card, Row, StatTiles, Tag } from "@/components/ui";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export const metadata = { title: "관리 홈 · 속초고등학교 학생관리시스템" };

const ACTION_LABEL: Record<string, string> = {
  login: "로그인", logout: "로그아웃", "login.locked": "로그인 잠김", "password.change": "비밀번호 변경", "student.register": "학생 등록",
};

export default async function AdminHome() {
  await requireCan("account.manage");
  const [students, audit] = await Promise.all([repo.listStudents(), repo.listAudit(5)]);
  return (
    <>
      <PageHeader title="관리 홈" actions={<ButtonLink href="/students/new" kind="outline" size="sm">학생 등록</ButtonLink>} />
      <PageBody>
        <StatTiles items={[["학생 계정", `${students.length}명`], ["오류", "2건"], ["생성 중", "3건"], ["계정 대기", "4명"]]} />
        <AiBanner title="오늘 점검" line="실패 2건 모두 스캔이 흐려요 — 다시 올려 달라고 요청할까요?" />
        <div className="grid gap-4 md:grid-cols-[1fr_360px] md:gap-6">
          <Card title="오류 처리" action={<SampleTag />}>
            {[["최지우 · 과학 탐구 발표", "초안 3회 생성 실패", "실패"], ["독서 토론 동아리", "설문 응답 0건", "확인 필요"]].map(([t, m, s], i, a) => (
              <Row key={t} last={i === a.length - 1} lead={<span className="flex size-10 items-center justify-center rounded-field bg-white"><AlertCircle size={20} /></span>} title={t} meta={m} right={<Tag>{s}</Tag>} />
            ))}
          </Card>
          <Card title="최근 활동" action={<ButtonLink href="/admin/audit" kind="ghost" size="sm">전체</ButtonLink>}>
            {audit.length === 0 ? (
              <p className="text-sm text-mute">아직 기록이 없어요</p>
            ) : (
              audit.map((a, i) => (
                <Row key={a.id} last={i === audit.length - 1} title={ACTION_LABEL[a.action] ?? a.action} meta={`${new Date(a.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}${a.target ? ` · ${a.target}` : ""}`} />
              ))
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
