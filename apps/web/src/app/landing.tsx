import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, BookOpen, CheckCircle2, ClipboardList, FileText, GraduationCap, Lock, MessageCircle, Moon, PenLine, ShieldCheck, Sparkles, TrendingUp, Users,
} from "lucide-react";

// 상세페이지 (Figma "상세페이지 시안" B안 인디고). 로그인 전 첫 화면.
const NAV = [["서비스 소개", "#problem"], ["이용 흐름", "#process"], ["역할별 기능", "#roles"], ["안심 설계", "#safety"]];

const PROBLEMS = [
  { tag: "Form", title: "구글 설문지", desc: "프로그램마다 새로 만들고 명단과 대조" },
  { tag: "HWP", title: "생기부_초안_최종_진짜최종.hwp", desc: "응답 옮겨 적고 글자수 직접 세기" },
  { tag: "Memo", title: "선생님 개인 메모", desc: "상담 기록은 쓴 사람만 알아요" },
];

const STEPS = [
  { who: "선생님", title: "공통 설문 바로 발행", icon: ClipboardList },
  { who: "학생", title: "홈에서 바로 응답", icon: PenLine },
  { who: "AI", title: "창체·진로·세특 초안 작성", icon: Sparkles },
  { who: "선생님", title: "확정하면 담임도 바로 열람", icon: CheckCircle2 },
];

const ROLES = [
  { role: "학생", icon: GraduationCap, items: ["D-day 설문 알림", "성적 추이·수능 최저", "전년도 생기부 열람", "야자·과목 신청"] },
  { role: "교과·프로그램 교사", icon: BookOpen, items: ["교과 세특 작성", "동아리 누가기록", "초안 검토·확정", "봉사 확인서 전달"] },
  { role: "담임교사", icon: Users, items: ["반 학생 통합 보기", "자율·진로 누가기록", "봉사 확인서 받기", "최저 판정 일괄 보기"] },
  { role: "관리자", icon: ShieldCheck, items: ["명부·계정 관리", "편제표 관리", "초안 생성 모니터", "감사 로그"] },
];

const SAFETY = [
  { title: "확정 버튼은 선생님만", icon: CheckCircle2 },
  { title: "상담 기록은 필요한 사람만", icon: Lock },
  { title: "고쳐도 기록은 남아요", icon: FileText },
  { title: "NEIS 글자수 자동 체크", icon: ShieldCheck },
];

const MORE = [
  { tag: "성적", title: "성적 추이 한눈에", icon: TrendingUp },
  { tag: "입시", title: "수능 최저 바로 판정", icon: CheckCircle2 },
  { tag: "기록", title: "누가기록이 특기사항으로", icon: MessageCircle },
  { tag: "야자", title: "야자 신청부터 출석까지", icon: Moon },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="처음으로">
      <Image src="/face.png" alt="" width={30} height={32} priority />
      <Image src="/schs-logo.png" alt="속초고등학교 학생관리시스템" width={100} height={28} priority />
    </Link>
  );
}

function Label({ children, light }: { children: string; light?: boolean }) {
  return <p className={light ? "text-sm font-bold tracking-wide text-[#9eaaff]" : "text-sm font-bold tracking-wide text-key"}>{children}</p>;
}

