"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Copy, Pencil, Plus, RotateCcw, Sparkles } from "lucide-react";
import { Button, Tag, cx } from "@/components/ui";
import { addKeyword, KEYWORD_LEN, KEYWORD_WARN, pickedLabels, visibleItems, type KeywordMenu as Menu } from "@/lib/domain/behavior-keywords";
import { measure, neisBytes, UNIT_LABEL, type LengthUnit } from "@/lib/domain/length";
import { bluntWords } from "@/lib/domain/soften";
import type { AiDraftResult } from "@/lib/domain/writing";
import { draftBehavior, saveBehaviorPicks, saveKeywordMenu } from "@/app/(app)/homeroom/behavior/actions";
import { softenRecordMemo } from "@/app/(app)/teacher/write/actions";
import { SoftenNotice, SoftenResult } from "./soften";
import { KeywordMenuEditor } from "./keyword-menu-editor";
import { SaveBookmark } from "./library-save";

// 행발 키워드 메뉴판 (Figma N35 ④ 440:747 · 440:1044): 다섯 묶음 칩을 학생마다 톡톡 고르고(내 키워드는 앞 점) + 에피소드 메모
// + 누가기록 같이 쓰기 → "✦ 초안 만들기". 고른 키워드는 말의 방향일 뿐 — 문장은 메모·누가기록에 있는 일로만 쓴다.
// 결과는 ② 초안 결과 → ③ 본문·검사·확정 흐름 그대로 (본문에 넣기를 눌러야 들어가고, 저장·확정은 선생님이).

export type BehaviorLog = { id: string; date: string; area: string; content: string };

