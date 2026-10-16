import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Card, Row, StatTiles, Tag } from "@/components/ui";
import {
  addDays, cellStatus, dayLabel, deadlineOf, isPastDeadline, PLACES, seoulNow, studentDays, suggestPattern, takenSeats, weekDays, weekStart, type Period,
} from "@/lib/domain/night";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { ApplyForm } from "./apply-form";

export const metadata = { title: "야자 신청 · 속초고등학교 학생관리시스템" };

const TONE: Record<string, string> = { 출석: "bg-ok-soft text-ok", 결석: "bg-bad-soft text-bad", 조퇴: "bg-wait-soft text-wait", 예정: "bg-key-soft text-key-strong", 미확인: "bg-white text-mute" };

export default async function NightApplyPage() {
  const v = await requireCan("student.self");
  if (v.kind !== "student") return null;
  const id = v.student.id;
  const now = seoulNow();
  const today = now.date;
  const thisWeek = weekDays(today);
  const next = weekDays(addDays(weekStart(today), 7));
  const termStart = `${today.slice(0, 4)}-03-01`;
  const [mineAll, attAll, nextAll, requests, notices] = await Promise.all([
    repo.listNightSignups(termStart, next[4], [id]),
    repo.listNightAttendance(termStart, today, [id]),
    repo.listNightSignups(next[0], next[4]),
    repo.listNightRequests([id], "대기"),
    repo.listNightNotices(id),
  ]);
  const week = studentDays(id, thisWeek, mineAll, attAll);
  const total = new Set(attAll.filter((a) => a.status === "출석").map((a) => a.date)).size;
  const mineNext = mineAll.filter((s) => next.includes(s.date) && s.status === "신청");
  const past = isPastDeadline(now, next[0]);
  const deadline = deadlineOf(next[0]);
  const history = mineAll.filter((s) => s.date >= addDays(weekStart(today), -28) && s.date <= today);
  const pattern = suggestPattern(id, history, attAll);

  // 잔여석 계산용: 날짜·교시·장소별 다른 학생 신청 수 (다른 학생 정보는 보내지 않는다)
  const taken: Record<string, number> = {};
  for (const d of next) for (const p of [1, 2] as Period[]) for (const pl of PLACES) taken[`${d}|${p}|${pl.id}`] = takenSeats(nextAll, d, p, pl.id, id);

  const thisWeekRows = thisWeek
    .map((d) => {
      const su = mineAll.find((s) => s.date === d && s.status === "신청");
      if (!su) return null;
      const st = ([1, 2] as Period[])
        .map((p) => cellStatus(su, attAll.find((a) => a.date === d && a.period === p), p))
        .filter((x) => x !== "미신청");
      const label = d > today ? "예정" : st.includes("결석") ? "결석" : st.includes("조퇴") ? "조퇴" : st.every((x) => x === "출석") ? "출석" : "미확인";
      return { d, label };
    })
    .filter((x): x is { d: string; label: string } => !!x);

  const nextLabel = mineNext.length ? `${mineNext.length}일 신청` : requests.length ? "승인 대기" : "미신청";

  return (
    <>
      <PageHeader title="야자 신청" />
      <PageBody>
        <p className="-mt-2 text-[13px] text-mute md:hidden">다음 주 · {dayLabel(deadline.date)} 마감</p>
        <StatTiles items={[["이번 주", `${week.signed}일`], ["출석", `${week.attended} / ${week.signed}`], ["누적", `${total}일`], ["다음 주", nextLabel]]} />
        <ApplyForm
            days={next}
            taken={taken}
            current={mineNext.length ? { dates: mineNext.map((s) => s.date), session: mineNext[0].session, place: mineNext[0].place } : null}
            pattern={pattern ? { weekdays: pattern.weekdays, session: pattern.session, place: pattern.place, text: pattern.text } : null}
            past={past}
            deadline={`${dayLabel(deadline.date)} ${deadline.time}`}
            ai={aiEnabled()}
            side={
              <>
                <Card title="이번 주 출석">
                  {thisWeekRows.length === 0 ? (
                    <p className="py-4 text-center text-sm text-mute">이번 주 신청이 없어요</p>
                  ) : (
                    thisWeekRows.map((r, i) => <Row key={r.d} last={i === thisWeekRows.length - 1} title={dayLabel(r.d)} right={<Tag tone={TONE[r.label]}>{r.label}</Tag>} />)
                  )}
                </Card>
                {requests.length > 0 && (
                  <Card title="승인 대기">
                    {requests.map((r, i) => (
                      <Row key={r.id} last={i === requests.length - 1} title={r.dates.map(dayLabel).join(" · ")} meta={r.note} right={<Tag>대기</Tag>} />
                    ))}
                  </Card>
                )}
                {notices.length > 0 && (
                  <Card title="담임 선생님 메시지">
                    <div className="flex flex-col gap-2">
                      {notices.slice(0, 3).map((n) => (
                        <div key={n.id} className="rounded-inner bg-white px-3.5 py-3">
                          <p className="text-sm">{n.body}</p>
                          <p className="mt-1 text-xs text-mute">{new Date(n.createdAt).toLocaleDateString("ko-KR")}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            }
          />
      </PageBody>
    </>
  );
}
