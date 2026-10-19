"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Copy, Sparkles } from "lucide-react";
import { cx } from "@/components/ui";
import { isNoSourceRow, type CheckMore, type CheckRow } from "@/lib/domain/auto-check";
import { neisBytes } from "@/lib/domain/length";
import {
  alignSentences, editRatio, noSourceSentences, removeSentence, splitSentences, wordChange,
  type OriginalView, type Pin, type SentenceSource, type SourceItem, type SourceRef,
} from "@/lib/domain/provenance";
import type { SpellHit } from "@/lib/domain/spelling";
import type { AiDraftResult } from "@/lib/domain/writing";
import { checkSpellingAi } from "@/app/(app)/teacher/spell-actions";
import { BeforeAfter } from "./before-after";
import { BodyViewSwitch, type BodyView } from "./body-view-switch";
import { EditRatioChip } from "./edit-ratio-chip";
import { LowEditConfirm } from "./low-edit-confirm";
import { SentenceSources } from "./sentence-sources";
import { SourcePicker } from "./source-picker";

// 문장 근거 · AI 원안 기록 · 맞춤법 (Figma N38) — 세특 · 기록 쓰기 · 초안 검토 ③이 같이 쓰는 상태 묶음.
// - AI 원안(고칠 수 없음)과 지금 글을 문장으로 맞춰 근거를 물려받고, 근거 없는 문장은 자동 검사 행(확인)으로.
// - 수정 비율은 타이핑 중 300ms 늦춰 다시 계산. 확정 때 기준 미만이면 확인 창(까닭 한 줄) — 서버가 다시 계산한다.
// - 맞춤법 AI 검사 결과는 화면 상태: 본문이 바뀌면 지운다.

export type ProvInit = {
  original: OriginalView | null;
  pins: Pin[];
  pool: SourceItem[];
  editRatioMin: number;
  /** "학생A" (근거 고르기 머리) */
  who: string;
};

type Spell = { kind: "setuk" | "record" | "draft"; studentId: string };