export function KeywordMenuCard({ studentId, menu: initialMenu, pick, logs, unit, neisMax, bodyEmpty, onApply, aiOn }: {
  studentId: string;
  menu: Menu;
  pick: { keywords: string[]; memo: string; useLogs: boolean };
  logs: BehaviorLog[];
  unit: LengthUnit;
  neisMax: number;
  bodyEmpty: boolean;
  onApply: (text: string) => void;
  aiOn?: boolean;
}) {
  const [menu, setMenu] = useState(initialMenu);
  const [picked, setPicked] = useState<string[]>(pick.keywords);
  const [memo, setMemo] = useState(pick.memo);
  const [useLogs, setUseLogs] = useState(pick.useLogs);
  const [showLogs, setShowLogs] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editor, setEditor] = useState(false);
  const [hint, setHint] = useState("");
  const [target, setTarget] = useState(neisMax);
  const max = Math.min(neisMax, Math.max(1, target || neisMax));
  const u = unit === "bytes" ? "B" : UNIT_LABEL[unit];
  const [result, setResult] = useState<Extract<AiDraftResult, { ok: true }> | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [soft, setSoft] = useState<{ memo: string; text: string } | null>(null);
  const [softBusy, startSoft] = useTransition();
  const addRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (adding) addRef.current?.focus(); }, [adding]);

  // 고른 키워드 · 메모 · 누가기록 같이 쓰기는 바뀌면 조금 뒤 저장 (라벨 그대로)
  const timer = useRef<number | null>(null);
  const persist = (next: { keywords?: string[]; memo?: string; useLogs?: boolean }) => {
    if (timer.current) window.clearTimeout(timer.current);
    const body = { studentId, keywords: next.keywords ?? picked, memo: next.memo ?? memo, useLogs: next.useLogs ?? useLogs };
    timer.current = window.setTimeout(() => {
      saveBehaviorPicks(body).then((r) => { if (!r.ok) setHint(r.error); }).catch(() => {});
    }, 500);
  };
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const toggle = (label: string) => {
    const next = picked.includes(label) ? picked.filter((x) => x !== label) : pickedLabels(menu, [...picked, label]);
    setPicked(next);
    persist({ keywords: next });
  };
  const add = async (groupId: string) => {
    const r = addKeyword(menu, groupId, draft);
    if (!r.item) { setHint(draft.trim() ? "같은 키워드가 이미 있어요" : ""); setAdding(null); setDraft(""); return; }
    setMenu(r.menu);
    setAdding(null);
    setDraft("");
    const next = pickedLabels(r.menu, [...picked, r.item.label]);
    setPicked(next);
    persist({ keywords: next });
    const s = await saveKeywordMenu({ menu: r.menu });
    setHint(s.ok ? "" : s.error);
  };

  const run = () => start(async () => {
    setError("");
    setCopied(false);
    let r: AiDraftResult;
    try {
      r = await draftBehavior({ studentId, keywords: picked, memo, useLogs, unit, max });
    } catch {
      r = { ok: false, error: "AI 처리 중 문제가 생겼어요. 직접 써 주세요" };
    }
    if (!r.ok) { setResult(null); setError(r.error); return; }
    setResult(r);
    if (bodyEmpty) onApply(r.text);
  });
  const copy = async () => {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.text); setCopied(true); } catch { setCopied(false); }
  };
  const blunt = bluntWords(memo);
  const runSoften = () => startSoft(async () => {
    const r = await softenRecordMemo({ area: "행발", studentId, text: memo }).catch(() => ({ ok: false as const, error: "순화하지 못했어요" }));
    if (r.ok) setSoft({ memo, text: r.text });
    else setHint(r.error);
  });

  const n = picked.length;
  const chip = (on: boolean) => cx("inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[16px] border px-3 text-[13px] md:h-[30px]",
    on ? "border-key bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-ink hover:bg-bg");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap text-[15px] font-bold">키워드 메뉴판</span>
        <span className="whitespace-nowrap text-[13px] text-mute">고른 {n}개</span>
        {n > KEYWORD_WARN && <span className="hidden whitespace-nowrap text-[12px] text-[#9A6400] sm:inline">많으면 글이 흐려져요</span>}
        <span className="flex-1" />
        <button type="button" onClick={() => setEditor(true)} className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-sub">
          <Pencil size={14} /> <span className="md:hidden">고치기</span><span className="hidden md:inline">메뉴판 고치기</span>
        </button>
      </div>
      {n > KEYWORD_WARN && <p className="-mt-2 text-[12px] text-[#9A6400] sm:hidden">많으면 글이 흐려져요</p>}

      <div className="flex flex-col gap-3.5">
        {menu.groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-2 md:flex-row md:gap-0">
            <span className="shrink-0 text-[13px] font-bold text-sub md:w-[92px] md:pt-[6px]">{g.label}</span>
            <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5" aria-label={g.label}>
              {visibleItems(g, picked).map((it) => {
                const on = picked.includes(it.label);
                return (
                  <li key={it.id} className="flex">
                    <button type="button" aria-pressed={on} onClick={() => toggle(it.label)} className={chip(on)}>
                      {it.custom && <span aria-label="내 키워드" className="size-[5px] shrink-0 rounded-full bg-key" />}{it.label}
                    </button>
                  </li>
                );
              })}
              <li className="flex">{adding === g.id ? (
                <input ref={addRef} value={draft} maxLength={KEYWORD_LEN} onChange={(e) => setDraft(e.target.value)} aria-label={`${g.label}에 키워드 더하기`} placeholder="새 키워드"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(g.id); } if (e.key === "Escape") { setAdding(null); setDraft(""); } }}
                  onBlur={() => (draft.trim() ? void add(g.id) : setAdding(null))}
                  className="h-[34px] w-32 rounded-[16px] border border-dashed border-key bg-[#fff] px-3 text-[13px] outline-none md:h-[30px]" />
              ) : (
                <button type="button" onClick={() => { setAdding(g.id); setDraft(""); }}
                  className="inline-flex h-[34px] shrink-0 items-center gap-1 whitespace-nowrap rounded-[16px] border border-dashed border-hair px-3 text-[13px] font-medium text-mute md:h-[30px]"><Plus size={13} /> 더하기</button>
              )}</li>
            </ul>
          </div>
        ))}
        <p className="flex items-center gap-1.5 text-[12px] text-mute"><span className="size-[5px] shrink-0 rounded-full bg-key" /> 내가 더한 키워드 · 메뉴판은 선생님마다 따로 저장돼요</p>
        {hint && <p className="text-[12px] text-bad" role="alert">{hint}</p>}
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line pt-4">
        <div className="flex items-center gap-2"><span className="text-[15px] font-bold">에피소드 메모</span><span className="text-[13px] text-mute">선택</span></div>
        <div className="flex flex-col rounded-field bg-bg px-3.5 py-3 focus-within:ring-2 focus-within:ring-key">
          <textarea value={memo} maxLength={600} rows={2} aria-label="에피소드 메모"
            onChange={(e) => { setMemo(e.target.value); persist({ memo: e.target.value }); }}
            placeholder="기억에 남는 장면을 짧게 (예: 체육대회 뒷정리를 끝까지 맡음)"
            className="min-h-[48px] w-full resize-y bg-transparent text-[14px] leading-6 outline-none placeholder:text-mute" />
          <span className="self-end text-[12px] tabular-nums text-mute">{[...memo].length}자 · {neisBytes(memo).toLocaleString()}B</span>
        </div>
        {soft && soft.memo === memo ? (
          <SoftenResult memo={soft.memo} soft={soft.text} hits={blunt} busy={softBusy} onRedo={runSoften} onKeep={() => setSoft(null)}
            onInsert={() => { setMemo(soft.text); persist({ memo: soft.text }); setSoft(null); }} insertLabel="메모에 넣기" />
        ) : (
          <SoftenNotice hits={blunt} busy={softBusy} onRun={aiOn ? runSoften : undefined} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <button type="button" role="switch" aria-checked={useLogs} aria-label={`누가기록 ${logs.length}건 같이 쓰기`}
            onClick={() => { setUseLogs(!useLogs); persist({ useLogs: !useLogs }); }}
            className={cx("relative h-[22px] w-10 shrink-0 rounded-full transition-colors", useLogs ? "bg-key" : "bg-hair")}>
            <span className={cx("absolute top-[2px] size-[18px] rounded-full bg-[#fff] transition-[left]", useLogs ? "left-[20px]" : "left-[2px]")} />
          </button>
          <span className="min-w-0 flex-1 text-[14px] font-medium">누가기록 {logs.length}건 같이 쓰기</span>
          {logs.length > 0 && <button type="button" onClick={() => setShowLogs(!showLogs)} aria-expanded={showLogs} className="whitespace-nowrap text-[13px] font-medium text-key-strong">{showLogs ? "접기" : "보기"}</button>}
        </div>
        {showLogs && (
          <ul className="flex flex-col gap-1.5 rounded-inner bg-bg p-3">
            {logs.map((l) => (
              <li key={l.id} className="text-[13px] leading-5 text-sub"><span className="mr-1.5 text-[12px] text-mute">{l.date.slice(5).replace("-", ".")} · {l.area}</span>{l.content}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-2.5 md:flex-1">
          <span className="shrink-0 text-[13px] font-medium text-sub">목표</span>
          <label className="flex h-9 min-w-0 flex-1 items-center rounded-field bg-bg px-3 focus-within:ring-2 focus-within:ring-key md:w-24 md:flex-none">
            <input inputMode="numeric" value={target ? target.toLocaleString() : ""} aria-label="목표 분량"
              onChange={(e) => setTarget(Math.min(neisMax, Number(e.target.value.replace(/[^\d]/g, "")) || 0))}
              className="w-full min-w-0 bg-transparent text-right text-[14px] font-bold tabular-nums outline-none" />
            <span className="ml-1 shrink-0 text-[13px] text-mute">{u}</span>
          </label>
          <span className="shrink-0 whitespace-nowrap text-[12px] text-mute">최대 {neisMax.toLocaleString()}{u}</span>
        </div>
        <Button type="button" onClick={run} disabled={pending || (!memo.trim() && !(useLogs && logs.length))} className="h-12 py-0 disabled:bg-key disabled:opacity-40 max-md:w-full md:h-10 md:px-4 md:text-[14px]">
          <Sparkles size={15} /> {pending ? "쓰는 중이에요" : "초안 만들기"}
        </Button>
      </div>
      <p className="-mt-1 break-keep text-[12px] text-mute">고른 키워드와 메모·누가기록에 있는 일만 문장으로 써요 · 학생은 가명으로 보내요</p>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}

      {result && !pending && (
        <div className="flex flex-col gap-2.5 rounded-inner bg-bg p-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag tone="bg-new-soft text-new">초안</Tag>
            {result.sample && <Tag tone="bg-[#fff] text-mute">예시</Tag>}
            <Tag tone="bg-[#fff] text-sub">{`키워드 ${n}개`}</Tag>
            <span className="ml-auto text-[12px] tabular-nums text-sub"><b className="text-ink">{measure(result.text, unit).toLocaleString()}</b> / {max.toLocaleString()}{u}</span>
            <SaveBookmark text={result.text} source="draft" />
          </div>
          <p className="whitespace-pre-wrap break-keep text-[14px] leading-6">{result.text}</p>
          {result.notice && <p className="text-[12px] text-mute">{result.notice}</p>}
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex gap-2">
              <Button type="button" kind="outline" size="sm" onClick={copy}><Copy size={13} /> {copied ? "복사했어요" : "복사"}</Button>
              <Button type="button" kind="ghost" size="sm" onClick={run}><RotateCcw size={13} /> 다시 쓰기</Button>
            </div>
            <Button type="button" size="sm" className="h-11 max-md:w-full md:ml-auto md:h-9" onClick={() => onApply(result.text)}>본문에 넣기</Button>
          </div>
        </div>
      )}

      {editor && <KeywordMenuEditor menu={menu} onClose={() => setEditor(false)} onSaved={(m) => { setMenu(m); setEditor(false); }} />}
    </div>
  );
}
