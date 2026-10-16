"use client";
import { useActionState, useState, useTransition } from "react";
import { Target } from "lucide-react";
import { Button, Field, Tag } from "@/components/ui";
import { careerKeywordsAction, changeMyPassword, updateCareer, type CareerKeywords, type MeState } from "./actions";

/** 희망 진로 입력. assist 면 "키워드 정리"(자유 문장 → 진로 분야·키워드)를 함께 보여 준다 */
export function CareerForm({ current, onDone, assist, aiOn }: { current: string | null; onDone?: () => void; assist?: boolean; aiOn?: boolean }) {
  const [value, setValue] = useState(current ?? "");
  const [state, action, pending] = useActionState<MeState, FormData>(async (p, f) => {
    const r = await updateCareer(p, f);
    if (r.ok && !r.error) onDone?.();
    return r;
  }, {});
  const [kw, setKw] = useState<CareerKeywords | null>(null);
  const [kwPending, startKw] = useTransition();
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <input name="careerGoal" value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} placeholder={assist ? "예: 사람들이 쓰기 편한 물건을 만들고 싶어요" : "예: 산업디자인"} aria-label="희망 진로"
          className="min-w-0 flex-1 rounded-field bg-white px-4 py-2.5 text-[15px] outline-none placeholder:text-faint focus:ring-2 focus:ring-key" />
        <Button kind="outline" size="sm" disabled={pending}>{pending ? "저장 중…" : "저장"}</Button>
      </div>
      {assist && (
        <div className="rounded-inner bg-white px-3.5 py-3">
          <div className="flex items-center gap-2">
            <Tag tone={(kw?.ok ? kw.label : aiOn ? "AI" : "자동") === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong"}>{kw?.ok ? kw.label : aiOn ? "AI" : "자동"}</Tag>
            <span className="flex-1 text-[13px] font-bold">진로 키워드 정리</span>
            <Button type="button" kind="outline" size="sm" disabled={kwPending || value.trim().length < 2} onClick={() => startKw(async () => setKw(await careerKeywordsAction(value)))}>
              {kwPending ? "정리 중…" : kw?.ok ? "다시 정리" : "키워드 정리"}
            </Button>
          </div>
          {kwPending && <p className="mt-2 text-[12px] text-mute">읽는 중이에요</p>}
          {!kw && !kwPending && <p className="mt-1.5 text-[12px] text-mute">하고 싶은 일을 문장으로 쓰고 누르면 진로 분야로 정리해 줘요</p>}
          {kw && !kw.ok && !kwPending && <p className="mt-2 text-[13px] text-bad">{kw.error}</p>}
          {kw?.ok && !kwPending && (
            <div className="mt-2 flex flex-col gap-1.5 text-[13px]">
              {kw.fields.map((f) => (
                <p key={f.field}><span className="font-bold">{f.field}</span> <span className="text-sub">· {f.keywords.join(" · ")}</span></p>
              ))}
              {kw.note && <p className="text-[12px] text-mute">{kw.note}</p>}
              {kw.goal && kw.goal !== value.trim() && (
                <button type="button" onClick={() => setValue(kw.goal!)} className="self-start text-[13px] font-medium text-key hover:underline">
                  &lsquo;{kw.goal}&rsquo;(으)로 칸에 넣기
                </button>
              )}
              <p className="text-[12px] text-mute">칸에 넣은 뒤 저장해야 바뀌어요</p>
            </div>
          )}
        </div>
      )}
      {state.error && <p className="text-[13px] text-bad" role="alert">{state.error}</p>}
      {state.ok && !state.error && <p className="text-[13px] text-ok" role="status">바꿨어요. 추천도 새 진로로 바뀌어요</p>}
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<MeState, FormData>(changeMyPassword, {});
  return (
    <form action={action} key={state.ok ?? 0} className="flex flex-col gap-3">
      <Field name="current" type="password" label="지금 비밀번호" autoComplete="current-password" required />
      <Field name="password" type="password" label="새 비밀번호" autoComplete="new-password" minLength={8} required />
      <Field name="confirm" type="password" label="한 번 더" autoComplete="new-password" required />
      {state.error && <p className="text-[13px] text-bad" role="alert">{state.error}</p>}
      {state.ok && !state.error && <p className="text-[13px] text-ok" role="status">비밀번호를 바꿨어요</p>}
      <Button disabled={pending}>{pending ? "바꾸는 중…" : "비밀번호 바꾸기"}</Button>
    </form>
  );
}

/** 접었다 펴는 진로 바꾸기 (추천 화면 머리 버튼) */
export function CareerToggle({ current, label = "희망 진로 바꾸기" }: { current: string | null; label?: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="w-full max-w-sm"><CareerForm current={current} onDone={() => setOpen(false)} /></div>
  ) : (
    <Button kind="outline" size="sm" onClick={() => setOpen(true)} className="md:px-5 md:py-3 md:text-[15px]"><Target size={16} /> {label}</Button>
  );
}
