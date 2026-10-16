"use client";
import { useActionState, useState } from "react";
import { Target, X } from "lucide-react";
import { Button } from "@/components/ui";
import { saveTargets, type TargetState } from "./actions";

type Opt = { id: string; label: string; rule: string };
type T = { university: string; major: string; ruleId: string | null };

/** 목표 대학 설정 (3개까지). 기준 목록에서 고르거나 직접 쓴다 */
export function TargetEditor({ rules, initial }: { rules: Opt[]; initial: T[] }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<T[]>(initial.length ? initial : [{ university: "", major: "", ruleId: null }]);
  const [state, action, pending] = useActionState<TargetState, FormData>(async (prev, fd) => {
    const r = await saveTargets(prev, fd);
    if (r.ok) setOpen(false);
    return r;
  }, {});
  const update = (i: number, patch: Partial<T>) => setList((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <>
      <Button kind="outline" size="sm" onClick={() => setOpen(true)} className="md:px-5 md:py-3 md:text-[15px]">
        <Target size={16} /> <span className="hidden md:inline">목표 대학 설정</span><span className="md:hidden">목표</span>
      </Button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 md:items-center" role="dialog" aria-modal aria-label="목표 대학 설정">
          <form action={action} className="flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-card bg-white p-5 md:max-w-lg md:rounded-card md:p-6">
            <div className="flex items-center">
              <h3 className="flex-1 text-lg font-bold">목표 대학</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="text-mute"><X size={20} /></button>
            </div>
            {list.map((t, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-inner bg-soft p-4">
                <div className="flex items-center">
                  <span className="flex-1 text-[13px] font-bold text-sub">{i + 1}순위</span>
                  <button type="button" className="text-xs text-mute" onClick={() => setList((xs) => xs.filter((_, j) => j !== i))}>빼기</button>
                </div>
                <select
                  value={t.ruleId ?? ""}
                  onChange={(e) => {
                    const r = rules.find((x) => x.id === e.target.value);
                    const [u, ...m] = r?.label.split(" ") ?? [];
                    update(i, r ? { ruleId: r.id, university: u, major: m.join(" ") } : { ruleId: null });
                  }}
                  className="rounded-field bg-white px-3 py-3 text-[15px]"
                  aria-label="기준이 있는 대학"
                >
                  <option value="">직접 쓰기</option>
                  {rules.map((r) => <option key={r.id} value={r.id}>{r.label} · {r.rule}</option>)}
                </select>
                {!t.ruleId && (
                  <div className="grid grid-cols-2 gap-2">
                    <input value={t.university} onChange={(e) => update(i, { university: e.target.value })} placeholder="대학" maxLength={40} className="rounded-field bg-white px-3 py-3 text-[15px] outline-none focus:ring-2 focus:ring-key" />
                    <input value={t.major} onChange={(e) => update(i, { major: e.target.value })} placeholder="학과" maxLength={40} className="rounded-field bg-white px-3 py-3 text-[15px] outline-none focus:ring-2 focus:ring-key" />
                  </div>
                )}
              </div>
            ))}
            {list.length < 3 && (
              <Button type="button" kind="soft" onClick={() => setList((xs) => [...xs, { university: "", major: "", ruleId: null }])}>대학 더하기</Button>
            )}
            <p className="text-[13px] text-mute">목록에 없는 대학은 담임 선생님이 기준을 넣으면 판정돼요</p>
            <input type="hidden" name="targets" value={JSON.stringify(list)} />
            {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
            <Button disabled={pending}>{pending ? "저장하는 중…" : "저장"}</Button>
          </form>
        </div>
      )}
    </>
  );
}
