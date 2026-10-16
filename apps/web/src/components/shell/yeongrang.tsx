"use client";
import Image from "next/image";
import { useState } from "react";
import { X } from "lucide-react";

// 영랑이: 오른쪽 아래 검정 원형 버튼. 지금은 사용법 바로가기만 있고,
// Claude 대화(사용법 문의·AI로 만들기)는 다음 단계에서 붙인다.
const FAQ = [
  ["첫 로그인 비밀번호는 어떻게 바꿔요?", "처음 로그인하면 바꾸는 화면이 자동으로 나와요."],
  ["학생을 여러 명 등록하려면?", "학생 등록 → 엑셀로 여러 명 → 양식을 받아 채운 뒤 올려요."],
  ["비밀번호를 잊어버렸어요", "관리자 선생님께 초기화를 요청해 주세요."],
];

export function Yeongrang() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-white md:inset-auto md:bottom-28 md:right-8 md:h-[560px] md:w-[400px] md:rounded-card md:border md:border-hair md:shadow-[0_12px_40px_rgba(28,32,51,0.14)]">
          <header className="flex items-center gap-2.5 border-b border-line px-5 py-4">
            <span className="relative size-9 overflow-hidden rounded-full bg-ink">
              <Image src="/yeongrang.png" alt="" fill sizes="36px" className="translate-y-1 scale-125 object-contain" />
            </span>
            <strong className="text-base">영랑이</strong>
            <span className="rounded-chip bg-new-soft px-2 py-0.5 text-xs font-bold text-new">AI</span>
            <button onClick={() => setOpen(false)} aria-label="닫기" className="ml-auto rounded-full p-1.5 text-sub hover:bg-soft">
              <X size={22} />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <p className="rounded-inner rounded-tl-sm bg-soft px-4 py-3 text-sm">무엇이 궁금하세요?</p>
            {FAQ.map(([q, a]) => (
              <details key={q} className="rounded-inner border border-line px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium">{q}</summary>
                <p className="mt-2 text-sub">{a}</p>
              </details>
            ))}
          </div>
          <p className="border-t border-line px-5 py-3 text-xs text-mute">AI 대화는 곧 열려요</p>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "영랑이 닫기" : "영랑이에게 물어보기"}
        className="fixed bottom-[92px] right-4 z-50 size-14 overflow-hidden rounded-full bg-ink md:bottom-8 md:right-8 md:size-16"
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
