import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Button, Card, Row, StatTiles, Tag } from "@/components/ui";
import { homeroomStudents } from "@/lib/domain/activity";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { confirmService } from "../../teacher/service/actions";

export const metadata = { title: "봉사 받은함 · 속초고등학교 학생관리시스템" };

export default async function HomeroomServicePage() {
  const v = await requireCan("service.receive");
  const [all, teachers] = await Promise.all([repo.listStudents(), repo.listTeachers()]);
  const mine = homeroomStudents(v, all);
  const byId = new Map(mine.map((s) => [s.id, s]));
  const nameOf = new Map(teachers.map((t) => [t.id, t.name]));
  const records = await repo.listServiceRecords({ studentIds: mine.map((s) => s.id) });
  const waiting = records.filter((r) => r.status === "sent");
  const done = records.filter((r) => r.status === "confirmed");
  const title = v.kind === "teacher" && v.teacher.homeroom ? `${v.teacher.homeroom.grade}학년 ${v.teacher.homeroom.classNo}반 봉사 받은함` : "봉사 받은함";

  const list = (rows: typeof records, confirm: boolean) =>
    rows.map((r, i) => {
      const s = byId.get(r.studentId);
      return (
        <Row
          key={r.id}
          last={i === rows.length - 1}
          title={`${s?.number ?? ""}번 ${s?.name ?? "?"} · ${r.hours}시간`}
          meta={`${r.date} · ${r.organization} · ${r.activity} · 보낸 분 ${nameOf.get(r.uploaderId) ?? "?"}`}
          right={
            <div className="flex shrink-0 items-center gap-2">
              <a href={`/service/file/${r.id}`} target="_blank" rel="noreferrer" className="text-[13px] text-key-strong">확인서</a>
              <div className="flex w-[76px] justify-end">
                {confirm ? (
                  <form action={confirmService}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button kind="outline" size="sm" className="w-[76px] px-0">확인</Button>
                  </form>
                ) : (
                  <Tag>확정</Tag>
                )}
              </div>
            </div>
          }
        />
      );
    });

  return (
    <>
      <PageHeader title={title} />
      <PageBody>
        <StatTiles items={[["확인 대기", `${waiting.length}건`], ["확인함", `${done.length}건`], ["반 총 시간", `${done.reduce((n, r) => n + r.hours, 0)}시간`], ["학생", `${mine.length}명`]]} />
        <Card title="확인 대기">
          {waiting.length ? list(waiting, true) : <p className="py-4 text-center text-sm text-mute">새로 받은 확인서가 없어요</p>}
        </Card>
        <Card title="확인함">
          {done.length ? list(done, false) : <p className="py-4 text-center text-sm text-mute">아직 없어요</p>}
        </Card>
      </PageBody>
    </>
  );
}
