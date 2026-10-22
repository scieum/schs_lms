"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { BookOpen, Maximize2, Send, X } from "lucide-react";
import { AiWorkspace } from "@/app/(app)/ai/workspace";
import { askYeongrang } from "./yeongrang-actions";

// 영랑이: 오른쪽 아래 검정 원형 버튼 → 사용법 문의 / AI로 만들기 (Figma "영랑이 · AI 도우미" Y1~Y4).
// 결과는 초안으로만 보여 주고 자동으로 보내지 않는다. 학생은 사용법 문의만 (대신 써 주지 않음).

const QUICK_T = ["합본 PDF는 어떻게 나눠요?", "초안 분량은 어디서 정해요?", "나이스에는 어떻게 옮겨요?"];
const QUICK_S = ["서류는 어디서 내요?", "비밀번호를 잊었어요", "생활기록부는 언제 볼 수 있어요?"];

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

// 교사: 첫 탭 "AI 작업" = AI 작업창과 같은 것(@ 맥락 · 노션 AI처럼), 둘째 탭 "사용법 문의". 학생은 사용법 문의만.
export function Yeongrang({ student = false, aiOn = false }: { student?: boolean; aiOn?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"ai" | "ask">("ai");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs, pending]);
  // 노션처럼 오른쪽 사이드 창 (2026-10-22): 열리면 PC 본문이 창 폭만큼 비켜 선다(globals.css body[data-yr]) · Esc 로 닫기
  useEffect(() => {
    document.body.dataset.yr = open ? "open" : "";
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.dataset.yr = ""; };
  }, [open]);

  const ask = (q: string) => {
    if (!q.trim() || pending) return;
    setText("");
    start(async () => {
      const a = await askYeongrang(q, msgs.map((m) => ({ q: m.q, a: m.a })));
      setMsgs((m) => [...m, { q, a: a.text, source: a.source, href: a.href, ai: a.ai }]);
    });
  };
  const reset = () => setMsgs([]);

  return (
    <>
      {/* 닫아도 숨기기만 — AI 작업 대화가 남아 다시 열면 이어서 */}
      {(
        <aside aria-label="영랑이" aria-hidden={!open} className={`yr-side fixed inset-0 z-40 ${open ? "flex" : "hidden"} flex-col bg-white md:inset-y-0 md:left-auto md:right-0 md:h-dvh md:w-[var(--yr-w)] md:border-l md:border-line md:shadow-[-12px_0_32px_rgba(28,32,51,0.08)]`}>
          <header className="flex items-center gap-2.5 border-b border-line px-5 py-4">
            <span className="relative size-9 overflow-hidden rounded-full bg-ink">
              <Image src="/yeongrang.png" alt="" fill sizes="36px" className="translate-y-1 scale-125 object-contain" />
            </span>
            <strong className="text-base">영랑이</strong>
            <span className="rounded-chip bg-new-soft px-2 py-0.5 text-xs font-bold text-new">AI</span>
            <button onClick={reset} className="ml-auto rounded-control px-2 py-1 text-[13px] text-sub hover:bg-soft">새 대화</button>
            {!student && <Link href="/ai" onClick={() => setOpen(false)} title="AI 작업창에서 크게 (@ 맥락 붙이기)" aria-label="AI 작업창에서 크게" className="rounded-full p-1.5 text-sub hover:bg-soft"><Maximize2 size={18} /></Link>}
            <button onClick={() => setOpen(false)} aria-label="닫기" className="rounded-full p-1.5 text-sub hover:bg-soft"><X size={22} /></button>
          </header>

          {!student && (
            <div className="flex gap-1 border-b border-line px-5 pt-2" role="tablist">
              {([["ai", "AI 작업"], ["ask", "사용법 문의"]] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`-mb-px border-b-2 px-3 pb-2.5 pt-1 text-[14px] ${tab === k ? "border-key font-bold text-ink" : "border-transparent text-mute"}`}>{l}</button>
              ))}
            </div>
          )}

          {!student && tab === "ai" ? (
            // 닫아도 대화가 남게 숨기기만 (영랑이를 다시 열면 이어서)
            <AiWorkspace aiOn={aiOn} compact />
          ) : (
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
          )}
        </aside>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "영랑이 닫기" : "영랑이에게 물어보기"}
        className={`fixed bottom-[92px] right-4 z-50 size-14 overflow-hidden rounded-full bg-ink md:bottom-8 md:right-8 md:size-16 [body:has([data-sticky-cta])_&]:bottom-[156px] md:[body:has([data-sticky-cta])_&]:bottom-8 ${open ? "hidden" : ""}`}
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
