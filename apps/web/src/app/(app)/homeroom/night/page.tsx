import { redirect } from "next/navigation";
import { Check, Download } from "lucide-react";
import { BarChart, ClassPicker } from "@/components/scores/parts";
import { classScope } from "@/components/scores/scope";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Button, ButtonLink, Card } from "@/components/ui";
import {
  absencePattern, addDays, cellStatus, dailyRates, DAY_LABEL, dayLabel, mdLabel, periodSummary, seoulNow, SESSION_LABEL, weekday, weekDays, type Period,
} from "@/lib/domain/night";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { closeDay, decideRequest } from "./actions";
import { AttendanceBoard } from "./attendance-board";
import { ReviewPanel } from "./review-panel";

export const metadata = { title: "야간 자율학습 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ class?: string; p?: string }> };

export default async function NightManagePage({ searchParams }: Props) {
  const v = await requireCan("night.manage");
  const q = await searchParams;
  const scope = await classScope(v, q.class);
  if (!scope) redirect("/forbidden");
  const period: Period = q.p === "2" ? 2 : 1;
  const now = seoulNow();
  const today = now.date;
  const days = weekDays(today);
  const ids = scope.students.map((s) => s.id);
  const [signups, att, requests, closedAt] = await Promise.all([
    repo.listNightSignups(days[0], days[4], ids),
    repo.listNightAttendance(addDays(days[0], -21), days[4], ids),
    repo.listNightRequests(ids, "대기"),
    repo.getNightClosure(scope.grade, scope.classNo, today),
  ]);
  const todaySignups = signups.filter((s) => s.date === today);
  const todayAtt = att.filter((a) => a.date === today);
  const cells = scope.students.map((s) => ({
    id: s.id,
    name: s.name,
    number: s.number,
    status: cellStatus(todaySignups.find((x) => x.studentId === s.id), todayAtt.find((a) => a.studentId === s.id && a.period === period), period),
  }));
  const sum = periodSummary(cells.map((c) => c.status));
  const signedToday = todaySignups.filter((s) => s.status === "신청").length;
  const pattern = absencePattern(att, days);
  const rates = dailyRates(days, signups, att);
  const todayIdx = days.indexOf(today);
  const nameOf = new Map(scope.students.map((s) => [s.id, s.name]));
  const isWeekend = weekday(today) === 0 || weekday(today) === 6;

  const tiles: [string, string][] = [["신청", `${signedToday}명`], ["출석", `${sum.present}명`], ["결석·조퇴", `${sum.absent}명`], ["승인 대기", `${requests.length}건`]];

  return (
    <>
      <PageHeader
        title="야간 자율학습"
        actions={
          <ButtonLink href={`/homeroom/night/export?class=${scope.key}`} kind="outline" size="sm" prefetch={false}>
            <Download size={14} /> <span className="hidden md:inline">출석 엑셀</span>
          </ButtonLink>
        }
      />
      <PageBody>
        <ClassPicker classes={scope.classes} current={scope.key} path="/homeroom/night" />
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
          {tiles.map(([k, val], i) => (
            <div key={k} className="flex flex-col surface rounded-card p-4 md:px-[22px] md:py-5">
              <div className="text-[13px] text-mute">{k}</div>
              <div className="mt-1.5 text-[22px] font-bold md:text-[28px]">{val}</div>
              {i === 0 && <CloseDay classKey={scope.key} closedAt={closedAt} weekend={isWeekend} className="mt-2.5 w-fit max-md:hidden" size="sm" />}
            </div>
          ))}
        </div>
        <CloseDay classKey={scope.key} closedAt={closedAt} weekend={isWeekend} className="w-full md:hidden" />
        <ReviewPanel classKey={scope.key} line={pattern.text} ai={aiEnabled()} names={Object.fromEntries(nameOf)} />

        <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
          <AttendanceBoard
            key={`${scope.key}-${period}`}
            classKey={scope.key}
            period={period}
            todayLabel={dayLabel(today)}
            cells={cells}
            closedAt={closedAt}
            weekend={isWeekend}
            unchecked={sum.unchecked}
          />

          <div className="flex flex-col gap-4 md:gap-6">
            <Card title="승인 대기" action={<span className="text-[13px] text-sub">{requests.length}건</span>}>
              {requests.length === 0 ? (
                <p className="py-4 text-center text-sm text-mute">대기 중인 신청이 없어요</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {requests.map((r) => (
                    <div key={r.id} className="rounded-inner bg-white p-4">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 font-bold">{nameOf.get(r.studentId)}</span>
                        <span className="text-xs text-mute">{dayLabel(r.dates[0])}</span>
                      </div>
                      <p className="mt-1.5 text-[13px] text-sub">{r.note || "신청"}</p>
                      <p className="mt-0.5 text-xs text-mute">
                        {r.dates.map((d) => `${mdLabel(d)}(${DAY_LABEL[weekday(d)]})`).join(" ")} · {SESSION_LABEL[r.session]} · {r.place}
                      </p>
                      <form action={decideRequest} className="mt-3 grid grid-cols-2 gap-2">
                        <input type="hidden" name="class" value={scope.key} />
                        <input type="hidden" name="id" value={r.id} />
                        <Button kind="outline" size="sm" name="decision" value="reject">반려</Button>
                        <Button kind="outline" size="sm" name="decision" value="approve">승인</Button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="이번 주 출석률" className="flex-1">
              <BarChart
                items={rates.map((r) => ({ label: DAY_LABEL[weekday(r.date)], value: r.rate }))}
                highlight={todayIdx >= 0 ? todayIdx : 4}
                max={100}
                height={90}
                format={(n) => `${n}%`}
              />
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}

/** 출석 마감하기 (화면의 주요 버튼). 마감했거나 주말이면 상태만 보여 준다 */
function CloseDay({ classKey, closedAt, weekend, className, size }: { classKey: string; closedAt: string | null; weekend: boolean; className?: string; size?: "sm" }) {
  if (weekend) return null;
  if (closedAt) {
    return <Button size={size} kind="soft" disabled className={className}><Check size={14} /> 마감했어요</Button>;
  }
  return (
    <form action={closeDay} className={className}>
      <input type="hidden" name="class" value={classKey} />
      <Button size={size} className="w-full"><Check size={size ? 14 : 16} /> 출석 마감하기</Button>
    </form>
  );
}
