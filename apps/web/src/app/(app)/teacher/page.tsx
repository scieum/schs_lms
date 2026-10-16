import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { SampleTag } from "@/components/sample";
import { AiBanner, Avatar, Button, ButtonLink, Card, Row, StatTiles, Tag } from "@/components/ui";
import { requireViewer } from "@/lib/server/viewer";

export const metadata = { title: "홈 · 속초고등학교 학생관리시스템" };

export default async function TeacherHome() {
  const v = await requireViewer();
  if (v.kind !== "teacher") redirect("/");
  return (
    <>
      <PageHeader title={`안녕하세요, ${v.teacher.name} 선생님`} actions={<ButtonLink href="/students/new" size="sm">학생 등록</ButtonLink>} />
      <PageBody>
        <StatTiles items={[["검토 대기 초안", "12건"], ["평균 응답률", "87%"], ["마감 임박", "2개"], ["생성 실패", "1건"]]} />
        <AiBanner title="오늘 브리핑" line="근거 연결이 약한 초안 3건을 먼저 보세요" action={<Button size="sm" disabled className="hidden md:inline-flex">검토 시작</Button>} />
        <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
          <Card title="검토 대기 초안" action={<SampleTag />}>
            {[["김민준", "2학년 3반 · 진로 탐색 주간", "검토 대기"], ["이수아", "2학년 1반 · 과학 탐구 발표", "검토 대기"], ["최지우", "2학년 2반 · 과학 탐구 발표", "생성 실패"]].map(([n, m, t], i, a) => (
              <Row key={n} last={i === a.length - 1} lead={<Avatar name={n} />} title={n} meta={m} right={<Tag>{t}</Tag>} />
            ))}
          </Card>
          <Card title="마감 임박 설문" action={<SampleTag />}>
            {[["독서 토론 동아리", "미응답 8명", "D-2"], ["과학 탐구 발표", "미응답 5명", "D-4"]].map(([n, m, t], i, a) => (
              <Row key={n} last={i === a.length - 1} title={n} meta={m} right={<Tag>{t}</Tag>} />
            ))}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
