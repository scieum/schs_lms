"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

// 상세페이지 클라이언트 조각: FAQ(분류 칩 + Q. 아코디언, 첫 질문 열림), "새로" 표시, 모바일 메뉴.
// 유아이볼 참고: 플리더스·유광기·쿠팡·마플·원티드 FAQ

// top: "전체"에 먼저 보이는 6개 (Figma v2 FAQ)
type Faq = { cat: "선생님" | "학생" | "개인정보·AI" | "계정"; q: string; a: string; qm?: string; am?: string; top?: true };
const FAQS: Faq[] = [
  { cat: "선생님", top: true, q: "조각이 뭐예요?", a: "학생에게서 본 것 한두 줄이에요. 수업 메모, 활동 자료 요약, 수행평가 요약, 공통 활동, 차시 메모가 모두 조각이 되고, 글 짓기에서 골라 한 편의 생기부 글로 엮어요." },
  { cat: "개인정보·AI", top: true, q: "올린 자료 파일은 저장되나요?", a: "아니요. AI가 읽은 요약만 조각으로 남고 파일은 저장하지 않아요. 파일 속 이름 · 학번도 가린 뒤 AI에 보내요." },
  { cat: "선생님", q: "한글 · 엑셀에 써 둔 생기부도 옮길 수 있나요?", a: "네. 글 모아 보기의 '엑셀로 올리기'에서 양식(그 반 학번 · 이름이 채워짐)에 글을 붙여 넣어 올리면 학생마다 임시 저장으로 들어가요. 확정은 선생님이 글 짓기에서 해요." },
  { cat: "선생님", top: true, q: "AI가 쓴 초안이 그대로 생기부에 들어가나요?", a: "아니요. 선생님이 검토하고 확정을 눌러야만 담임 선생님께 전달되고 나이스로 내보낼 수 있어요.", am: "아니요. 선생님이 확정을 눌러야만 담임 선생님께 전달되고 나이스로 내보낼 수 있어요." },
  { cat: "선생님", top: true, q: "학생이 낸 서류로 초안을 만들 수 있나요?", a: "네. 특색활동 프로그램에서 학생 제출 서류(보고서 · 활동지 · 소감문)를 근거로 학생마다 초안을 만들어요. 합본 PDF는 쪽 단위로 학생별로 나눌 수 있어요." },
  { cat: "선생님", top: true, q: "글자수(바이트)는 어떻게 맞추나요?", a: "글 짓기에서 목표(예: 1,500B)와 오차(±50B)를 정하면 AI가 그 안에 맞춰 써요. 게이트가 분량과 빠진 조각을 다시 맞추고, NEIS 기준(한글 3바이트)으로 검사해요." },
  { cat: "선생님", q: "나이스에는 어떻게 옮기나요?", a: "나이스 입력 화면에서 반 · 분반마다 확정된 기록을 복사한 뒤, 나이스 화면에서 '나이스 입력' 버튼을 누르면 학생마다 한 번에 채워져요. 저장은 선생님이 직접 해요." },
  { cat: "선생님", top: true, q: "다른 선생님과 같이 준비할 수 있나요?", a: "네. 사이드바 '협업'에서 협업방을 만들고 선생님을 초대해요. 동학년부가 아니어도, 교과가 달라도 돼요. 메모 · 수행평가 · 차시 · 프롬프트 · 자료를 나누고, 수행평가 등록 창에서 바로 가져올 수 있어요." },
  { cat: "선생님", q: "AI가 쓰는 프롬프트를 바꿀 수 있나요?", a: "네. 도구 › 프롬프트 보관함에서 과목별 공식 프롬프트와 선생님들이 공유한 프롬프트(★ 추천순)를 보고 '내 스타일에 넣기'를 누르면 글 짓기에 바로 쓰여요." },
  { cat: "선생님", q: "쓰다가 막히면 어디에 묻나요?", a: "도구 › 문의 게시판에 올려 주세요. 교육과정부가 답하고, 답은 게시판에 쌓여 다른 선생님도 찾아볼 수 있어요." },
  { cat: "학생", q: "올해 생활기록부도 볼 수 있나요?", a: "확정된 지난 학년도 기록만 볼 수 있어요. 올해 기록은 학년이 끝나고 확정된 뒤에 열려요." },
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


/* ---------- "새로" 표시 — 기능 한눈에 보기(/features, features/feature-list.tsx)와 같이 쓴다 ---------- */
export function New() {
  return <span className="shrink-0 rounded-[4px] bg-key-soft px-1.5 py-px text-[11px] font-bold leading-[1.5] text-key-strong">새로</span>;
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
