"use client";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { AiBanner, Button, Card, StatTiles, Tag, cx } from "@/components/ui";
import { seatLabel, seats, type Offering } from "@/lib/domain/offering";
import { applyCourses, checkMyCombo, recommendCourses, type ApplyState, type ComboResult, type Recommend } from "./actions";

type Props = {
  semester: number;
  deadline: string;
  closed: boolean;
  maxCredits: number;
  offerings: Offering[];
  counts: Record<string, number>;
  mine: string[];
  careerGoal: string | null;
};

// Figma S7 (74:303 / 74:471): 숫자 타일 → 진로 맞춤 과목 → 분야 필터 → 개설 과목(담기) + 내 신청 요약
export function CoursePicker({ semester, deadline, closed, maxCredits, offerings, counts, mine, careerGoal }: Props) {
  const [cart, setCart] = useState<string[]>(mine);
  const [field, setField] = useState("전체");
  const [rec, setRec] = useState<Recommend | null>(null);
  const [recPending, startRec] = useTransition();
  const [combo, setCombo] = useState<{ key: string; r: ComboResult } | null>(null);
  const [comboPending, startCombo] = useTransition();
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyCourses, {});

  const fields = useMemo(() => ["전체", ...new Set(offerings.map((o) => o.field))], [offerings]);
  const mineSet = useMemo(() => new Set(mine), [mine]);
  /** 나를 뺀 다른 학생 신청 수 */
  const others = (o: Offering) => (counts[o.id] ?? 0) - (mineSet.has(o.id) ? 1 : 0);
  const leftOf = (o: Offering) => seats(o) - others(o) - (cart.includes(o.id) ? 1 : 0);
  const canAdd = (o: Offering) => mineSet.has(o.id) || others(o) < seats(o);

  const picked = offerings.filter((o) => cart.includes(o.id));
  const credits = picked.reduce((n, o) => n + o.credits, 0);
  const over = credits > maxCredits;
  const low = offerings.filter((o) => { const l = leftOf(o); return l > 0 && l <= 3; }).length;
  const changed = cart.length !== mine.length || cart.some((id) => !mineSet.has(id));
  const shown = field === "전체" ? offerings : offerings.filter((o) => o.field === field);

  const toggle = (o: Offering) => {
    if (closed) return;
    setCart((c) => (c.includes(o.id) ? c.filter((x) => x !== o.id) : canAdd(o) ? [...c, o.id] : c));
  };
  const askRec = () => startRec(async () => setRec(await recommendCourses()));
  const addRec = () => {
    if (!rec?.ok) return;
    setCart((c) => [...c, ...rec.ids.filter((id) => !c.includes(id) && offerings.some((o) => o.id === id && canAdd(o)))]);
  };
  const cartKey = [...cart].sort().join(",");
  const comboNow = combo && combo.key === cartKey ? combo.r : null;
  const askCombo = () => startCombo(async () => setCombo({ key: cartKey, r: await checkMyCombo(cart) }));
  const recNames = rec?.ok ? rec.ids.map((id) => offerings.find((o) => o.id === id)?.subject).filter(Boolean).join("·") : "";

  const submit = (
    <Button disabled={pending || closed || over} className="w-full">
      {closed ? "마감됐어요" : pending ? "신청하는 중…" : changed ? `${cart.length}과목 신청하기` : "신청하기"}
    </Button>
  );

  return (
    <form action={action} className="flex flex-col gap-4 md:gap-6">
      {cart.map((id) => <input key={id} type="hidden" name="id" value={id} />)}
      <StatTiles
        items={[
          ["신청 학점", `${credits} / ${maxCredits}`],
          ["담은 과목", `${cart.length}개`],
          [closed ? "마감됨" : "마감", deadline],
          ["잔여 적음", `${low}과목`],
        ]}
      />

      <AiBanner
        label={rec?.ok ? rec.label : "AI"}
        title="진로 맞춤 과목"
        line={
          rec
            ? rec.ok ? `${recNames} — ${rec.reason}` : rec.error
            : careerGoal ? `${careerGoal} 희망 — 먼저 볼 과목을 골라 드려요` : "희망 진로가 있으면 과목을 골라 드려요"
        }
        action={
          rec?.ok && !closed ? (
            <Button type="button" kind="outline" size="sm" onClick={addRec}>확인 후 담기</Button>
          ) : (
            <Button type="button" size="sm" kind="outline" disabled={recPending || !careerGoal} onClick={askRec}>
              {recPending ? "고르는 중…" : rec ? "다시 추천" : "추천 받기"}
            </Button>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="분야">
            {fields.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={field === f}
                onClick={() => setField(f)}
                className={cx("shrink-0 rounded-control px-3.5 py-2 text-[13px]", field === f ? "bg-key font-bold text-white" : "text-sub hover:bg-soft")}
              >
                {f}
              </button>
            ))}
          </div>
          <Card title={`${semester}학기 개설 과목`} className="flex-1">
            {shown.length === 0 ? (
              <p className="py-4 text-center text-sm text-mute">이 분야에 열린 과목이 없어요</p>
            ) : (
              shown.map((o, i) => {
                const on = cart.includes(o.id);
                const seat = seatLabel(leftOf(o) + (on ? 1 : 0));
                const disabled = closed || (!on && !canAdd(o));
                return (
                  <label
                    key={o.id}
                    className={cx("flex items-center gap-3 py-3", i < shown.length - 1 && "border-b border-line", disabled ? "cursor-not-allowed" : "cursor-pointer")}
                  >
                    <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(o)} className="peer sr-only" />
                    <span
                      aria-hidden
                      className={cx(
                        "flex size-6 shrink-0 items-center justify-center rounded-[6px] peer-focus-visible:ring-2 peer-focus-visible:ring-key",
                        on ? "bg-key text-white" : "border border-hair bg-white",
                        disabled && !on && "opacity-50",
                      )}
                    >
                      {on && <Check size={16} strokeWidth={3} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={cx("truncate text-[15px] font-medium", disabled && !on && "text-mute")}>{o.subject}</div>
                      <div className="truncate text-[13px] text-mute">{o.field} · {o.credits}학점</div>
                    </div>
                    <Tag tone={seat.low ? "bg-due-soft text-due" : "bg-white text-sub"}>{seat.text}</Tag>
                  </label>
                );
              })
            )}
          </Card>
        </div>

        <Card title="내 신청">
          {picked.length === 0 ? (
            <p className="py-2 text-sm text-mute">아직 담은 과목이 없어요</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {picked.map((o) => (
                <li key={o.id} className="flex items-center justify-between text-sm">
                  <span className="text-sub">{o.subject}</span>
                  <span className="font-bold">{o.credits}학점</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-key-soft">
            <div className={cx("h-full rounded-full", over ? "bg-bad" : "bg-key")} style={{ width: `${Math.min(100, (credits / maxCredits) * 100)}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-sub">합계</span>
            <span className={cx("font-bold", over && "text-bad")}>{credits} / {maxCredits}학점</span>
          </div>
          {over && <p className="mt-2 text-[13px] text-bad">최대 {maxCredits}학점까지 담을 수 있어요</p>}
          {picked.length > 0 && (
            <div className="mt-4 rounded-inner bg-white px-3.5 py-3">
              <div className="flex items-center gap-2">
                <Tag tone={(comboNow?.ok ? comboNow.label : "AI") === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong"}>{comboNow?.ok ? comboNow.label : "AI"}</Tag>
                <span className="flex-1 text-[13px] font-bold">조합 점검</span>
                <Button type="button" kind="outline" size="sm" disabled={comboPending} onClick={askCombo}>{comboPending ? "보는 중…" : comboNow ? "다시 점검" : "점검하기"}</Button>
              </div>
              {comboPending && <p className="mt-2 text-[12px] text-mute">읽는 중이에요</p>}
              {comboNow && !comboPending && (comboNow.ok ? (
                <ul className="mt-2 flex flex-col gap-1 text-[13px]">
                  {comboNow.notes.map((n) => <li key={n.text} className={n.tone === "warn" ? "text-due" : "text-sub"}>· {n.text}</li>)}
                  {comboNow.note && <li className="text-[12px] text-mute">{comboNow.note}</li>}
                </ul>
              ) : <p className="mt-2 text-[13px] text-bad">{comboNow.error}</p>)}
              {!comboNow && !comboPending && <p className="mt-1.5 text-[12px] text-mute">진로 연계·학점·분야 쏠림을 봐요</p>}
            </div>
          )}
          {state.error && <p className="mt-3 text-sm text-bad" role="alert">{state.error}</p>}
          {state.done && !changed && <p className="mt-3 text-sm text-ok" role="status">{state.done}</p>}
          <div className="mt-4 hidden md:block">{submit}</div>
        </Card>
      </div>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+76px)] z-10 -mx-4 flex flex-col gap-2 border-t border-line bg-white px-4 pb-3 pt-3 md:hidden">
        <span className={cx("text-[13px]", over ? "text-bad" : "text-sub")}>{credits} / {maxCredits}학점</span>
        {submit}
      </div>
    </form>
  );
}
