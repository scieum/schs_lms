"use client";
import { useActionState, useState } from "react";
import { X } from "lucide-react";
import { Button, cx, Field } from "@/components/ui";
import { AREA_LABEL, AREAS, describeRule, INQUIRY_LABEL, ruleProblems, type Area, type InquiryMode } from "@/lib/domain/scores";
import { addRule, type RuleState } from "./actions";

/** "기준 추가 +" → 펼쳐지는 입력. 고르는 대로 "국·수·영·탐 중 2개 합 5" 처럼 미리 보여 준다 */
export function RuleForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<RuleState, FormData>(async (prev, fd) => {
    const r = await addRule(prev, fd);
    if (r.ok) setOpen(false);
    return r;
  }, {});
  const [pool, setPool] = useState<Area[]>([...AREAS]);
  const [required, setRequired] = useState<Area[]>([]);
  const [pick, setPick] = useState(2);
  const [maxSum, setMaxSum] = useState(5);
  const [history, setHistory] = useState("");
  const [inquiry, setInquiry] = useState<InquiryMode>("best");

  const rule = { pool, pick, maxSum, required: required.filter((a) => pool.includes(a)), historyMax: history ? Number(history) : null, inquiry };
  const problems = ruleProblems(rule);
  const d = describeRule(rule);
  const toggle = (xs: Area[], a: Area) => (xs.includes(a) ? xs.filter((x) => x !== a) : AREAS.filter((x) => x === a || xs.includes(x)));

  if (!open) {
    return <Button size="sm" kind="ghost" onClick={() => setOpen(true)}>기준 추가 +</Button>;
  }
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 md:items-center" role="dialog" aria-modal aria-label="기준 추가">
      <form action={action} className="flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-card bg-white p-5 md:max-w-lg md:rounded-card md:p-6">
        <div className="flex items-center">
          <h3 className="flex-1 text-lg font-bold">기준 추가</h3>
          <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="text-mute"><X size={20} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field name="university" label="대학" placeholder="A대" required className="[&_input]:bg-soft" />
          <Field name="major" label="학과·전형" placeholder="산업디자인" required className="[&_input]:bg-soft" />
        </div>
        <Chips label="반영 영역" value={pool} onToggle={(a) => setPool((x) => toggle(x, a))} name="pool" />
        <div className="grid grid-cols-2 gap-3">
          <Num label="몇 개" name="pick" value={pick} onChange={setPick} min={1} max={4} />
          <Num label="등급 합 이내" name="maxSum" value={maxSum} onChange={setMaxSum} min={1} max={36} />
        </div>
        <Chips label="꼭 넣을 영역 (선택)" value={required} onToggle={(a) => setRequired((x) => toggle(x, a))} name="required" options={pool} />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-sub">한국사</span>
            <select name="historyMax" value={history} onChange={(e) => setHistory(e.target.value)} className="rounded-field bg-soft px-3 py-3 text-[15px]">
              <option value="">기준 없음</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}등급 이내</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-sub">탐구</span>
            <select name="inquiry" value={inquiry} onChange={(e) => setInquiry(e.target.value as InquiryMode)} className="rounded-field bg-soft px-3 py-3 text-[15px]">
              {(Object.keys(INQUIRY_LABEL) as InquiryMode[]).map((k) => <option key={k} value={k}>{INQUIRY_LABEL[k]}</option>)}
            </select>
          </label>
        </div>
        <Field name="note" label="메모 (선택)" placeholder="예: 과탐 2과목 평균" className="[&_input]:bg-soft" />
        <div className="rounded-inner bg-key-soft px-4 py-3">
          <div className="text-[15px] font-bold text-key-strong">{problems.length ? problems[0] : d.main}</div>
          {!problems.length && d.extra && <div className="text-[13px] text-sub">{d.extra}</div>}
        </div>
        {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
        <Button disabled={pending || problems.length > 0}>{pending ? "저장하는 중…" : "기준 저장"}</Button>
      </form>
    </div>
  );
}

function Chips({ label, value, onToggle, name, options = AREAS }: { label: string; value: Area[]; onToggle: (a: Area) => void; name: string; options?: Area[] }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-medium text-sub">{label}</legend>
      <div className="flex gap-2">
        {options.map((a) => {
          const on = value.includes(a);
          return (
            <button
              key={a}
              type="button"
              onClick={() => onToggle(a)}
              aria-pressed={on}
              className={cx("flex-1 rounded-control py-2.5 text-sm", on ? "bg-key font-bold text-white" : "bg-soft text-sub")}
            >
              {AREA_LABEL[a]}
            </button>
          );
        })}
      </div>
      {value.filter((a) => options.includes(a)).map((a) => <input key={a} type="hidden" name={name} value={a} />)}
    </fieldset>
  );
}

function Num({ label, name, value, onChange, min, max }: { label: string; name: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-sub">{label}</span>
      <input
        type="number"
        name={name}
        value={value}
        min={min}
        max={max}
        step={name === "maxSum" ? 0.5 : 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-field bg-soft px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-key"
      />
    </label>
  );
}
