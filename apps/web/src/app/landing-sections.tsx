"use client";
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";

// 상세페이지 추가 섹션 (2026-10-16, 유아이볼 참고: MS Clarity·채널톡 기능 탭, 플리더스·유광기·쿠팡·마플·원티드 FAQ)
// Features: 영역 탭 → 왼쪽 기능 목록 + 오른쪽 미니 화면. FAQ: 분류 칩 + Q. 아코디언(첫 질문 열림).

type Feature = { title: string; line: string; ai?: boolean };
type Group = { key: string; label: string; items: Feature[]; mock: () => React.ReactNode };

const tag = (t: string, tone: string) => <span className={`rounded-chip px-2 py-1 text-[12px] font-bold ${tone}`}>{t}</span>;

function MockRecord() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between"><span className="text-[15px] font-bold">교과 세특 · 물리학</span>{tag("AI 초안", "bg-new-soft text-new")}</div>
      <div className="rounded-inner bg-white p-4 text-[13px] leading-relaxed text-sub">빗면의 각도를 바꿔 가며 가속도를 측정하고 오차 원인을 마찰과 측정 한계로 나누어 실험 설계를 정교화함.</div>
      <div className="flex flex-wrap gap-2">{tag("글자수 범위", "bg-ok-soft text-ok")}{tag("학번·실명 0건", "bg-ok-soft text-ok")}{tag("문체 규칙", "bg-ok-soft text-ok")}</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full w-[82%] rounded-full bg-key" /></div>
      <div className="flex justify-end text-[12px] font-bold text-sub">1,236 / 1,500B</div>
    </div>
  );
}
function MockScores() {
  const bars = [3.3, 3.1, 3.0, 2.8, 2.6, 2.3];
  return (
    <div className="flex flex-col gap-4">
      <span className="text-[15px] font-bold">모의고사 평균 등급</span>
      <div className="flex h-32 items-end gap-2.5">
        {bars.map((b, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className={`text-[11px] ${i === bars.length - 1 ? "font-bold text-ink" : "text-mute"}`}>{b}</span>
            <div className={`w-full rounded-chip ${i === bars.length - 1 ? "bg-key" : "bg-[#C2CAFF]"}`} style={{ height: `${(4.2 - b) * 52}px` }} />
          </div>
        ))}
      </div>
      {[["A대 산업디자인", "충족", "bg-ok-soft text-ok"], ["C대 시각디자인", "수학 1등급 더", "bg-wait-soft text-wait"]].map(([u, t, c]) => (
        <div key={u} className="flex items-center justify-between rounded-inner bg-white px-4 py-3 text-[13px] font-medium">{u}{tag(t, c)}</div>
      ))}
    </div>
  );
}
function MockLife() {
  return (
    <div className="flex flex-col gap-4">
      <span className="text-[15px] font-bold">다음 주 야자 신청</span>
      <div className="grid grid-cols-5 gap-2">
        {["월", "화", "수", "목", "금"].map((d, i) => (
          <span key={d} className={`rounded-control py-2.5 text-center text-[13px] font-bold ${[0, 2, 3].includes(i) ? "bg-key text-white" : "bg-white text-sub"}`}>{d}</span>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-inner bg-white px-4 py-3 text-[13px] font-medium">1·2교시 연속 · 자습실 A {tag("잔여 12석", "bg-key-soft text-key-strong")}</div>
      <span className="pt-1 text-[15px] font-bold">2학기 과목 신청</span>
      <div className="flex items-center justify-between rounded-inner bg-white px-4 py-3 text-[13px] font-medium">미술 창작 · 기하 · 정보 {tag("10 / 16학점", "bg-key-soft text-key-strong")}</div>
    </div>
  );
}
function MockAdmin() {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="pb-1 text-[15px] font-bold">초안 생성 현황</span>
      {[["S1 수집", "5"], ["S2 초안", "3"], ["S4 확정", "41"], ["S5 전달", "30"]].map(([s, n]) => (
        <div key={s} className="flex items-center justify-between rounded-inner bg-white px-4 py-3 text-[13px] font-medium"><span>{s}</span><b className="tabular-nums">{n}건</b></div>
      ))}
      <div className="flex items-center justify-between rounded-inner bg-white px-4 py-3 text-[13px] font-medium">최지우 · 과학 탐구 발표 {tag("실패", "bg-bad-soft text-bad")}</div>
    </div>
  );
}

const GROUPS: Group[] = [
  { key: "record", label: "생활기록부", mock: MockRecord, items: [
    { title: "교과 세특", line: "편제표와 내 과목 기준으로 반별로 쓰고 확정" },
    { title: "누가기록", line: "동아리·자율·진로 기록을 날짜별로 쌓기" },
    { title: "AI 기록 쓰기", line: "세특·특기사항·행발 초안을 교과별 프롬프트로", ai: true },
    { title: "봉사 확인서", line: "사진을 올리면 읽어서 담임에게 바로 전달", ai: true },
    { title: "나이스 입력 도우미", line: "확정본을 열린 나이스 화면에 채워 넣기" },
  ] },
  { key: "scores", label: "성적·입시", mock: MockScores, items: [
    { title: "성적 업로드", line: "엑셀이나 성적표 사진으로 반 성적 올리기", ai: true },
    { title: "수능 최저 판정", line: "대학별 기준으로 충족·근접·미충족을 한 번에" },
    { title: "목표 대학", line: "학생이 고른 대학 기준을 바로 확인" },
    { title: "상담 기록", line: "쓴 사람과 담임만 보는 상담 기록과 AI 요약", ai: true },
  ] },
  { key: "life", label: "학교생활", mock: MockLife, items: [
    { title: "설문·서류 제출", line: "D-day 알림부터 제출까지 학생 홈에서" },
    { title: "야간 자율학습", line: "요일·교시 신청, 출석 체크, 변경 승인" },
    { title: "과목 신청", line: "학점과 정원을 확인하며 담고 신청" },
    { title: "추천 활동", line: "희망 진로에 맞는 도서·대회·특강", ai: true },
  ] },
  { key: "admin", label: "학교 관리", mock: MockAdmin, items: [
    { title: "계정·가입", line: "첫 가입자가 관리자, 비밀번호 초기화와 잠금" },
    { title: "프로그램 등록", line: "계획서·기안문을 올리면 AI가 칸을 채워요", ai: true },
    { title: "편제표", line: "2022 개정 과목을 학년·학기별로 관리" },
    { title: "초안 현황·감사 로그", line: "실패한 초안과 누가 무엇을 했는지 한눈에" },
  ] },
];

export function FeatureTabs() {
  const [active, setActive] = useState(0);
  const g = GROUPS[active];
  return (
    <div className="mt-12 md:mt-[70px]">
      <div className="flex justify-center">
        <div className="flex gap-1 overflow-x-auto rounded-full bg-soft p-1" role="tablist">
          {GROUPS.map((x, i) => (
            <button key={x.key} role="tab" aria-selected={i === active} onClick={() => setActive(i)}
              className={`shrink-0 rounded-full px-4 py-2.5 text-[14px] font-bold md:px-6 md:text-[15px] ${i === active ? "bg-white text-ink" : "text-mute hover:text-sub"}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-8 grid gap-5 text-left md:grid-cols-2 md:gap-8" role="tabpanel">
        <ul className="flex flex-col gap-2.5">
          {g.items.map((f) => (
            <li key={f.title} className="flex items-center gap-4 rounded-inner bg-soft px-5 py-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-white text-key"><Check size={18} strokeWidth={2.5} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-bold">{f.title}</div>
                <div className="mt-0.5 text-[13px] text-sub">{f.line}</div>
              </div>
              {f.ai && <span className="shrink-0 rounded-chip bg-new-soft px-2 py-1 text-[12px] font-bold text-new">AI</span>}
            </li>
          ))}
        </ul>
        <div className="hidden rounded-card bg-soft p-6 md:block md:p-8">{g.mock()}</div>
      </div>
    </div>
  );
}

type Faq = { cat: "선생님" | "학생" | "개인정보·AI" | "계정"; q: string; a: string };
const FAQS: Faq[] = [
  { cat: "선생님", q: "AI가 쓴 초안이 그대로 생기부에 들어가나요?", a: "아니요. 선생님이 검토하고 확정을 눌러야만 담임 선생님께 전달되고 나이스로 내보낼 수 있어요." },
  { cat: "선생님", q: "설문 없이 제출 서류만으로도 초안을 만들 수 있나요?", a: "네. 프로그램을 등록할 때 근거 자료를 학생 제출 서류로 고르면 보고서나 활동지만으로 초안을 만들어요. 합본 PDF는 쪽 단위로 학생별로 나눌 수 있어요." },
  { cat: "선생님", q: "글자수(바이트)는 어떻게 맞추나요?", a: "초안을 만들 때 바이트나 글자 수로 분량을 정해요. NEIS 기준(한글 3바이트)으로 자동 검사하고, 한도를 넘는 값은 고를 수 없어요." },
  { cat: "선생님", q: "나이스에는 어떻게 옮기나요?", a: "확정된 기록을 내보낸 뒤 나이스 입력 도우미(크롬 확장)로 열려 있는 나이스 화면에 채워요. 저장 버튼은 선생님이 직접 눌러요." },
  { cat: "학생", q: "올해 생활기록부도 볼 수 있나요?", a: "확정된 지난 학년도 기록만 볼 수 있어요. 올해 기록은 학년이 끝나고 확정된 뒤에 열려요." },
  { cat: "학생", q: "AI가 설문을 대신 써 주나요?", a: "아니요. 무엇을 더 쓰면 좋을지 묻는 힌트만 줘요. 설문 답은 생활기록부의 근거라서 직접 써야 해요." },
  { cat: "개인정보·AI", q: "AI에 학생 이름이 전달되나요?", a: "아니요. 이름과 학번 대신 S001 같은 가명ID만 보내요. 제출 서류 속 이름도 보내기 전에 가려요." },
  { cat: "개인정보·AI", q: "상담 기록은 누가 볼 수 있나요?", a: "기록을 쓴 선생님, 그 학생의 담임 선생님, 관리자만 볼 수 있어요. 학생은 볼 수 없어요." },
  { cat: "개인정보·AI", q: "기록을 고치면 이전 내용은 사라지나요?", a: "고칠 때마다 새 버전이 쌓이고 이전 버전은 남아요. 누가 언제 무엇을 했는지는 감사 로그에 기록돼요." },
  { cat: "계정", q: "처음 로그인은 어떻게 하나요?", a: "학생은 학번, 선생님은 이름과 학교에서 받은 인증코드로 로그인한 뒤 새 비밀번호를 정해요." },
  { cat: "계정", q: "선생님 계정은 어떻게 만드나요?", a: "선생님 가입에서 학교 인증코드로 가입해요. 맨 처음 가입한 선생님이 관리자가 되고, 이후 역할은 관리자가 정해요." },
  { cat: "계정", q: "비밀번호를 잊었어요.", a: "담임 선생님이나 관리자 선생님께 초기화를 요청하세요. 5번 틀리면 10분 동안 잠겨요." },
];
const CATS = ["전체", "선생님", "학생", "개인정보·AI", "계정"] as const;

export function FaqList() {
  const [cat, setCat] = useState<(typeof CATS)[number]>("전체");
  const [open, setOpen] = useState(0);
  const list = FAQS.filter((f) => cat === "전체" || f.cat === cat);
  return (
    <div className="mx-auto mt-10 max-w-[860px] text-left md:mt-14">
      <div className="flex flex-wrap justify-center gap-2">
        {CATS.map((c) => (
          <button key={c} onClick={() => { setCat(c); setOpen(0); }}
            className={`rounded-control px-4 py-2 text-[14px] font-bold ${c === cat ? "bg-ink text-white" : "bg-white text-sub hover:text-ink"}`}>
            {c}
          </button>
        ))}
      </div>
      <ul className="mt-8 flex flex-col gap-2.5">
        {list.map((f, i) => {
          const isOpen = i === open;
          return (
            <li key={f.q} className="rounded-inner bg-white">
              <button onClick={() => setOpen(isOpen ? -1 : i)} aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-5 py-5 text-left md:px-7">
                <span className="shrink-0 text-[16px] font-bold text-key">Q.</span>
                <span className="flex-1 text-[15px] font-bold md:text-[16px]">{f.q}</span>
                <ChevronDown size={20} className={`shrink-0 text-mute transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && <p className="px-5 pb-5 pl-[52px] text-[14px] leading-relaxed text-sub md:px-7 md:pl-[60px] md:text-[15px]">{f.a}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
