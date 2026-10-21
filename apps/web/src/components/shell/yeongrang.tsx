"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { BookOpen, Copy, RotateCcw, Send, X } from "lucide-react";
import { askYeongrang, makeWithYeongrang } from "./yeongrang-actions";

// 영랑이: 오른쪽 아래 검정 원형 버튼 → 사용법 문의 / AI로 만들기 (Figma "영랑이 · AI 도우미" Y1~Y4).
// 결과는 초안으로만 보여 주고 자동으로 보내지 않는다. 학생은 사용법 문의만 (대신 써 주지 않음).

const KINDS = ["안내 문자", "가정통신문", "상담 요약", "회의 메모 정리"] as const;
const QUICK_T = ["합본 PDF는 어떻게 나눠요?", "초안 분량은 어디서 정해요?", "나이스에는 어떻게 옮겨요?"];
const QUICK_S = ["설문은 어디서 내요?", "비밀번호를 잊었어요", "생활기록부는 언제 볼 수 있어요?"];

type Msg = { q: string; a: string; source: string | null; href: string | null; ai: boolean };

/** 사이드바 "사용 가이드" 카드: 사용 매뉴얼(/manual, 새 탭)을 연다 — 학생은 학생 화면 부분부터 */
export function GuideButton({ mini = false, student = false }: { mini?: boolean; student?: boolean }) {
  const href = `/manual/index.html${student ? "#student" : ""}`;
  // 접힌 사이드바: 아이콘 + 작은 글씨
  if (mini) {
    return (
      <a href={href} target="_blank" rel="noopener" className="flex w-full flex-col items-center gap-0.5 rounded-control px-1 py-2 text-[11px] text-mute hover:bg-soft">
        <BookOpen size={18} strokeWidth={1.8} /> 가이드
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener" className="mt-3 block w-full rounded-control border border-hair bg-white py-2 text-center text-[13px] font-medium hover:bg-soft">
      가이드 보기
    </a>
  );
}

export function Yeongrang({ student = false }: { student?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"ask" | "make">("ask");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("안내 문자");
  const [memo, setMemo] = useState("");
  const [draft, setDraft] = useState<{ text: string; ai: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs, pending]);

  const ask = (q: string) => {
    if (!q.trim() || pending) return;
    setText("");
    start(async () => {
      const a = await askYeongrang(q, msgs.map((m) => ({ q: m.q, a: m.a })));
      setMsgs((m) => [...m, { q, a: a.text, source: a.source, href: a.href, ai: a.ai }]);
    });
  };
  const make = () => {
    if (pending) return;
    setError(null);
    start(async () => {
      const r = await makeWithYeongrang(kind, memo);
      if (r.ok) setDraft({ text: r.text, ai: r.ai });
      else setError(r.error);
    });
  };
  const reset = () => { setMsgs([]); setDraft(null); setMemo(""); setError(null); };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-white md:inset-auto md:bottom-28 md:right-8 md:h-[640px] md:w-[420px] md:rounded-card md:border md:border-hair md:shadow-[0_12px_40px_rgba(28,32,51,0.14)]">
          <header className="flex items-center gap-2.5 border-b border-line px-5 py-4">
            <span className="relative size-9 overflow-hidden rounded-full bg-ink">
              <Image src="/yeongrang.png" alt="" fill sizes="36px" className="translate-y-1 scale-125 object-contain" />
            </span>
            <strong className="text-base">영랑이</strong>
            <span className="rounded-chip bg-new-soft px-2 py-0.5 text-xs font-bold text-new">AI</span>
            <button onClick={reset} className="ml-auto rounded-control px-2 py-1 text-[13px] text-sub hover:bg-soft">새 대화</button>
            <button onClick={() => setOpen(false)} aria-label="닫기" className="rounded-full p-1.5 text-sub hover:bg-soft"><X size={22} /></button>
          </header>

          {!student && (
            <div className="flex gap-1 border-b border-line px-5 pt-2" role="tablist">
              {([["ask", "사용법 문의"], ["make", "AI로 만들기"]] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`-mb-px border-b-2 px-3 pb-2.5 pt-1 text-[14px] ${tab === k ? "border-key font-bold text-ink" : "border-transparent text-mute"}`}>{l}</button>
              ))}
            </div>
          )}

          {tab === "ask" || student ? (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                <p className="w-fit max-w-[88%] rounded-inner bg-soft px-4 py-3 text-sm">무엇이 궁금하세요? 화면 사용법을 알려 드릴게요.</p>
                {student && msgs.length === 0 && (
                  <p className="rounded-inner border border-line px-4 py-3 text-[12px] leading-relaxed text-sub">이름·학번은 보내지 않아요 · 대화는 저장하지 않아요 · 설문이나 생활기록부를 대신 써 주지는 않아요</p>
                )}
                {msgs.length === 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(student ? QUICK_S : QUICK_T).map((q) => (
                      <button key={q} onClick={() => ask(q)} className="rounded-control border border-hair px-3 py-2 text-[13px] text-sub hover:bg-soft">{q}</button>
                    ))}
                  </div>
                )}
                {msgs.map((m, i) => (
                  <div key={i} className="space-y-2">
                    <p className="ml-auto w-fit max-w-[85%] rounded-inner bg-key px-4 py-3 text-sm text-white">{m.q}</p>
                    <div className="w-fit max-w-[90%] rounded-inner bg-soft px-4 py-3 text-sm leading-relaxed">
                      {m.a}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                        {m.source && <span className="rounded-chip bg-white px-2 py-1 text-sub">{m.source}</span>}
                        {m.href && <Link href={m.href} onClick={() => setOpen(false)} className="rounded-chip bg-key-soft px-2 py-1 font-medium text-key-strong">바로 가기</Link>}
                        {!m.ai && <span className="text-mute">자동</span>}
                      </div>
                    </div>
                  </div>
                ))}
                {pending && <p className="w-fit rounded-inner bg-soft px-4 py-3 text-sm text-mute">찾는 중이에요…</p>}
                <div ref={end} />
              </div>
              <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="flex items-center gap-2 border-t border-line p-3">
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="사용법을 물어보세요" maxLength={500}
                  className="flex-1 rounded-field bg-soft px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-key" />
                <button disabled={pending || !text.trim()} aria-label="보내기" className="flex size-11 items-center justify-center rounded-control bg-key text-white disabled:bg-faint"><Send size={18} /></button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              <div className="flex flex-wrap gap-1.5">
                {KINDS.map((k) => (
                  <button key={k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1.5 text-[13px] ${kind === k ? "bg-ink font-bold text-white" : "bg-soft text-sub"}`}>{k}</button>
                ))}
              </div>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={5} maxLength={3000}
                placeholder={kind === "안내 문자" ? "예: 10.20(화)까지 과학 탐구 발표 설문 제출, 미제출 5명" : "들어갈 내용을 메모처럼 적어 주세요"}
                className="rounded-field bg-soft px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-key" />
              <button onClick={make} disabled={pending || memo.trim().length < 5} className="rounded-control border border-hair bg-white py-2.5 text-sm font-medium hover:bg-soft disabled:text-faint">
                {pending ? "만드는 중이에요…" : "초안 만들기"}
              </button>
              {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
              {draft && (
                <div className="rounded-inner border border-line p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-chip bg-new-soft px-2 py-0.5 text-xs font-bold text-new">초안</span>
                    <span className="text-[12px] text-mute">확인하고 고쳐서 쓰세요 · 자동으로 보내지 않아요</span>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed">{draft.text}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => { navigator.clipboard.writeText(draft.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                      className="flex items-center gap-1 rounded-control border border-hair px-3 py-1.5 text-[13px] hover:bg-soft"><Copy size={14} /> {copied ? "복사했어요" : "복사"}</button>
                    <button onClick={make} className="flex items-center gap-1 rounded-control border border-hair px-3 py-1.5 text-[13px] hover:bg-soft"><RotateCcw size={14} /> 다시 쓰기</button>
                  </div>
                </div>
              )}
              <p className="mt-auto text-[12px] text-mute">학생 이름·학번은 가린 뒤 AI에 보내요.</p>
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "영랑이 닫기" : "영랑이에게 물어보기"}
        className="fixed bottom-[92px] right-4 z-50 size-14 overflow-hidden rounded-full bg-ink md:bottom-8 md:right-8 md:size-16 [body:has([data-sticky-cta])_&]:bottom-[156px] md:[body:has([data-sticky-cta])_&]:bottom-8"
      >
        {open ? (
          <X className="m-auto text-white" size={26} />
        ) : (
          <Image src="/yeongrang.png" alt="" fill sizes="64px" className="translate-x-0.5 translate-y-1.5 scale-125 object-contain" />
        )}
      </button>
    </>
  );
}
