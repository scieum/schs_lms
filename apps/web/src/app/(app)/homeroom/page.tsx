import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { SampleTag } from "@/components/sample";
import { AiBanner, Card, Row, StatTiles, Tag } from "@/components/ui";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";

export const metadata = { title: "우리 반 · 속초고등학교 학생관리시스템" };

export default async function HomeroomHome() {
  const v = await requireViewer();
  if (v.kind !== "teacher" || !v.teacher.homeroom) redirect("/forbidden");
  const { grade, classNo } = v.teacher.homeroom;
  const mine = (await repo.listStudents()).filter((s) => s.grade === grade && s.classNo === classNo);
  return (
    <>
      <PageHeader title={`${grade}학년 ${classNo}반`} />
      <PageBody>
        <StatTiles items={[["우리 반", `${mine.length}명`], ["받은 초안", "41건"], ["최저 충족 예상", "18명"], ["오늘 야자", "26명"]]} />
        <AiBanner title="우리 반 브리핑" line="수능 최저 미충족 + 이번 주 야자 결석 2회인 학생이 있어요" />
        <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
          <Card title="학생 한눈에">
            {mine.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">아직 등록된 학생이 없어요</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {mine.map((s) => (
                  <div key={s.id} className="rounded-inner bg-white p-3.5">
                    <div className="font-bold">{s.name}</div>
                    <div className="text-[13px] text-mute">{s.number}번</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="이번 주 일정" action={<SampleTag />}>
            {[["10.18", "독서 토론 동아리 설문 마감"], ["10.20", "모의고사 성적 업로드"], ["10.22", "학부모 상담 주간"]].map(([d, t], i, a) => (
              <Row key={d} last={i === a.length - 1} lead={<Tag tone="bg-key-soft text-key-strong">{d}</Tag>} title={t} />
            ))}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
