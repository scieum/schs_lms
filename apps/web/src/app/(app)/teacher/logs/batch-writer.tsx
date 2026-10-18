"use client";
// 누가기록 한꺼번에 쓰기 (Figma N28): 공통 내용(활동명·날짜·활동 내용) 한 번 + 학생마다 참여도·특징 칩
// → 규칙으로 문장을 붙인 학생별 글 미리보기 → 확인 후 학생마다 하나씩 추가. AI는 카드별 "다듬기" 버튼만(선택).
import { useMemo, useState, useTransition } from "react";
import { Calendar, Check, Pencil, Plus, X } from "lucide-react";
import { Button, Tag, cx } from "@/components/ui";
import { neisBytes } from "@/lib/domain/length";
import { makeStudentNo } from "@/lib/domain/roster";
import { applyTraits, composeTraitLog, FEATURE_TRAITS, LEVEL_TRAITS, makeCustomTrait, type StudentTraits, type Trait } from "@/lib/domain/trait-logs";
import { cleanActivity } from "@/lib/domain/activity-name";
import { addLogsEach, polishTraitLog, type PolishResult } from "./actions";

type S = { id: string; name: string; grade: number; classNo: number; number: number };
type Preview = { base: string; text: string; included: boolean };

function Checkbox({ on, onClick, label, dim }: { on: boolean; onClick: () => void; label: string; dim?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={onClick}
      className={cx("flex size-[18px] shrink-0 items-center justify-center rounded-[4px]", on ? "bg-key text-white" : "border-[1.5px] border-faint bg-[#fff]", dim && "opacity-60")}>
      {on && <Check size={12} strokeWidth={3} />}
    </button>
  );
}

function TraitChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex h-[26px] shrink-0 items-center gap-0.5 whitespace-nowrap rounded-chip bg-key-soft pl-2 pr-1.5 text-xs font-medium text-key-strong">
      {label}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`${label} 빼기`} className="flex size-4 items-center justify-center">
          <X size={12} />
        </button>
      )}
    </span>
  );
}

const fieldCls = "w-full rounded-field bg-soft px-3 text-[15px] outline-none focus:ring-2 focus:ring-key md:text-[14px]";