export function Landing() {
  return (
    <div className="min-h-dvh bg-white text-ink">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-navy/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 md:px-8">
          <Logo />
          <nav className="ml-auto hidden items-center gap-7 text-[15px] text-[#c2caff] md:flex">
            {NAV.map(([l, h]) => <a key={h} href={h} className="hover:text-white">{l}</a>)}
          </nav>
          <Link href="/login" className="ml-auto rounded-control bg-key px-4 py-2 text-sm font-bold text-white hover:bg-key-strong md:ml-0">로그인</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-navy text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 md:grid-cols-[1.1fr_1fr] md:px-8 md:pb-28 md:pt-24">
          <div>
            <h1 className="text-[34px] font-bold leading-tight md:text-[52px]">한 눈에 확인하는<br />우리 학교 학생 기록</h1>
            <p className="mt-5 text-[17px] text-[#c2caff] md:text-lg">프로그램이 끝나면 설문이 모이고, 초안은 AI가 먼저 써둬요.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/login" className="inline-flex items-center gap-2 rounded-control bg-key px-6 py-3.5 font-bold hover:bg-key-strong">
                속초고 계정으로 시작하기 <ArrowRight size={18} />
              </Link>
              <a href="#process" className="rounded-control border border-white/20 px-6 py-3.5 font-medium text-[#c2caff] hover:bg-white/5">둘러보기</a>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {[
              ["진로 프로그램 설문", "30명 중 30명 응답", "응답 완료", "bg-ok-soft text-ok"],
              ["생기부 초안 도착", "30건 · 글자수 검사 통과", "AI", "bg-new-soft text-new"],
              ["확정 대기", "선생님 검토 3건", "대기", "bg-wait-soft text-wait"],
            ].map(([t, d, tag, tone]) => (
              <div key={t} className="flex items-center gap-4 rounded-card bg-navy-2 p-5">
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{t}</div>
                  <div className="text-sm text-[#c2caff]">{d}</div>
                </div>
                <span className={`rounded-chip px-2.5 py-1 text-xs font-bold ${tone}`}>{tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section id="problem" className="mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
        <Label>Problem</Label>
        <h2 className="mt-3 text-[28px] font-bold leading-snug md:text-[40px]">설문지 따로, 한글 파일 따로,<br />메모는 또 따로</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PROBLEMS.map((p) => (
            <div key={p.tag} className="rounded-card bg-soft p-6">
              <span className="text-xs font-bold text-mute">{p.tag}</span>
              <div className="mt-3 truncate text-lg font-bold">{p.title}</div>
              <p className="mt-1 text-sm text-sub">{p.desc}</p>
              <span className="mt-5 inline-block rounded-chip bg-bad-soft px-2.5 py-1 text-xs font-bold text-bad">따로 관리</span>
            </div>
          ))}
        </div>
      </section>

      {/* Process */}
      <section id="process" className="bg-key-soft">
        <div className="mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
          <Label>Process</Label>
          <h2 className="mt-3 text-[28px] font-bold leading-snug md:text-[40px]">설문 한 번이면 초안까지 끝</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-4">
            {STEPS.map(({ who, title, icon: Icon }, i) => (
              <li key={title} className="rounded-card bg-white p-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-mute">Step {i + 1}</span>
                  <span className="flex size-10 items-center justify-center rounded-[12px] bg-key-soft text-key"><Icon size={20} /></span>
                </div>
                <div className="mt-6 text-sm font-medium text-key-strong">{who}</div>
                <div className="mt-1 text-lg font-bold">{title}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* For everyone */}
      <section id="roles" className="mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
        <Label>For everyone</Label>
        <h2 className="mt-3 text-[28px] font-bold leading-snug md:text-[40px]">누가 보느냐에 따라<br />딱 필요한 만큼만</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {ROLES.map(({ role, icon: Icon, items }) => (
            <div key={role} className="rounded-card bg-soft p-6">
              <span className="flex size-11 items-center justify-center rounded-[13px] bg-white text-key"><Icon size={22} /></span>
              <div className="mt-4 text-lg font-bold">{role}</div>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-sub">
                {items.map((it) => <li key={it} className="flex items-center gap-2"><CheckCircle2 size={14} className="shrink-0 text-key" />{it}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Safety */}
      <section id="safety" className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
          <Label light>Safety</Label>
          <h2 className="mt-3 text-[28px] font-bold leading-snug md:text-[40px]">AI가 쓰고,<br />확정은 선생님이</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {SAFETY.map(({ title, icon: Icon }) => (
              <div key={title} className="rounded-card bg-navy-2 p-6">
                <Icon size={24} className="text-[#9eaaff]" />
                <div className="mt-5 text-lg font-bold">{title}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* More */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
        <Label>More</Label>
        <h2 className="mt-3 text-[28px] font-bold leading-snug md:text-[40px]">기록이 쌓일수록<br />보이는 게 많아져요</h2>
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
          {MORE.map(({ tag, title, icon: Icon }) => (
            <div key={title} className="rounded-card bg-soft p-6">
              <span className="text-xs font-bold text-key">{tag}</span>
              <Icon size={22} className="mt-4 text-key" />
              <div className="mt-3 font-bold">{title}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20 md:px-8 md:pb-28">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-7 rounded-card bg-key px-6 py-16 text-center text-white md:py-20">
          <h2 className="text-[28px] font-bold leading-snug md:text-[40px]">이번 학기부터,<br />학생 기록은 한 곳에</h2>
          <Link href="/login" className="inline-flex items-center gap-2 rounded-control bg-white px-6 py-3.5 font-bold text-key-strong hover:bg-key-soft">
            속초고 계정으로 시작하기 <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-10 text-sm text-mute md:px-8">
          <Image src="/schs-logo.png" alt="SCHS" width={86} height={24} />
          <p>속초고등학교 교육과정부 · 학생·교직원 전용</p>
          <p>© 2026 속초고등학교 교육과정부</p>
        </div>
      </footer>
    </div>
  );
}
