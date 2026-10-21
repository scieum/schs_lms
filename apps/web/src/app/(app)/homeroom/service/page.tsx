import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Card, StatTiles, Tag } from "@/components/ui";
import { homeroomStudents, periodLabel } from "@/lib/domain/activity";
import { serviceCheck, serviceTotals } from "@/lib/domain/homeroom";
import { seoulNow } from "@/lib/domain/night";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { serviceActivityCheck } from "@/lib/domain/length";
import { ServiceAi } from "./service-ai";
import { InboxRow } from "./inbox-row";

export const metadata = { title: "봉사 받은함 · 속초고 쌤기부" };

export default async function HomeroomServicePage() {
  const v = await requireCan("service.receive");
  const [all, teachers] = await Promise.all([repo.listStudents(), repo.listTeachers()]);
  const mine = homeroomStudents(v, all);
  const byId = new Map(mine.map((s) => [s.id, s]));
  const nameOf = new Map(teachers.map((t) => [t.id, t.name]));
  const records = await repo.listServiceRecords({ studentIds: mine.map((s) => s.id) });
  const waiting = records.filter((r) => r.status === "sent");
  const done = records.filter((r) => r.status === "confirmed");
  const totals = serviceTotals(mine.map((s) => s.id), records);
  const check = serviceCheck(totals, records, seoulNow().date);
  const flagged = new Set([...check.zero, ...check.low]);
  const title = v.kind === "teacher" && v.teacher.homeroom ? `${v.teacher.homeroom.grade}학년 ${v.teacher.homeroom.classNo}반 봉사 받은함` : "봉사 받은함";

  // N42 ④: 활동내용 줄 + 길이 칩 · 넘은 행은 줄이기 · 바꾸고 확인
  const list = (rows: typeof records, confirm: boolean) =>
    rows.map((r, i) => {
      const s = byId.get(r.studentId);
      return (
        <InboxRow key={r.id} id={r.id} studentId={r.studentId} last={i === rows.length - 1} waiting={confirm} activity={r.activity}
          title={`${s?.number ?? ""}번 ${s?.name ?? "?"} · ${r.hours}시간`}
          meta={`${periodLabel(r)} · ${r.organization} · 보낸 분 ${nameOf.get(r.uploaderId) ?? "?"}`} />
      );
    });
  const overN = waiting.filter((r) => serviceActivityCheck(r.activity).over).length;

  return (
    <>
      <PageHeader title={title} />
      <PageBody>
        <StatTiles items={[["확인 대기", `${waiting.length}건`], ["확인함", `${done.length}건`], ["반 총 시간", `${done.reduce((n, r) => n + r.hours, 0)}시간`], ["학생", `${mine.length}명`]]} />
        <ServiceAi line={check.text} ai={aiEnabled()} />
        <Card title="확인 대기">
          {overN > 0 && (
            <p className="mb-1 flex items-start gap-2 rounded-control bg-wait-soft px-3.5 py-2.5 text-[13px] font-medium text-[#9A6400]">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-wait" />
              <span className="break-keep">활동내용이 50자(150B)를 넘는 확인서 {overN}건 · 확인 전에 줄이면 나이스에 그대로 넣을 수 있어요</span>
            </p>
          )}
          {waiting.length ? list(waiting, true) : <p className="py-4 text-center text-sm text-mute">새로 받은 확인서가 없어요</p>}
        </Card>
        <Card title="학생별 누적" action={<span className="text-[13px] text-mute">평균 {check.avg}시간</span>}>
          {mine.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">우리 반 학생이 없어요</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
              {totals.map((t) => {
                const s = byId.get(t.studentId);
                return (
                  <li key={t.studentId} className="flex items-center gap-2 rounded-inner bg-white px-3.5 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{s?.number}번 {s?.name}</span>
                    <span className={flagged.has(t.studentId) ? "text-sm font-bold tabular-nums text-bad" : "text-sm font-bold tabular-nums"}>{t.confirmed}시간</span>
                    {t.waiting > 0 && <Tag>{`대기 ${t.waiting}`}</Tag>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="확인함">
          {done.length ? list(done, false) : <p className="py-4 text-center text-sm text-mute">아직 없어요</p>}
        </Card>
      </PageBody>
    </>
  );
}