export function BatchWriter({ area, clubId, today, students, onAdded }: { area: string; clubId?: string; today: string; students: S[]; onAdded: (n: number) => void }) {
  const [activity, setActivity] = useState("");
  const [date, setDate] = useState(today);
  const [shared, setShared] = useState("");
  const [custom, setCustom] = useState<Trait[]>([]);
  const [traits, setTraits] = useState<Record<string, StudentTraits>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bar, setBar] = useState<{ level?: string; features: string[] }>({ features: [] });
  const [lastChip, setLastChip] = useState<string>("leader");
  const [hint, setHint] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ label: string; sentence: string } | null>(null);
  const [step, setStep] = useState<"pick" | "preview">("pick");
  const [order, setOrder] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, Preview>>({});
  const [polish, setPolish] = useState<Record<string, PolishResult | "busy">>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [, startPolish] = useTransition();

  const palette = useMemo(() => [...LEVEL_TRAITS, ...FEATURE_TRAITS, ...custom], [custom]);
  const byId = useMemo(() => new Map(palette.map((t) => [t.id, t])), [palette]);
  const features = palette.filter((t) => t.group === "특징");
  const sel = students.filter((s) => checked.has(s.id));
  const allChecked = students.length > 0 && sel.length === students.length;
  const traitCount = students.reduce((n, s) => n + (traits[s.id]?.level ? 1 : 0) + (traits[s.id]?.features.length ?? 0), 0);
  const name = cleanActivity(activity);
  const ready = !!name && shared.trim().length >= 2 && students.length > 0;
  const example = byId.get(lastChip) ?? byId.get("leader")!;

  const toggleCheck = (id: string) => setChecked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickChip = (t: Trait) => {
    setLastChip(t.id);
    if (!sel.length) { setHint("표에서 학생을 먼저 체크해 주세요"); return; }
    setHint(null);
    setBar((b) => t.group === "참여도"
      ? { ...b, level: b.level === t.id ? undefined : t.id }
      : { ...b, features: b.features.includes(t.id) ? b.features.filter((f) => f !== t.id) : [...b.features, t.id] });
  };
  const inBar = (t: Trait) => (t.group === "참여도" ? bar.level === t.id : bar.features.includes(t.id));
  const clearBar = () => { setChecked(new Set()); setBar({ features: [] }); setHint(null); };
  const applyBar = () => {
    setTraits((cur) => {
      const next = { ...cur };
      for (const s of sel) next[s.id] = applyTraits(cur[s.id], bar);
      return next;
    });
    clearBar();
  };
  const removeTrait = (id: string, tid: string) => setTraits((cur) => {
    const t = cur[id] ?? { features: [] };
    return { ...cur, [id]: t.level === tid ? { ...t, level: undefined } : { ...t, features: t.features.filter((f) => f !== tid) } };
  });
  const addCustom = () => {
    if (!adding) return;
    const t = makeCustomTrait(adding.label, adding.sentence, palette);
    if (!t) { setHint("이름과 문장을 모두 적어 주세요 (같은 이름은 안 돼요)"); return; }
    setCustom((c) => [...c, t]);
    setAdding(null);
    setHint(null);
    setLastChip(t.id);
  };

  const make = () => {
    const next: Record<string, Preview> = {};
    for (const s of students) {
      const t = traits[s.id] ?? { features: [] };
      const base = composeTraitLog({ activity: name, shared, level: t.level, features: t.features }, palette);
      const prev = preview[s.id];
      next[s.id] = prev && prev.base === base ? prev : { base, text: base, included: true };
    }
    setOrder(students.map((s) => s.id));
    setPreview(next);
    setPolish({});
    setError(null);
    setStep("preview");
  };
  const setCard = (id: string, p: Partial<Preview>) => setPreview((cur) => ({ ...cur, [id]: { ...cur[id], ...p } }));
  const runPolish = (id: string) => {
    setPolish((p) => ({ ...p, [id]: "busy" }));
    startPolish(async () => {
      let r: PolishResult;
      try {
        r = await polishTraitLog({ area, clubId, activity: name, text: preview[id].text });
      } catch {
        r = { ok: false, error: "다듬지 못했어요. 직접 고쳐 주세요" };
      }
      setPolish((p) => ({ ...p, [id]: r }));
    });
  };
  const closePolish = (id: string) => setPolish((p) => { const n = { ...p }; delete n[id]; return n; });

  const cards = order.map((id) => students.find((s) => s.id === id) ?? null).filter((s): s is S => !!s && !!preview[s.id]);
  const included = cards.filter((s) => preview[s.id].included);
  const save = () => startSave(async () => {
    setError(null);
    try {
      const r = await addLogsEach({ area, clubId, date, items: included.map((s) => ({ studentId: s.id, content: preview[s.id].text })) });
      if (r.error) { setError(r.error); return; }
      onAdded(r.added ?? 0);
      setStep("pick");
      setShared("");
      setTraits({});
      setPreview({});
      setPolish({});
      setOrder([]);
    } catch {
      setError("추가하지 못했어요. 잠시 뒤 다시 해 주세요");
    }
  });

  if (step === "preview") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-inner bg-bg px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-3">
            <span className="truncate text-[14px] font-bold">[{name}]</span>
            <span className="shrink-0 text-[13px] text-mute">{date.slice(5).replace("-", ".")} · {cards.length}명</span>
          </div>
          <button type="button" onClick={() => setStep("pick")} className="shrink-0 whitespace-nowrap text-[13px] font-medium text-key-strong">특징 고치기</button>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <h3 className="text-[15px] font-bold">미리보기</h3>
          <span className="flex-1 text-[13px] text-mute"><span className="hidden md:inline">글 {cards.length}개 · </span>포함 {included.length}</span>
          <button type="button" onClick={() => setPreview((cur) => Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, { ...v, included: true }])))}
            className="shrink-0 whitespace-nowrap text-[13px] font-medium text-key-strong">모두 포함</button>
        </div>
        <div className="-mt-1 flex flex-col items-start gap-1.5 md:flex-row md:items-center md:gap-2">
          <span className="whitespace-nowrap rounded-chip bg-soft px-1.5 py-0.5 text-xs font-medium text-sub">특징 → 문장</span>
          <span className="text-xs text-mute">[활동명] + 공통 문장 + 고른 특징마다 정해진 한 문장</span>
        </div>

        <ul className="flex flex-col gap-2.5">
          {cards.map((s) => {
            const p = preview[s.id];
            const t = traits[s.id] ?? { features: [] };
            const chips = [t.level, ...t.features.filter((f) => byId.has(f)).sort((a, b) => palette.findIndex((x) => x.id === a) - palette.findIndex((x) => x.id === b))]
              .filter((x): x is string => !!x && byId.has(x)).map((x) => byId.get(x)!.label);
            const pol = polish[s.id];
            const off = !p.included;
            return (
              <li key={s.id} className="flex flex-col gap-2.5 rounded-inner border border-line bg-[#fff] px-3.5 py-3 md:px-4 md:py-3.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <Checkbox on={p.included} onClick={() => setCard(s.id, { included: !p.included })} label={`${s.name} 포함`} />
                  <span className="tabular-nums text-[13px] text-mute">{makeStudentNo(s.grade, s.classNo, s.number)}</span>
                  <span className={cx("text-[14px] font-bold", off && "text-mute")}>{s.name}</span>
                  <span className={cx("order-last flex basis-full flex-wrap gap-1 pl-[26px] md:order-none md:basis-auto md:pl-0", off && "opacity-50", !chips.length && "hidden md:flex")}>
                    {chips.map((c) => <span key={c} className="inline-flex h-[22px] items-center whitespace-nowrap rounded-chip bg-soft px-1.5 text-xs font-medium text-sub">{c}</span>)}
                  </span>
                  <span className={cx("ml-auto tabular-nums text-xs font-medium", off ? "text-mute" : "text-sub")}>{neisBytes(p.text).toLocaleString()}B</span>
                </div>
                <textarea value={p.text} onChange={(e) => setCard(s.id, { text: e.target.value })} maxLength={1000} aria-label={`${s.name} 기록`}
                  className={cx("field-sizing-content min-h-12 w-full resize-none rounded-field bg-soft px-3 py-2.5 text-[14px] leading-6 outline-none focus:ring-2 focus:ring-key", off && "text-mute")} />
                {pol && pol !== "busy" && pol.ok && (
                  <div className="flex flex-col gap-2 rounded-inner border border-line bg-[#fff] p-3">
                    <div className="flex items-center gap-1.5">
                      <Tag tone={pol.label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong"}>{pol.label}</Tag>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-sub">다듬은 글</span>
                    </div>
                    <p className="text-[14px] leading-6">{pol.text}</p>
                    {pol.notice && <p className="text-xs text-mute">{pol.notice}</p>}
                    <div className="flex justify-end gap-2">
                      <Button type="button" kind="ghost" size="sm" onClick={() => closePolish(s.id)}>그대로 두기</Button>
                      <Button type="button" kind="outline" size="sm" onClick={() => { setCard(s.id, { text: pol.text }); closePolish(s.id); }}>확인 후 바꾸기</Button>
                    </div>
                  </div>
                )}
                {pol && pol !== "busy" && !pol.ok && <p className="text-[13px] text-bad" role="alert">{pol.error}</p>}
                <div className="flex items-center gap-2">
                  {p.text !== p.base && (
                    <span className="inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-chip bg-soft px-1.5 text-xs font-medium text-sub">
                      <Pencil size={12} /> 고침
                    </span>
                  )}
                  <button type="button" onClick={() => runPolish(s.id)} disabled={off || pol === "busy" || p.text.trim().length < 2}
                    className="ml-auto inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-control border border-hair bg-[#fff] px-2.5 text-[13px] font-medium text-ink disabled:opacity-40">
                    <span className="rounded-[4px] bg-new-soft px-1 text-[11px] font-bold leading-4 text-new">AI</span>
                    {pol === "busy" ? "다듬는 중…" : "다듬기"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="text-[13px] text-mute">포함 {included.length}명 · 뺌 {cards.length - included.length}명</p>
        {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        <Button type="button" onClick={save} disabled={saving || !included.length} className="h-[42px] py-0">
          {saving ? "추가하는 중…" : included.length ? `확인 후 ${included.length}명에게 추가` : "포함할 학생을 골라 주세요"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[15px] font-bold">공통 내용</h3>
      <div className="flex flex-col gap-3 md:flex-row">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">활동명</span>
          <input value={activity} onChange={(e) => setActivity(e.target.value)} maxLength={40} placeholder="예: 과학의 날 실험 부스" className={cx(fieldCls, "h-11 md:h-10")} />
          <span className="text-xs text-mute">활동명은 기록 맨 앞에 붙어요</span>
        </label>
        <label className="flex flex-col gap-1.5 md:w-[180px]">
          <span className="text-[13px] font-medium text-sub">날짜</span>
          <span className="relative">
            <Calendar size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-mute" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={cx(fieldCls, "relative h-11 pl-9 md:h-10 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:size-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0")} />
          </span>
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-sub">활동 내용</span>
        <textarea value={shared} onChange={(e) => setShared(e.target.value)} maxLength={600} placeholder="모두에게 들어갈 공통 문장 (예: 부스 운영 계획을 세우고 실험을 시연함.)"
          className="h-24 w-full resize-y rounded-field bg-soft px-3.5 py-3 text-[15px] leading-6 outline-none focus:ring-2 focus:ring-key md:h-20 md:text-[14px]" />
        <span className="self-end text-xs text-mute">{shared.length}자 · {neisBytes(shared)}B</span>
      </label>

      <div className="mt-1 border-t border-line pt-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-[15px] font-bold">학생별 특징</h3>
          <span className="text-[13px] text-mute">{students.length}명</span>
        </div>

        <div className="flex flex-col gap-2.5 rounded-inner bg-bg p-3 md:px-4 md:py-3.5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-0">
            <span className="text-xs font-medium text-sub md:w-11 md:shrink-0">참여도</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {LEVEL_TRAITS.map((t) => <PaletteChip key={t.id} t={t} on={inBar(t)} onClick={() => pickChip(t)} />)}
              <span className="text-xs text-mute">한 명에 하나</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-0">
            <span className="text-xs font-medium text-sub md:w-11 md:shrink-0 md:pt-1.5">특징</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {features.map((t) => <PaletteChip key={t.id} t={t} on={inBar(t)} onClick={() => pickChip(t)} />)}
              {!adding && (
                <button type="button" onClick={() => setAdding({ label: "", sentence: "" })} className="inline-flex h-[30px] items-center gap-1 whitespace-nowrap px-2 text-[13px] font-bold text-key-strong">
                  <Plus size={14} /> 특징 더하기
                </button>
              )}
            </div>
          </div>
          {adding && (
            <div className="flex flex-col gap-2 rounded-inner border border-line bg-[#fff] p-3 md:ml-11 md:flex-row md:items-center">
              <input value={adding.label} onChange={(e) => setAdding({ ...adding, label: e.target.value })} maxLength={12} placeholder="특징 (예: 관람 안내)" aria-label="새 특징 이름"
                className={cx(fieldCls, "h-10 md:w-36 md:shrink-0")} />
              <input value={adding.sentence} onChange={(e) => setAdding({ ...adding, sentence: e.target.value })} maxLength={80} placeholder="붙을 문장 (예: 관람객에게 원리를 설명함.)" aria-label="새 특징 문장"
                className={cx(fieldCls, "h-10 min-w-0 md:flex-1")} />
              <div className="flex justify-end gap-2">
                <Button type="button" kind="ghost" size="sm" onClick={() => { setAdding(null); setHint(null); }}>취소</Button>
                <Button type="button" kind="soft" size="sm" onClick={addCustom} disabled={!adding.label.trim() || !adding.sentence.trim()}>더하기</Button>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1 border-t border-line pt-2.5 md:flex-row md:items-center md:gap-2">
            <span className="self-start whitespace-nowrap rounded-chip bg-[#fff] px-1.5 py-0.5 text-xs font-medium text-sub md:self-auto">특징 → 문장</span>
            <span className="min-w-0 text-xs text-mute">{example.label} → &ldquo;{example.sentence}&rdquo;</span>
          </div>
        </div>
        {hint && <p className="mt-2 text-[13px] text-due" role="status">{hint}</p>}

        {sel.length > 0 && (
          <>
            <div data-sticky-cta className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+78px)] z-20 mt-3 flex items-center gap-2.5 rounded-[12px] bg-navy py-2 pl-4 pr-2 md:static md:rounded-inner">
              <span className="shrink-0 whitespace-nowrap text-[13px] font-bold text-white">고른 {sel.length}명에게</span>
              <span className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
                {[bar.level, ...bar.features].filter((x): x is string => !!x).map((id) => (
                  <span key={id} className="inline-flex h-[26px] shrink-0 items-center whitespace-nowrap rounded-chip bg-navy-2 px-2 text-xs font-medium text-white">{byId.get(id)?.label}</span>
                ))}
                {!bar.level && !bar.features.length && <span className="truncate text-xs text-[#9EAAFF]">칩을 눌러 담아요</span>}
              </span>
              <button type="button" onClick={clearBar} className="shrink-0 whitespace-nowrap text-[13px] font-medium text-[#9EAAFF]">
                <span className="md:hidden">해제</span><span className="hidden md:inline">선택 해제</span>
              </button>
              <button type="button" onClick={applyBar} disabled={!bar.level && !bar.features.length}
                className="h-8 shrink-0 whitespace-nowrap rounded-control bg-[#fff] px-3.5 text-[13px] font-bold text-key-strong disabled:opacity-50">넣기</button>
            </div>
          </>
        )}

        <div className="mt-3 overflow-hidden rounded-inner border border-line">
          <div className="flex h-9 items-center gap-3 bg-bg px-3 text-xs font-medium text-sub md:px-4">
            <Checkbox on={allChecked} onClick={() => setChecked(allChecked ? new Set() : new Set(students.map((s) => s.id)))} label="모두 고르기" />
            <span className="flex-1 md:hidden">모두</span>
            <span className="hidden w-14 shrink-0 md:block">학번</span>
            <span className="hidden w-16 shrink-0 md:block">이름</span>
            <span className="shrink-0 md:w-[88px]">참여도</span>
            <span className="hidden flex-1 md:block">특징</span>
          </div>
          {students.length === 0 && <p className="bg-[#fff] py-6 text-center text-sm text-mute">학생 목록에서 학생을 골라 주세요</p>}
          {students.map((s, i) => {
            const t = traits[s.id] ?? { features: [] };
            const lv = t.level ? byId.get(t.level) : undefined;
            const fs = features.filter((f) => t.features.includes(f.id));
            const on = checked.has(s.id);
            const level = lv ? <TraitChip label={lv.label} onRemove={() => removeTrait(s.id, lv.id)} /> : <span className="text-[13px] text-faint">—</span>;
            return (
              <div key={s.id} className={cx("flex flex-col gap-2 p-3 md:flex-row md:items-center md:gap-3 md:px-4", on ? "bg-bg" : "bg-[#fff]", i < students.length - 1 && "border-b border-soft")}>
                <div className="flex items-center gap-2.5 md:contents">
                  <Checkbox on={on} onClick={() => toggleCheck(s.id)} label={`${s.name} 고르기`} />
                  <span className="tabular-nums text-[13px] text-mute md:w-14 md:shrink-0">{makeStudentNo(s.grade, s.classNo, s.number)}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium md:w-16 md:flex-none md:shrink-0">{s.name}</span>
                  <span className="flex shrink-0 md:w-[88px]">{level}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pl-7 md:flex-1 md:pl-0">
                  {fs.length
                    ? fs.map((f) => <TraitChip key={f.id} label={f.label} onRemove={() => removeTrait(s.id, f.id)} />)
                    : <span className="text-[13px] text-mute">{lv ? "특징 없음" : "특징 없음 · 공통 문장만"}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[13px] text-mute">{students.length}명 · 고른 특징 {traitCount}개</p>
      <Button type="button" onClick={make} disabled={!ready} className="h-[42px] py-0 disabled:bg-key disabled:opacity-40">
        글 만들기
      </Button>
      {/* 모바일: 탭바 위 고정 바에 가리지 않게 내용 맨 아래 여백 88 */}
      {sel.length > 0 && <div className="h-[76px] md:hidden" aria-hidden />}
    </div>
  );
}

function PaletteChip({ t, on, onClick }: { t: Trait; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={t.sentence}
      className={cx("h-[30px] whitespace-nowrap rounded-chip border px-2.5 text-[13px]", on ? "border-key bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-ink")}>
      {t.label}
    </button>
  );
}
