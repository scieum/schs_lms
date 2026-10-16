"use client";
import { useActionState, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { KV } from "@/components/scores/parts";
import { AiBanner, Button, Card, cx } from "@/components/ui";
import { DAY_LABEL, mdLabel, PLACES, placeSeats, SESSION_LABEL, sessionPeriods, sessionTime, SESSIONS, weekday, type Place, type Session } from "@/lib/domain/night";
import { applyNight, suggestNight, type ApplyState } from "./actions";

type Props = {
  days: string[];
  taken: Record<string, number>;
  current: { dates: string[]; session: Session; place: Place } | null;
  pattern: { weekdays: number[]; session: Session; place: Place; text: string } | null;
  past: boolean;
  deadline: string;
  ai: boolean;
  side: ReactNode;
};

export function ApplyForm({ days, taken, current, pattern, past, deadline, ai, side }: Props) {
  const [dates, setDates] = useState<string[]>(current?.dates ?? []);
  const [session, setSession] = useState<Session>(current?.session ?? "both");
  const [place, setPlace] = useState<Place>(current?.place ?? "자습실 A");
  const [note, setNote] = useState("");
  const [hint, setHint] = useState<{ text: string; source: "AI" | "자동"; fill: () => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyNight, {});

  const remaining = (s: Session) => {
    const cap = placeSeats(place);
    if (!dates.length) return cap;
    let min = cap;
    for (const d of dates) for (const p of sessionPeriods(s)) min = Math.min(min, cap - (taken[`${d}|${p}|${place}`] ?? 0));
    return Math.max(0, min);
  };
  const fillWith = (w: number[], s: Session, pl: Place) => {
    setDates(days.filter((d) => w.includes(weekday(d))));
    setSession(s);
    setPlace(pl);
  };

  async function askHelper() {
    setBusy(true);
    const r = await suggestNight();
    setBusy(false);
    if (!r.ok) return setHint({ text: r.error, source: "자동", fill: () => {} });
    setHint({ text: r.text, source: r.source, fill: () => fillWith(r.weekdays, r.session, r.place) });
  }

  const sorted = [...dates].sort();
  const chosenDays = sorted.map((d) => DAY_LABEL[weekday(d)]).join(" · ") || "–";
  const full = remaining(session) <= 0;
  const label = past ? `승인 요청 (${dates.length}일)` : current ? `${dates.length}일로 바꾸기` : `${dates.length}일 신청하기`;
  const ok = state.done === "saved" ? `${state.days}일 신청했어요` : state.done === "requested" ? "담임 선생님께 승인 요청을 보냈어요" : "";

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <AiBanner
        title="신청 도우미"
        label={hint?.source === "자동" || (!hint && !ai) ? "자동" : "AI"}
        line={hint?.text ?? pattern?.text ?? "지난 기록이 쌓이면 요일·시간을 미리 채워 줘요"}
        action={
          hint ? (
            <Button size="sm" onClick={hint.fill}>이대로 채우기</Button>
          ) : pattern ? (
            ai ? (
              <Button size="sm" onClick={askHelper} disabled={busy}>{busy ? "살펴보는 중…" : "추천 받기"}</Button>
            ) : (
              <Button size="sm" onClick={() => fillWith(pattern.weekdays, pattern.session, pattern.place)}>이대로 채우기</Button>
            )
          ) : undefined
        }
      />
      <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          <Card title="요일 선택">
            <div className="grid grid-cols-5 gap-2">
              {days.map((d) => {
                const on = dates.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDates((xs) => (on ? xs.filter((x) => x !== d) : [...xs, d]))}
                    className={cx("flex flex-col items-center gap-1 rounded-inner py-3 md:py-4", on ? "bg-key text-white" : "bg-white")}
                  >
                    <span className="text-[15px] font-bold md:text-lg">{DAY_LABEL[weekday(d)]}</span>
                    <span className={cx("text-xs", on ? "text-white/80" : "text-mute")}>{mdLabel(d)}</span>
                  </button>
                );
              })}
            </div>
          </Card>
          <Card title="시간 선택">
            <div className="flex flex-col gap-2">
              {SESSIONS.map((s) => {
                const on = s === session;
                const left = remaining(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSession(s)}
                    className={cx("flex items-center gap-3 rounded-inner px-4 py-3.5 text-left", on ? "bg-key text-white" : "bg-white")}
                  >
                    <span className="flex-1">
                      <span className="block font-bold">{SESSION_LABEL[s]}</span>
                      <span className={cx("text-[13px]", on ? "text-white/80" : "text-mute")}>{sessionTime(s)}</span>
                    </span>
                    <span className={cx("text-[13px]", on ? "font-bold" : left === 0 ? "text-bad" : "text-sub")}>잔여 {left}석</span>
                    {on && <Check size={16} />}
                  </button>
                );
              })}
            </div>
          </Card>
          <Card title="장소">
            <div className="flex gap-1 rounded-control bg-white p-1" role="radiogroup">
              {PLACES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={place === p.id}
                  onClick={() => setPlace(p.id)}
                  className={cx("flex-1 rounded-chip py-2.5 text-sm", place === p.id ? "bg-key font-bold text-white" : "text-mute hover:text-sub")}
                >
                  {p.id}
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4 md:gap-6">
          <Card title="신청 요약">
            <dl>
              <KV k="요일" v={chosenDays} strong />
              <KV k="시간" v={sessionTime(session)} strong />
              <KV k="장소" v={place} strong />
              <KV k="마감" v={deadline} strong />
            </dl>
            <form action={action} className="mt-4 flex flex-col gap-2">
              <input type="hidden" name="dates" value={JSON.stringify(sorted)} />
              <input type="hidden" name="session" value={session} />
              <input type="hidden" name="place" value={place} />
              {past && (
                <>
                  <p className="text-[13px] text-due">마감이 지났어요. 사유를 쓰면 담임 선생님이 승인해요</p>
                  <input
                    name="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={100}
                    placeholder="예: 학원 일정이 바뀌었어요"
                    className="rounded-field bg-white px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-key"
                  />
                </>
              )}
              <Button disabled={pending || !dates.length || full || (past && note.trim().length < 2)} className="w-full">
                <Check size={16} /> {pending ? "보내는 중…" : full ? "남은 자리가 없어요" : label}
              </Button>
              {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
              {ok && <p className="text-sm text-ok" role="status">{ok}</p>}
            </form>
          </Card>
          {side}
        </div>
      </div>
    </div>
  );
}