const fmtAt = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function useProvenance({ init, text, replace, spell, focusBody }: {
  init?: ProvInit;
  text: string;
  /** 본문을 바꾸고 "…했어요 · 되돌리기" 스낵바 */
  replace: (next: string, msg: string) => void;
  spell: Spell;
  /** 더 고치기 · 원안 비교 뒤 본문으로 */
  focusBody?: () => void;
}) {
  const min = init?.editRatioMin ?? 10;
  const [original, setOriginal] = useState<OriginalView | null>(init?.original ?? null);
  const [pool, setPool] = useState<Map<string, SourceItem>>(() => new Map((init?.pool ?? []).map((p) => [p.key, p])));
  const [pins, setPins] = useState<Pin[]>(init?.pins ?? []);
  const [view, setViewState] = useState<BodyView>("write");

  const aligned = useMemo<SentenceSource[] | null>(() => (original ? alignSentences(original, text, pins) : null), [original, text, pins]);
  const nosource = useMemo(() => (aligned ? noSourceSentences(aligned) : []), [aligned]);
  const hasSources = !!aligned?.some((s) => s.sources.length > 0);
  // 근거 연결이 없거나 원안이 없으면 그 보기는 없다 → 쓰기로
  const shown: BodyView = view === "sources" && !hasSources ? "write" : view === "compare" && !original ? "write" : view;

  // 맞춤법 AI 검사 (본문이 바뀌면 결과를 지운다)
  const [spellAi, setSpellAi] = useState<{ text: string; hits: SpellHit[] } | null>(null);
  const [spellBusy, setSpellBusy] = useState(false);
  const [spellErr, setSpellErr] = useState<{ text: string; error: string } | null>(null);
  const aiHits = spellAi && spellAi.text === text ? spellAi.hits : undefined;
  const more = useMemo<CheckMore>(() => ({
    provenance: original ? { nosource: nosource.map((s) => ({ i: s.i, start: s.start, end: s.end })) } : undefined,
    spellAi: aiHits,
  }), [original, nosource, aiHits]);
  const runSpellAi = async () => {
    const t = text;
    setSpellBusy(true);
    setSpellErr(null);
    try {
      const r = await checkSpellingAi({ kind: spell.kind, studentId: spell.studentId, text: t });
      if (r.ok) setSpellAi({ text: t, hits: r.hits });
      else setSpellErr({ text: t, error: r.error });
    } catch {
      setSpellErr({ text: t, error: "맞춤법을 보지 못했어요. 다시 눌러 주세요" });
    }
    setSpellBusy(false);
  };

  // 수정 비율: 타이핑 중에는 300ms 늦춰
  const [ratio, setRatio] = useState<number | null>(() => (original ? editRatio(original.content, text) : null));
  useEffect(() => {
    if (!original) return;
    const t = window.setTimeout(() => setRatio(editRatio(original.content, text)), 300);
    return () => window.clearTimeout(t);
  }, [original, text]);
  const shownRatio = original ? ratio : null;

  /** AI 결과를 본문에 넣을 때: 새 원안이면 바꾸고, 교사가 정한 문장은 비운다 */
  const adopt = useCallback((r: AiDraftResult | null | undefined) => {
    if (!r || !r.ok || !r.original) return;
    setOriginal(r.original);
    setRatio(0);
    setPins([]);
    if (r.sources?.length) setPool((cur) => { const n = new Map(cur); for (const s of r.sources!) n.set(s.key, s); return n; });
  }, []);
  const pin = (p: Pin) => setPins((cur) => [...cur.filter((x) => x.text !== p.text), p].slice(-80));
  const link = (sentence: string, refs: SourceRef[]) => pin({ text: sentence, sources: refs });
  const markOwn = (sentence: string) => pin({ text: sentence, sources: [], own: true });
  const dropSentence = (i: number) => {
    const sp = splitSentences(text)[i];
    if (sp) replace(removeSentence(text, sp), "문장을 지웠어요");
  };

  const setView = (v: BodyView) => { setViewState(v); if (v === "write") focusBody?.(); };

  // ---------- 확정 확인 창 ----------
  const [dialog, setDialog] = useState<{ ratio: number; nosource: number } | null>(null);
  // 확정 버튼 (누를 때 기억해 두었다가 "그래도 확정"에서 그 버튼으로 폼을 보낸다)
  const confirmBtn = useRef<HTMLButtonElement | null>(null);
  /** 확정 버튼 onClick: 원안이 있고 수정 비율 < 기준이면 확인 창 (서버도 다시 본다) */
  const guardConfirm = (e: MouseEvent<HTMLButtonElement>) => {
    confirmBtn.current = e.currentTarget;
    if (!original) return;
    const r = editRatio(original.content, text);
    if (r >= min) return;
    e.preventDefault();
    setDialog({ ratio: r, nosource: nosource.length });
  };
  /** 서버가 needReason 을 돌려주면 (화면 계산과 달랐을 때) */
  const needFromServer = useCallback((n: { ratio: number; nosource: number } | undefined) => { if (n) setDialog({ ratio: n.ratio, nosource: n.nosource }); }, []);
  const submitWith = (reason: string) => {
    const btn = confirmBtn.current;
    const form = btn?.form;
    if (!btn || !form) return;
    const field = form.elements.namedItem("lowEditReason");
    if (field instanceof HTMLInputElement) field.value = reason;
    form.requestSubmit(btn);
  };
  const dialogNode = dialog && (
    <LowEditConfirm ratio={dialog.ratio} min={min} nosource={dialog.nosource}
      onMore={() => { setDialog(null); setViewState("write"); focusBody?.(); }}
      onConfirm={(reason) => { setDialog(null); submitWith(reason); }} />
  );

  /** 폼에 같이 보낼 칸 (form: 폼 밖이면 그 폼 id) — 서버가 원안으로 다시 계산한다 */
  const inputs = (form?: string) => (
    <>
      <input form={form} type="hidden" name="aiOriginalId" value={original?.id ?? ""} />
      <input form={form} type="hidden" name="pins" value={JSON.stringify(pins)} />
      <input form={form} type="hidden" name="lowEditReason" defaultValue="" />
    </>
  );

  // ---------- 화면 조각 ----------
  const switchProps = { value: shown, onChange: setView, sources: hasSources, compare: !!original };

  /** 본문 칸: 쓰기 보기면 children(편집칸 — 폼 제출용으로 늘 그려 둔다), 근거 · 원안 비교 보기면 그 보기 */
  const body = (editor: ReactNode) => (
    <>
      <div className={cx(shown !== "write" && "hidden")}>{editor}</div>
      {shown === "sources" && aligned && (
        <SentenceSources text={text} list={aligned} pool={pool} who={init?.who ?? "학생"} onLink={link} />
      )}
      {shown === "compare" && original && <OriginalCompare original={original} now={text} />}
    </>
  );

  /** 수정 줄 (③ 확정 버튼 바로 위): "AI 원안에서" + 수정 칩 + "원안 비교" */
  const ratioLine = original ? (
    <div className="flex items-center gap-2 @lg:justify-end">
      <span className="hidden text-[12px] text-mute @lg:inline">AI 원안에서</span>
      <EditRatioChip ratio={shownRatio} min={min} long className="@max-lg:hidden" />
      <EditRatioChip ratio={shownRatio} min={min} className="@lg:hidden" />
      <span className="flex-1 @lg:hidden" />
      {shown !== "compare" && <button type="button" onClick={() => setView("compare")} className="shrink-0 whitespace-nowrap text-[12px] font-medium text-key-strong">원안 비교</button>}
    </div>
  ) : null;

  /** 근거 없는 문장 행 펼침 (N38 (b)) */
  const [picking, setPicking] = useState<number | null>(null);
  const renderOpen = (row: CheckRow): ReactNode | undefined => {
    if (!isNoSourceRow(row) || !aligned) return undefined;
    const s = aligned.find((x) => x.i === row.sentenceIndex);
    if (!s) return undefined;
    const sentence = text.slice(s.start, s.end);
    const items = [...pool.values()];
    const count = (k: string) => items.filter((x) => (k === "설문" ? x.type === "survey" : k === "파일" ? x.type === "file" : k === "누가기록" ? x.type === "log" : k === "메모" ? x.type === "memo" : x.type === "piece" || x.type === "common")).length;
    const seen = [["설문", "설문 응답", "문항"], ["메모", "교사 메모", ""], ["조각", "조각", ""], ["누가기록", "누가기록", ""], ["파일", "파일", ""]]
      .map(([k, label, unit]) => [label, count(k), unit] as const).filter(([, n]) => n > 0).map(([l, n, u]) => `${l} ${n}${u}`).join(" · ");
    return (
      <div className="flex flex-col gap-2.5 pb-3 pl-[30px] break-keep">
        <Line label="문장"><p className="rounded-control bg-bg px-3 py-2.5 text-[13px] leading-5">“{sentence}” <span className="text-mute">— {s.i + 1}번 문장</span></p></Line>
        <Line label="왜"><p className="text-[13px] leading-5">{row.why}</p></Line>
        <Line label="본 자료"><p className="text-[13px] leading-5 text-sub">{seen || "이 학생 자료가 없어요"} — 이 문장과 겹치는 말이 없어요</p></Line>
        <div className="flex flex-col gap-2 @lg:flex-row @lg:items-center">
          <div className="flex gap-2">
            <button type="button" onClick={() => setPicking(picking === s.i ? null : s.i)} className="h-10 flex-1 whitespace-nowrap rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong @lg:h-8 @lg:flex-none">근거 고르기</button>
            <button type="button" onClick={() => markOwn(sentence)} className="h-10 flex-1 whitespace-nowrap rounded-control border border-hair bg-[#fff] px-3 text-[13px] font-bold @lg:h-8 @lg:flex-none">내가 본 일이에요</button>
          </div>
          <button type="button" onClick={() => dropSentence(s.i)} className="h-10 whitespace-nowrap rounded-control text-[13px] font-bold text-bad @lg:ml-auto @lg:h-8 @lg:px-2 @max-lg:border @max-lg:border-hair">문장 지우기</button>
        </div>
        {picking === s.i && (
          <SourcePicker sentence={sentence} pool={items} who={init?.who ?? "학생"} onCancel={() => setPicking(null)} onLink={(refs) => { link(sentence, refs); setPicking(null); }} />
        )}
      </div>
    );
  };

  /** 맞춤법 AI 검사 줄 */
  const spellLine = (
    <div className="flex flex-col gap-2 @lg:flex-row @lg:items-center @lg:gap-3">
      <button type="button" onClick={runSpellAi} disabled={spellBusy || !text.trim()}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-new-soft px-3 text-[13px] font-bold text-ink disabled:opacity-60 @lg:h-8">
        <Sparkles size={14} className="text-new" />{spellBusy ? "맞춤법을 보는 중이에요" : "맞춤법 AI 검사"}
      </button>
      <span className={cx("text-center text-[12px] @lg:text-left", spellErr && spellErr.text === text ? "text-bad" : "text-mute")} role={spellBusy ? "status" : undefined}>
        {spellErr && spellErr.text === text ? spellErr.error
          : aiHits && aiHits.length === 0 ? "AI도 고칠 곳을 못 찾았어요"
          : <>규칙에 없는 틀린 말까지 찾아요 · 이름·학번은 <span className="@lg:hidden">지워요</span><span className="hidden @lg:inline">지우고 보내요</span></>}
      </span>
    </div>
  );

  return {
    original, aligned, nosource, more, ratio: shownRatio, min, view: shown, setView, hasSources, adopt, switchProps, body, ratioLine, renderOpen, spellLine,
    inputs, guardConfirm, dialog: dialogNode, needFromServer,
  };
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 @lg:flex-row @lg:gap-0">
      <span className="shrink-0 text-[12px] leading-5 text-mute @lg:w-[60px] @lg:pt-px">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** 원안 비교 (N38 (c)): 요약 줄(어절 기준 · 바뀐 어절 n / m ↔ 빠진 말 · 보탠 말) → 두 칸(넓은 단 나란히 · 좁은 단 위아래) → 안내 ↔ 원안 복사 */
export function OriginalCompare({ original, now }: { original: OriginalView; now: string }) {
  const c = wordChange(original.content, now);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(original.content); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 rounded-control bg-bg px-3 py-2 text-[12px]">
        <span className="min-w-0 flex-1 text-sub">어절 기준 · 바뀐 어절 {(c.removed + c.added).toLocaleString()} / {(c.a + c.b).toLocaleString()}</span>
        <span className="shrink-0 font-medium text-bad">빠진 말</span>
        <span className="shrink-0 font-medium text-key-strong">보탠 말</span>
      </div>
      <BeforeAfter before={original.content} after={now} beforeLabel="AI 원안" afterLabel="지금" bold block="border border-line bg-[#fff]"
        beforeMeta={`${fmtAt(original.createdAt)} · ${neisBytes(original.content).toLocaleString()}B · 고칠 수 없음`} afterMeta={`${neisBytes(now).toLocaleString()}B`} />
      <div className="flex items-center gap-3 text-[12px]">
        <span className="min-w-0 flex-1 text-mute">AI 원안은 처음 만든 그대로 남아요 · 확정할 때 수정 비율만 기록돼요</span>
        <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-sub"><Copy size={12} />{copied ? "복사했어요" : "원안 복사"}</button>
      </div>
    </div>
  );
}

export { BodyViewSwitch };
