import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Card, Row, StatTiles, Tag } from "@/components/ui";
import { periodLabel, today } from "@/lib/domain/activity";
import { aiReadEnabled } from "@/lib/server/ai/read-service-doc";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { ServiceUploadForm } from "./upload-form";
import { makeStudentNo } from "@/lib/domain/roster";

export const metadata = { title: "봉사 확인서 · 속초고등학교 학생관리시스템" };

export default async function ServicePage() {
  const v = await requireCan("service.upload");
  const [students, sent] = await Promise.all([repo.listStudents(), repo.listServiceRecords({ uploaderId: v.accountId })]);
  const byId = new Map(students.map((s) => [s.id, s]));
  const confirmed = sent.filter((r) => r.status === "confirmed").length;

  return (
    <>
      <PageHeader title="봉사 확인서" />
      <PageBody>
        <StatTiles items={[["보낸 확인서", `${sent.length}건`], ["담임 확인", `${confirmed}건`], ["확인 대기", `${sent.length - confirmed}건`], ["총 시간", `${sent.reduce((n, r) => n + r.hours, 0)}시간`]]} />
        <Card title="확인서 올리기">
          <ServiceUploadForm
            aiOn={aiReadEnabled()}
            today={today()}
            students={students
              .sort((a, b) => a.studentNo.localeCompare(b.studentNo))
              .map((s) => ({ id: s.id, label: `${s.studentNo} ${s.name}` }))}
          />
        </Card>
          <Card title="보낸 확인서">
            {sent.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">아직 보낸 확인서가 없어요</p>
            ) : (
              sent.map((r, i) => {
                const s = byId.get(r.studentId);
                return (
                  <Row
                    key={r.id}
                    last={i === sent.length - 1}
                    title={`${s?.name ?? "?"} · ${r.hours}시간 · ${r.organization}`}
                    meta={`${periodLabel(r)} · ${s ? `${makeStudentNo(s.grade, s.classNo, s.number)}` : ""} · ${r.activity}`}
                    right={
                      <div className="flex shrink-0 items-center gap-2">
                        <a href={`/service/file/${r.id}`} target="_blank" rel="noreferrer" className="text-[13px] text-key-strong">파일</a>
                        <Tag>{r.status === "confirmed" ? "확정" : "대기"}</Tag>
                      </div>
                    }
                  />
                );
              })
            )}
          </Card>
      </PageBody>
    </>
  );
}
