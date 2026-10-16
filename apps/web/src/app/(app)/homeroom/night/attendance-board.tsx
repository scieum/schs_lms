"use client";
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button, Card, cx, Tag } from "@/components/ui";
import { nextAttend, PERIODS, type CellStatus, type Period } from "@/lib/domain/night";
import { closeDay, markAttendance } from "./actions";

type Cell = { id: string; name: string; number: number; status: CellStatus };

const TONE: Record<CellStatus, string> = {
  출석: "bg-ok-soft text-ok",
  결석: "bg-navy text-white",
  조퇴: "bg-navy text-white",
  미신청: "bg-wait-soft text-wait",
  미확인: "bg-soft text-mute",
};

/** 출석 체크: 칸을 누를 때마다 출석 → 결석 → 조퇴. 바로 저장한다 */
export function AttendanceBoard({ classKey, period, todayLabel, cells, closedAt, weekend, unchecked }: {
  classKey: string; period: Period; todayLabel: string; cells: Cell[]; closedAt: string | null; weekend: boolean; unchecked: number;
}) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [shown, apply] = useOptimistic(cells, (cur: Cell[], change: { ids: string[]; status: CellStatus }) =>
    cur.map((c) => (change.ids.includes(c.id) ? { ...c, status: change.status } : c)),
  );
  const locked = !!closedAt;

  function set(ids: string[], status: "출석" | "결석" | "조퇴") {
    setError("");
    start(async () => {
      apply({ ids, status });
      const r = await markAttendance(classKey, period, ids.map((studentId) => ({ studentId, status })));
      if (!r.ok) setError(r.error);
    });
  }
  const signed = shown.filter((c) => c.status !== "미신청");

  return (
    <Card
      title="출석 체크"
      action={
        !locked && signed.length > 0 ? (
          <Button size="sm" kind="ghost" disabled={pending} onClick={() => set(signed.map((c) => c.id), "출석")}>모두 출석</Button>
        ) : undefined
      }
    >
      <nav className="mb-4 flex gap-1 rounded-control bg-white p-1" aria-label="교시">
        {([1, 2] as Period[]).map((p) => (
          <Link
            key={p}
            href={`/homeroom/night?class=${classKey}&p=${p}`}
            aria-current={p === period ? "page" : undefined}
            className={cx("flex-1 rounded-chip py-2 text-center text-sm", p === period ? "bg-key font-bold text-white" : "text-mute hover:text-sub")}
          >
            {PERIODS[p].label} {PERIODS[p].start}
          </Link>
        ))}
      </nav>

      {weekend ? (
        <p className="py-8 text-center text-sm text-mute">주말에는 야간 자율학습이 없어요</p>
      ) : (
        <>
          {/* PC: 칸 그리드 */}
          <div className="hidden grid-cols-4 gap-2.5 md:grid lg:grid-cols-6">
            {shown.map((c) => {
              const off = c.status === "미신청";
              const bad = c.status === "결석" || c.status === "조퇴";
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={off || locked || pending}
                  onClick={() => set([c.id], nextAttend(c.status === "미확인" ? null : (c.status as "출석" | "결석" | "조퇴")))}
                  aria-label={`${c.name} ${c.status}`}
                  className={cx(
                    "flex flex-col items-start gap-1 rounded-inner px-3.5 py-3 text-left",
                    off ? "border border-hair bg-white text-faint" : bad ? "bg-key text-white" : "bg-white",
                    !off && !locked && "hover:ring-2 hover:ring-key-soft",
                  )}
                >
                  <span className="font-bold">{c.name}</span>
                  <span className={cx("text-xs", bad ? "text-white/80" : off ? "text-faint" : c.status === "미확인" ? "text-mute" : "text-mute")}>{c.status}</span>
                </button>
              );
            })}
          </div>
          {/* 모바일: 목록 */}
          <div className="flex flex-col md:hidden">
            {shown.map((c, i) => {
              const off = c.status === "미신청";
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={off || locked || pending}
                  onClick={() => set([c.id], nextAttend(c.status === "미확인" ? null : (c.status as "출석" | "결석" | "조퇴")))}
                  className={cx("flex items-center gap-3 py-3 text-left", i < shown.length - 1 && "border-b border-line")}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-sub">{c.name.slice(0, 1)}</span>
                  <span className="flex-1 font-medium">{c.name}</span>
                  <Tag tone={TONE[c.status]}>{c.status}</Tag>
                </button>
              );
            })}
          </div>
        </>
      )}

      {error && <p className="mt-3 text-sm text-bad" role="alert">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <p className="flex-1 text-[13px] text-mute">
          {locked ? `${todayLabel} 출석을 마감했어요` : unchecked > 0 ? `${todayLabel} · 아직 확인 안 한 학생 ${unchecked}명` : `${todayLabel} · 칸을 누르면 출석 → 결석 → 조퇴`}
        </p>
        {!locked && !weekend && (
          <form action={closeDay}>
            <input type="hidden" name="class" value={classKey} />
            <Button size="sm" disabled={pending}><Check size={14} /> 출석 마감하기</Button>
          </form>
        )}
      </div>
    </Card>
  );
}
