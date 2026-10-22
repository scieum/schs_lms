"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { AtSign, Copy, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { cx } from "@/components/ui";
import { CHAT_LIMITS, filterMentions, mentionQuery, showNames, type Mention, type MentionKind } from "@/lib/domain/ai-chat";
import { askAi, listMentions } from "./actions";

// AI 작업창 (Figma N70): 대화 · @ 맥락 고르기(노션처럼) · 붙인 맥락 칩 · 복사 · 다시. 대화는 이 화면에만 (새로고침하면 사라져요).

type Turn = { role: "user" | "assistant"; content: string; used?: string[]; model?: string; error?: boolean };
const TONE: Record<MentionKind, string> = { 학생: "bg-ok-soft text-ok", 수업: "bg-key-soft text-key-strong", 프롬프트: "bg-new-soft text-new", 협업방: "bg-soft text-sub", 팁: "bg-wait-soft text-[#9a6400]" };
const IDEAS = ["가정통신문 초안 써 줘: 11월 학부모 상담 주간 안내", "@학생 상담 전에 이 학생 기록을 세 줄로 요약해 줘", "@수업 수행평가 채점 기준표(루브릭) 만들어 줘", "@프롬프트 이 프롬프트를 더 짧고 분명하게 고쳐 줘"];

