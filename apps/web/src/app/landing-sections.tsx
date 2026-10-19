"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

// 상세페이지 클라이언트 조각: FAQ(분류 칩 + Q. 아코디언, 첫 질문 열림)와 모바일 메뉴.
// 유아이볼 참고: 플리더스·유광기·쿠팡·마플·원티드 FAQ

// top: "전체"에 먼저 보이는 6개 (Figma v2 FAQ)
type Faq = { cat: "선생님" | "학생" | "개인정보·AI" | "계정"; q: string; a: string; qm?: string; am?: string; top?: true };
const FAQS: Faq[] = [
  { cat: "선생님", top: true, q: "AI가 쓴 초안이 그대로 생기부에 들어가나요?", a: "아니요. 선생님이 검토하고 확정을 눌러야만 담임 선생님께 전달되고 나이스로 내보낼 수 있어요.", am: "아니요. 선생님이 확정을 눌러야만 담임 선생님께 전달되고 나이스로 내보낼 수 있어요." },
  { cat: "선생님", top: true, q: "설문 없이 제출 서류만으로도 초안을 만들 수 있나요?", qm: "제출 서류만으로도 초안을 만들 수 있나요?", a: "네. 프로그램을 등록할 때 근거 자료를 학생 제출 서류로 고르면 보고서나 활동지만으로 초안을 만들어요. 합본 PDF는 쪽 단위로 학생별로 나눌 수 있어요." },
  { cat: "선생님", top: true, q: "글자수(바이트)는 어떻게 맞추나요?", a: "초안을 만들 때 바이트나 글자 수로 분량을 정해요. NEIS 기준(한글 3바이트)으로 자동 검사하고, 한도를 넘는 값은 고를 수 없어요." },
  { cat: "선생님", q: "나이스에는 어떻게 옮기나요?", a: "확정된 기록을 복사한 뒤 나이스 화면에서 '나이스 입력' 버튼을 누르면 학생마다 한 번에 채워져요. 저장은 선생님이 직접 해요." },
  { cat: "학생", q: "올해 생활기록부도 볼 수 있나요?", a: "확정된 지난 학년도 기록만 볼 수 있어요. 올해 기록은 학년이 끝나고 확정된 뒤에 열려요." },
  { cat: "학생", q: "AI가 설문을 대신 써 주나요?", a: "아니요. 무엇을 더 쓰면 좋을지 묻는 힌트만 줘요. 설문 답은 생활기록부의 근거라서 직접 써야 해요." },
  { cat: "개인정보·AI", top: true, q: "AI에 학생 이름이 전달되나요?", a: "아니요. 이름과 학번 대신 S001 같은 가명ID만 보내요. 제출 서류 속 이름도 보내기 전에 가려요." },
  { cat: "개인정보·AI", top: true, q: "상담 기록은 누가 볼 수 있나요?", a: "기록을 쓴 선생님, 그 학생의 담임 선생님, 관리자만 볼 수 있어요. 학생은 볼 수 없어요." },
  { cat: "개인정보·AI", q: "기록을 고치면 이전 내용은 사라지나요?", a: "고칠 때마다 새 버전이 쌓이고 이전 버전은 남아요. 누가 언제 무엇을 했는지는 감사 로그에 기록돼요." },
  { cat: "계정", q: "처음 로그인은 어떻게 하나요?", a: "학생은 학번, 선생님은 이름과 학교에서 받은 인증코드로 로그인한 뒤 새 비밀번호를 정해요." },
  { cat: "계정", top: true, q: "선생님 계정은 어떻게 만드나요?", a: "선생님 가입에서 학교 인증코드로 가입해요. 맨 처음 가입한 선생님이 관리자가 되고, 이후 역할은 관리자가 정해요." },
  { cat: "계정", q: "비밀번호를 잊었어요.", a: "담임 선생님이나 관리자 선생님께 초기화를 요청하세요. 5번 틀리면 10분 동안 잠겨요." },
];
const CATS = ["전체", "선생님", "학생", "개인정보·AI", "계정"] as const;

export function FaqList() {
  const [cat, setCat] = useState<(typeof CATS)[number]>("전체");
  const [open, setOpen] = useState(0);
  const list = FAQS.filter((f) => (cat === "전체" ? f.top : f.cat === cat));
  return (
    <div className="mx-auto mt-10 max-w-[860px] text-left md:mt-14">
      <div className="flex flex-wrap justify-center gap-1.5 md:gap-2">
        {CATS.map((c) => (
          <button key={c} onClick={() => { setCat(c); setOpen(0); }}
            className={`whitespace-nowrap rounded-control px-[11px] py-1.5 text-[13px] font-bold md:px-4 md:py-2 md:text-[14px] ${c === cat ? "bg-ink text-white" : "bg-white text-sub hover:text-ink"}`}>
            {c}
          </button>
        ))}
      </div>
      <ul className="mt-8 flex flex-col gap-2.5">
        {list.map((f, i) => {
          const isOpen = i === open;
          return (
            <li key={f.q} className="n30-faq rounded-inner bg-white">
              <button onClick={() => setOpen(isOpen ? -1 : i)} aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-5 py-5 text-left md:px-7">
                <span className="shrink-0 text-[16px] font-bold text-key">Q.</span>
                <span className="n30-t flex-1 text-[15px] font-bold md:text-[16px]"><span className="md:hidden">{f.qm ?? f.q}</span><span className="hidden md:inline">{f.q}</span></span>
                <ChevronDown size={20} className={`n30-chev shrink-0 text-mute ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && <p className="px-5 pb-5 pl-[52px] text-[14px] leading-relaxed text-sub md:px-7 md:pl-[60px] md:text-[15px]"><span className="md:hidden">{f.am ?? f.a}</span><span className="hidden md:inline">{f.a}</span></p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- 모바일 "메뉴" (Figma B안 Mobile Nav) ---------- */
export function MobileMenu({ links }: { links: [string, string][] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-auto lg:hidden">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="whitespace-nowrap px-1 py-2 text-[15px] text-[#c4cad1]">{open ? "닫기" : "메뉴"}</button>
      {open && (
        <div className="absolute inset-x-0 top-full border-t border-white/10 bg-[#0a0b12] px-4 pb-5 pt-2">
          {links.map(([l, h]) => (
            <a key={h} href={h} onClick={() => setOpen(false)} className="block border-b border-white/10 py-3.5 text-[16px] text-[#c4cad1]">{l}</a>
          ))}
          <div className="mt-4 flex gap-2">
            <Link href="/login" className="flex-1 whitespace-nowrap rounded-control bg-key py-3 text-center text-[15px] font-bold text-white">로그인</Link>
            <Link href="/signup" className="flex-1 whitespace-nowrap rounded-control border border-white/20 py-3 text-center text-[15px] font-bold text-white">선생님 가입</Link>
          </div>
        </div>
      )}
    </div>
  );
}
