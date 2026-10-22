import { Plus } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card, Segmented, cx } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { isAdmin } from "@/lib/domain/policy";
import { isProgramOwner } from "@/lib/domain/program";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { programSummaries } from "./_lib/data";
import { ScheduleCalendar } from "./calendar";
import { cardOrder, cardView, ProgramCard } from "./program-card";
import { ScheduleList, type ScheduleItem } from "./schedule";

export const metadata = { title: "프로그램 · 속초고 쌤기부" };

const VIEWS = [["mine", "내 프로그램"], ["all", "전체 목록"], ["calendar", "캘린더"]] as const;

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<{ all?: string; view?: string; month?: string }> }) {
  const v = await requireCan("program.manage");
  const sp = await searchParams;
  const view = VIEWS.find(([k]) => k === sp.view)?.[0] ?? "mine";
  const tabs = <Segmented items={VIEWS.map(([k, label]) => ({ label, href: k === "mine" ? "/teacher/programs" : `/teacher/programs?view=${k}` }))} active={VIEWS.findIndex(([k]) => k === view)} />;
  if (view !== "mine") {
    // 전체 일정: 담당이 아니어도 본다. 남의 임시 저장본은 빼고, 학생 정보는 넣지 않는다
    const [all, teachers, studentList] = await Promise.all([repo.listPrograms(), repo.listTeachers(), repo.listStudents()]);
    const names = new Map(teachers.map((x) => [x.id, x.name]));
    const deptOf = new Map(teachers.map((x) => [x.id, x.dept]));
    const stu = new Map(studentList.map((x) => [x.id, { no: x.studentNo, name: x.name }]));
    const items: ScheduleItem[] = all
      .filter((p) => p.status !== "draft" || isProgramOwner(p, v.accountId))
      .map((p) => {
        const ids = [p.ownerId, ...p.coOwnerIds];
        const owners = ids.map((id) => names.get(id)).filter((x): x is string => !!x);
        const depts = [...new Set(ids.map((id) => deptOf.get(id)).filter((x): x is string => !!x))].join(", ");
        return {
          id: p.id, title: p.title, area: p.area, subject: p.subject, startDate: p.startDate, endDate: p.endDate, status: p.status, targetIds: p.targetIds,
          owners: owners.length > 2 ? `${owners.slice(0, 2).join("·")} 외 ${owners.length - 2}명` : owners.join("·") || "담당 미정",
          ownerNames: owners, depts,
          students: p.targetIds.flatMap((id) => stu.get(id) ?? []).sort((a, b) => a.no.localeCompare(b.no)),
          mine: isProgramOwner(p, v.accountId) || isAdmin(v),
        };
      });
    const t = today();
    const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : t.slice(0, 7);
    return (
      <>
        <PageHeader title="프로그램" actions={<ButtonLink href="/teacher/programs/new" size="sm"><Plus size={14} /> 새 프로그램</ButtonLink>} />
        <PageBody>
          {/* 탭 크기는 내 프로그램 화면과 같게 (PC 에서 늘어나지 않게) */}
          <div className="flex flex-col md:flex-row md:items-center">{tabs}</div>
          {view === "all" ? <ScheduleList items={items} today={t} /> : <ScheduleCalendar items={items} month={month} today={t} />}
        </PageBody>
      </>
    );
  }
  const showAll = sp.all === "1" && isAdmin(v);
  const programs = await repo.listPrograms(showAll ? undefined : { ownerId: v.accountId });
  const summary = await programSummaries(programs);
  const t = today();
  const open = summary.filter((s) => s.status === "open");
  const avg = open.length ? Math.round(open.reduce((n, s) => n + s.rate, 0) / open.length) : 0;
  const failed = summary.reduce((n, s) => n + s.failed, 0);
  const cards = summary
    .map((s) => ({ p: s.p, view: cardView(s.p, s.counts, t) }))
    .map((x) => ({ ...x, key: cardOrder(x.view, x.p, t) }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1]);

  return (
    <>
      <PageHeader
        title="프로그램"
        actions={
          <>
            {isAdmin(v) && <ButtonLink href={showAll ? "/teacher/programs" : "/teacher/programs?all=1"} kind="outline" size="sm" className="whitespace-nowrap">{showAll ? "내 것만" : "전체 보기"}</ButtonLink>}
            <ButtonLink href="/teacher/programs/new" size="sm" className="whitespace-nowrap"><Plus size={14} /> 새 프로그램</ButtonLink>
          </>
        }
      />
      <PageBody>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
          {tabs}
          <SummaryLine items={[["진행", open.length], ["제출률", `${avg}%`], ["검토", summary.reduce((n, s) => n + s.review, 0)], ["실패", failed]]} bad={failed > 0 ? 3 : -1} />
        </div>
        {programs.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">아직 프로그램이 없어요</p>
              <ButtonLink href="/teacher/programs/new" kind="outline">새 프로그램 만들기</ButtonLink>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 md:gap-5">
            {cards.map((x) => <ProgramCard key={x.p.id} p={x.p} view={x.view} today={t} />)}
          </div>
        )}
      </PageBody>
    </>
  );
}

/** 숫자 타일 4개 대신 요약 한 줄 (Figma N16): 높이 48 · 칸 사이 세로선 · 이름 13 + 숫자 15 굵게 */
function SummaryLine({ items, bad }: { items: [string, string | number][]; bad: number }) {
  return (
    <dl className="flex h-12 shrink-0 items-center rounded-[10px] border border-line bg-white px-1 md:px-2">
      {items.map(([k, val], i) => (
        <div key={k} className="flex min-w-0 flex-auto items-center md:flex-none">
          {i > 0 && <span className="h-4 w-px shrink-0 bg-line" aria-hidden />}
          <div className="flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap px-1.5 md:gap-1.5 md:px-4">
            <dt className="text-[13px] font-medium text-mute">{k}</dt>
            <dd className={cx("text-[15px] font-bold tabular-nums", i === bad ? "text-bad" : "text-ink")}>{val}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