/** compact: 영랑이 오른쪽 사이드 창 안 (노션 AI처럼) — 목록만 스크롤, 입력칸은 창 아래에 붙는다 */
export function AiWorkspace({ aiOn, compact = false }: { aiOn: boolean; compact?: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Mention[]>([]);
  const [options, setOptions] = useState<Mention[] | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [turns, pending]);

  const ensureOptions = async () => { if (!options) setOptions(await listMentions().catch(() => [])); };
  const shown = query !== null && options ? filterMentions(options.filter((o) => !picked.some((p) => p.kind === o.kind && p.id === o.id)), query) : [];

  const onChange = (v: string, caret: number) => {
    setText(v);
    const q = mentionQuery(v.slice(0, caret));
    setQuery(q);
    setActive(0);
    if (q !== null) void ensureOptions();
  };
  const pick = (m: Mention) => {
    const el = box.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]{0,20})$/, `@${m.label} `);
    setText(before + text.slice(caret));
    if (picked.length < CHAT_LIMITS.mentions) setPicked((p) => [...p, m]);
    setQuery(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  };
  const openAt = () => {
    const el = box.current;
    const caret = el?.selectionStart ?? text.length;
    const pre = text.slice(0, caret);
    const v = `${pre}${pre && !/\s$/.test(pre) ? " " : ""}@${text.slice(caret)}`;
    onChange(v, pre.length + (pre && !/\s$/.test(pre) ? 2 : 1));
    requestAnimationFrame(() => el?.focus());
  };

  const send = (override?: string) => {
    const content = (override ?? text).trim();
    if (!content || pending) return;
    const next: Turn[] = [...turns.filter((t) => !t.error), { role: "user", content }];
    setTurns(next); setText(""); setQuery(null);
    const mentions = picked;
    start(async () => {
      const r = await askAi({ messages: next.map(({ role, content: c }) => ({ role, content: c })), mentions }).catch(() => ({ ok: false as const, error: "AI 연결이 끊겼어요. 다시 보내 주세요" }));
      if (!r.ok) return setTurns((t) => [...t, { role: "assistant", content: r.error, error: true }]);
      setAliases((a) => ({ ...a, ...r.aliases }));
      setTurns((t) => [...t, { role: "assistant", content: r.text, used: r.used, model: r.model }]);
    });
  };
  const retry = () => {
    const lastUser = [...turns].reverse().find((t) => t.role === "user");
    if (!lastUser) return;
    setTurns((t) => t.slice(0, t.lastIndexOf(lastUser)));
    send(lastUser.content);
  };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (shown.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % shown.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + shown.length) % shown.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(shown[active]); return; }
      if (e.key === "Escape") { setQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };
  // 예시: "@학생 …"이면 @학생 뒤에 커서를 두어 학생 고르기부터
  const takeIdea = (x: string) => {
    const tok = x.match(/^@S+/)?.[0];
    onChange(x, tok ? tok.length : x.length);
    requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(tok ? tok.length : x.length, tok ? tok.length : x.length); });
  };
  const copy = async (i: number, s: string) => { try { await navigator.clipboard.writeText(s); setCopied(i); setTimeout(() => setCopied(null), 1500); } catch { /* 막힘 */ } };

  return (
    <div className={compact ? "flex min-h-0 flex-1 flex-col" : "mx-auto flex w-full max-w-[880px] flex-col gap-4"}>
      <div className={compact ? "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" : "contents"}>
      {!aiOn && <p className="rounded-inner bg-wait-soft px-4 py-3 text-[13px] text-[#9a6400]">AI가 꺼져 있어요 (서버에 AI 키가 없음). 관리자에게 알려 주세요.</p>}
      {turns.length === 0 && (
        <div className="flex flex-col gap-3">
          <p className={cx("text-sub", compact ? "text-[13px]" : "text-[14px]")}>무엇이든 시켜 보세요. 입력칸에서 <b>@</b>를 치면 학생 · 수업 · 프롬프트 · 협업방 · 팁을 붙여 그 내용을 보고 답해요. 학생은 가명ID로만 AI에 가고, 대화는 저장하지 않아요.</p>
          <ul className={cx("grid gap-2", !compact && "md:grid-cols-2")}>
            {IDEAS.map((x) => (
              <li key={x}><button type="button" onClick={() => takeIdea(x)}
                className="flex w-full items-center gap-2 rounded-inner bg-[#fff] px-4 py-3 text-left text-[14px] font-medium text-sub hover:bg-key-soft hover:text-key-strong"><Sparkles size={14} className="shrink-0" /> {x}</button></li>
            ))}
          </ul>
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {turns.map((t, i) => t.role === "user" ? (
          <li key={i} className="max-w-[85%] self-end whitespace-pre-wrap rounded-[14px] bg-key px-4 py-2.5 text-[14px] leading-6 text-[#fff]">{t.content}</li>
        ) : (
          <li key={i} className={cx("flex flex-col gap-2 rounded-[14px] px-4 py-3", t.error ? "bg-bad-soft text-bad" : "bg-[#fff]")}>
            {!!t.used?.length && (
              <span className="flex flex-wrap items-center gap-1.5 text-[12px]"><b className="text-mute">본 맥락</b>{t.used.map((u) => <span key={u} className="rounded-chip bg-soft px-1.5 py-px font-bold text-sub">{u}</span>)}</span>
            )}
            <div className="whitespace-pre-wrap break-words text-[14px] leading-6 text-[#333d4b]">{t.error ? t.content : showNames(t.content, aliases)}</div>
            {!t.error && (
              <span className="flex items-center gap-2 text-[12px]">
                <button type="button" onClick={() => copy(i, t.content)} className="flex items-center gap-1 rounded-control bg-soft px-2 py-1 font-bold text-sub"><Copy size={12} /> {copied === i ? "복사했어요" : "복사"}</button>
                {i === turns.length - 1 && <button type="button" onClick={retry} disabled={pending} className="flex items-center gap-1 rounded-control bg-soft px-2 py-1 font-bold text-sub"><RotateCcw size={12} /> 다시</button>}
                {t.model && <span className="ml-auto text-mute">{t.model}</span>}
              </span>
            )}
            {t.error && i === turns.length - 1 && <button type="button" onClick={retry} className="self-start text-[13px] font-bold underline">다시 보내기</button>}
          </li>
        ))}
        {pending && <li className="self-start rounded-[14px] bg-[#fff] px-4 py-3 text-[14px] text-mute">생각하는 중…</li>}
      </ol>
      <div ref={end} />
      </div>

      <div className={compact ? "relative flex flex-col gap-2 border-t border-line p-3" : "sticky bottom-[76px] z-10 flex flex-col gap-2 md:bottom-4"}>
        {shown.length > 0 && (
          <ul className={cx("max-h-[300px] overflow-y-auto rounded-[12px] border border-line bg-[#fff] p-2 shadow-lg", compact ? "absolute inset-x-3 bottom-full mb-1" : "md:w-[440px]")} role="listbox" aria-label="붙일 맥락">
            <li className="px-2 pb-1 text-[12px] font-bold text-mute">@{query} — 붙일 맥락</li>
            {shown.map((m, i) => (
              <li key={`${m.kind}-${m.id}`} role="option" aria-selected={i === active}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(m); }} onMouseEnter={() => setActive(i)}
                  className={cx("flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left", i === active && "bg-key-soft")}>
                  <span className={cx("shrink-0 rounded-chip px-1.5 py-px text-[12px] font-bold", TONE[m.kind])}>{m.kind}</span>
                  <span className="truncate text-[14px] font-medium">{m.label}</span>
                  {m.sub && <span className="ml-auto shrink-0 truncate text-[12px] text-mute">{m.sub}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {query !== null && options && !shown.length && <p className={cx("rounded-[12px] border border-line bg-[#fff] px-3 py-2 text-[13px] text-mute", compact ? "absolute inset-x-3 bottom-full mb-1" : "md:w-[440px]")}>맞는 맥락이 없어요 — 학생 이름 · 수업 · 프롬프트 제목으로 찾아요</p>}
        <div className="flex flex-col gap-2 rounded-[16px] border-2 border-key bg-[#fff] px-4 py-3">
          {picked.length > 0 && (
            <span className="flex flex-wrap gap-1.5">
              {picked.map((m) => (
                <span key={`${m.kind}-${m.id}`} className={cx("flex items-center gap-1 rounded-chip px-2 py-0.5 text-[12px] font-bold", TONE[m.kind])}>
                  @ {m.kind} {m.label}
                  <button type="button" aria-label={`${m.label} 빼기`} onClick={() => setPicked((p) => p.filter((x) => x !== m))}><X size={12} /></button>
                </span>
              ))}
            </span>
          )}
          <textarea ref={box} value={text} rows={2} maxLength={CHAT_LIMITS.message} onFocus={() => void ensureOptions()}
            onChange={(e) => onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)} onKeyDown={onKey}
            placeholder="무엇이든 시켜 보세요 · @로 학생 · 수업 · 프롬프트 붙이기" className="max-h-[40vh] min-h-[48px] resize-none bg-transparent text-[15px] leading-6 outline-none" />
          <span className="flex items-center gap-2">
            <button type="button" onClick={openAt} className="flex items-center gap-1 rounded-control bg-key-soft px-2.5 py-1 text-[13px] font-bold text-key-strong"><AtSign size={13} /> 맥락</button>
            <span className="hidden text-[12px] text-mute md:inline">Enter 보내기 · Shift+Enter 줄바꿈</span>
            {turns.length > 0 && <button type="button" onClick={() => { setTurns([]); setPicked([]); }} className="ml-auto text-[12px] font-medium text-mute hover:text-ink">새 대화</button>}
            <button type="button" onClick={() => send()} disabled={pending || !text.trim() || !aiOn} className={cx("flex items-center gap-1 rounded-control bg-key px-3.5 py-1.5 text-[13px] font-bold text-[#fff] disabled:opacity-40", turns.length === 0 && "ml-auto")}><Send size={13} /> 보내기</button>
          </span>
        </div>
      </div>
    </div>
  );
}
