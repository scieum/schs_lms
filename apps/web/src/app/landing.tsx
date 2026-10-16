import Image from "next/image";
import Link from "next/link";
import { Check, Send, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

// 상세페이지 = Figma "상세페이지 시안" B안 · 인디고 (#536DFE). 로그인 전 첫 화면.
// 구성: Nav → Hero(캐릭터 + 떠 있는 카드) → Problem → How it works → Process(네이비) → For everyone → Safety → More → CTA(네이비) → Footer
const NAV = [["서비스 소개", "#problem"], ["이용 흐름", "#how"], ["역할별 기능", "#roles"], ["안심 설계", "#safety"]];

const PROBLEMS = [
  { tag: "Form", title: "구글 설문지", desc: "프로그램마다 새로 만들고 명단과 대조" },
  { tag: "HWP", title: "생기부_초안_최종_진짜최종.hwp", desc: "응답 옮겨 적고 글자수 직접 세기" },
  { tag: "Memo", title: "선생님 개인 메모", desc: "상담 기록은 쓴 사람만 알아요" },
];

const FLOW = ["설문 발행", "학생 응답", "AI 초안", "선생님 확정"];

const ROLES = [
  { role: "학생", img: "/char-wave.png", items: ["D-day 설문 알림", "성적 추이·수능 최저", "전년도 생기부 열람", "도서·과목 추천", "야자·과목 신청"] },
  { role: "교과·프로그램 교사", img: "/char-stand.png", items: ["설문 응답률", "초안 검토·확정", "담당 학생 목록", "상담 기록 입력"] },
  { role: "담임교사", img: "/char-thumb.png", items: ["반 학생 통합 보기", "성적 파일 업로드", "최저 판정 일괄 보기", "야자 관리"] },
  { role: "관리자", img: "/face.png", items: ["명부·계정 관리", "비밀번호 초기화", "초안 생성 실패 모니터", "감사 로그"] },
];

const SAFETY = ["확정 버튼은 선생님만", "상담 기록은 필요한 사람만", "고쳐도 기록은 남아요", "NEIS 글자수 자동 체크"];

const MORE = [
  ["성적", "성적 추이 한눈에"], ["입시", "수능 최저 바로 판정"], ["생기부", "PDF 생기부 자동 정리"],
  ["추천", "꼬리 무는 활동 추천"], ["야자", "야자 신청부터 출석까지"], ["과목", "진로 맞춤 과목 추천"],
];

function Logo({ size = 1 }: { size?: number }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="처음으로">
      <Image src="/face.png" alt="" width={32 * size} height={34 * size} priority />
      <Image src="/schs-logo.png" alt="속초고등학교 학생관리시스템" width={107 * size} height={30 * size} priority />
    </Link>
  );
}

function Eyebrow({ children }: { children: string }) {
  return <p className="text-[15px] font-medium text-key md:text-[17px]">{children}</p>;
}

function H2({ children, light }: { children: ReactNode; light?: boolean }) {
  return <h2 className={`mt-3 text-[28px] font-bold leading-[1.3] md:text-[40px] ${light ? "text-white" : "text-ink"}`}>{children}</h2>;
}

/** 히어로에 떠 있는 상태 카드 */
function FloatCard({ title, line, className }: { title: string; line: string; className: string }) {
  return (
    <div className={`absolute hidden rounded-inner border border-white/15 bg-[#22263a]/90 px-5 py-4 text-left md:block ${className}`}>
      <div className="text-[15px] font-bold text-white">{title}</div>
      <div className="mt-1 text-[13px] text-[#c2caff]">{line}</div>
    </div>
  );
}

/* Process 카드 그림 (Figma 일러스트를 단순한 도형으로) */
const bar = (w: string, c = "bg-[#d9dde3]") => <span className={`block h-1.5 rounded-full ${c} ${w}`} />;
function ArtSurvey() {
  return (
    <div className="relative h-[100px] w-[84px] rounded-[10px] border-2 border-[#d9dde3] bg-white p-3">
      <span className="absolute -top-2 left-1/2 h-3 w-9 -translate-x-1/2 rounded-full bg-key" />
      {[0, 1, 2].map((i) => <div key={i} className="mt-2.5 flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-key" />{bar("w-9")}</div>)}
      <span className="absolute -bottom-3 -right-5 flex size-11 items-center justify-center rounded-full bg-key text-white"><Send size={20} /></span>
    </div>
  );
}
function ArtPhone() {
  return (
    <div className="relative h-[112px] w-[62px] rounded-[12px] border-[5px] border-ink bg-white p-1.5">
      <div className="rounded-[4px] bg-key p-1.5">{bar("w-7", "bg-white/80")}<span className="mt-1 block" />{bar("w-5", "bg-white/80")}</div>
      <div className="mt-2 flex flex-col gap-1.5">{bar("w-10")}{bar("w-8")}</div>
      <span className="absolute bottom-2 left-1.5 right-1.5 h-3 rounded-full bg-key" />
      <span className="absolute -right-12 top-1 flex h-7 w-11 items-center justify-center gap-1 rounded-full bg-[#00b86b]">{[0, 1, 2].map((i) => <i key={i} className="size-1.5 rounded-full bg-white" />)}</span>
    </div>
  );
}
function ArtDoc({ check }: { check?: boolean }) {
  return (
    <div className="relative h-[100px] w-[78px] rounded-[10px] border-2 border-[#d9dde3] bg-white p-3">
      <div className="flex flex-col gap-2">{bar("w-12", check ? "bg-[#d9dde3]" : "bg-key")}{bar("w-10")}{bar("w-12")}{bar("w-8")}</div>
      {check ? (
        <span className="absolute -bottom-3 -right-5 flex size-11 items-center justify-center rounded-full bg-key text-white"><Check size={22} strokeWidth={3} /></span>
      ) : (
        <Sparkles size={26} className="absolute -right-9 top-1 text-key" />
      )}
    </div>
  );
}
const STEPS = [
  { who: "선생님", title: "공통 설문 바로 발행", art: <ArtSurvey /> },
  { who: "학생", title: "홈에서 바로 응답", art: <ArtPhone /> },
  { who: "AI", title: "창체·진로·세특 초안 자동 작성", art: <ArtDoc /> },
  { who: "선생님", title: "확정하면 담임도 바로 열람", art: <ArtDoc check /> },
];

export function Landing() {
  return (
    <div className="min-h-dvh bg-white text-ink">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-[#0a0b12]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-4 md:h-[79px] md:px-0">
          <Logo />
          <nav className="ml-auto hidden items-center gap-9 text-[16px] text-[#c4cad1] md:flex">
            {NAV.map(([l, h]) => <a key={h} href={h} className="hover:text-white">{l}</a>)}
          </nav>
          <Link href="/login" className="ml-auto rounded-control bg-key px-4 py-2.5 text-[15px] font-bold text-white hover:bg-key-strong md:ml-0 md:px-[18px] md:py-3">로그인</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#0a0b12_0%,#1c2033_100%)] text-white">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center px-4 pt-16 text-center md:pt-[120px]">
          <h1 className="text-[36px] font-bold leading-[1.25] md:text-[60px]">한 눈에 확인하는<br />우리 학교 학생 기록</h1>
          <p className="mt-6 text-[16px] font-light text-[#c4cad1] md:text-[20px]">프로그램이 끝나면 설문이 모이고, 초안은 AI가 먼저 써둬요.</p>
          <div className="mt-9 flex gap-3">
            <Link href="/login" className="rounded-control bg-key px-6 py-3.5 text-[15px] font-bold hover:bg-key-strong md:px-[30px] md:py-[18px] md:text-[17px]">속초고 계정으로 시작하기</Link>
            <a href="#how" className="rounded-control border border-white/20 bg-white/5 px-6 py-3.5 text-[15px] font-bold hover:bg-white/10 md:px-[30px] md:py-[18px] md:text-[17px]">둘러보기</a>
          </div>
          <Link href="/signup" className="mt-4 text-[13px] text-[#9eaaff] underline-offset-4 hover:underline">처음이신 선생님은 가입하기</Link>

          <div className="relative mt-10 h-[300px] w-full max-w-[800px] md:mt-12 md:h-[420px]">
            {/* 은은한 인디고 빛 번짐 (디자인 시스템이 허용한 유일한 예외) */}
            <div className="absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,rgba(83,109,254,0.55)_0%,rgba(83,109,254,0)_70%)] md:size-[560px]" aria-hidden />
            <Image src="/clover.png" alt="네잎클로버를 든 영랑이" width={365} height={390} priority className="relative mx-auto h-[300px] w-auto md:h-[390px]" />
            <FloatCard title="진로 프로그램 설문" line="30명 중 30명 응답" className="left-0 top-[60px]" />
            <FloatCard title="생기부 초안 도착" line="30건 · 글자수 검사 통과" className="right-0 top-[30px]" />
            <FloatCard title="확정 대기" line="선생님 검토 3건" className="right-[24px] top-[230px]" />
          </div>
        </div>
      </section>

      {/* Problem */}
      <section id="problem" className="scroll-mt-20 bg-[#f8f9fb]">
        <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-20 md:grid-cols-2 md:gap-0 md:px-0 md:py-[140px]">
          <div className="text-center">
            <Eyebrow>Problem</Eyebrow>
            <H2>설문지 따로,<br />한글 파일 따로,<br />메모는 또 따로</H2>
          </div>
          <ul className="flex flex-col gap-3">
            {PROBLEMS.map((p) => (
              <li key={p.tag} className="flex items-center gap-4 rounded-inner bg-white px-6 py-5">
                <span className="flex size-[52px] shrink-0 items-center justify-center rounded-inner bg-key-soft text-[13px] font-bold text-key">{p.tag}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[17px] font-bold">{p.title}</div>
                  <div className="mt-0.5 truncate text-[14px] text-sub">{p.desc}</div>
                </div>
                <span className="shrink-0 rounded-chip bg-soft px-3 py-1.5 text-[13px] font-medium text-mute">따로 관리</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-white">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-20 md:grid-cols-2 md:gap-0 md:px-0 md:py-[140px]">
          <div className="text-center">
            <Eyebrow>How it works</Eyebrow>
            <H2>설문 한 번이면<br />초안까지 끝</H2>
          </div>
          <div className="relative pb-28 pt-24">
            {/* 진행 줄 */}
            <div className="absolute left-[20px] right-[20px] top-[132px] h-0.5 bg-line" aria-hidden />
            <ol className="relative grid grid-cols-4">
              {FLOW.map((f, i) => (
                <li key={f} className="flex flex-col items-center gap-4">
                  <span className={`text-[14px] md:text-[16px] ${i === 2 ? "font-bold text-ink" : "text-sub"}`}>{f}</span>
                  <span className={`size-3.5 rounded-full ${i < 2 ? "bg-key" : i === 2 ? "bg-ink" : "bg-[#c4cad1]"}`} />
                </li>
              ))}
            </ol>
            {/* AI 초안 단계에 붙은 말풍선·검사 */}
            <div className="absolute left-[62.5%] top-0 flex -translate-x-1/2 flex-col items-center">
              <div className="rounded-inner bg-key px-6 py-3 text-center text-white">
                <div className="text-[17px] font-bold">초안 생성 중</div>
                <div className="text-[13px] text-white/85">30건 중 28건 완료</div>
              </div>
              <span className="mt-1.5 border-x-[6px] border-t-[7px] border-x-transparent border-t-key" />
            </div>
            <div className="absolute left-[62.5%] top-[148px] flex -translate-x-1/2 flex-col items-center gap-2">
              <span className="h-5 w-0.5 bg-line" />
              {["글자수 검사", "개인정보 검사"].map((c) => (
                <span key={c} className="whitespace-nowrap rounded-inner bg-[#4e5968] px-4 py-2.5 text-[15px] font-bold text-white">{c} <span className="ml-1 text-[12px] font-normal text-white/80">통과</span></span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="bg-navy">
        <div className="mx-auto max-w-[1200px] px-4 py-20 text-center md:px-0 md:py-[140px]">
          <Eyebrow>Process</Eyebrow>
          <H2 light>이렇게 흘러가요</H2>
          <ol className="mt-12 grid gap-5 text-left sm:grid-cols-2 md:mt-[70px] md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col rounded-inner bg-[linear-gradient(180deg,#eef0ff_0%,#ffffff_60%)] p-3.5 pb-6">
                <div className="flex gap-1.5">
                  <span className="rounded-control bg-key px-3 py-1.5 text-[13px] font-bold text-white">Step {i + 1}</span>
                  <span className="rounded-control border border-line bg-white px-3 py-1.5 text-[13px] font-bold">{s.who}</span>
                </div>
                <div className="flex h-[140px] items-center justify-center">{s.art}</div>
                <div className="px-1.5 text-[17px] font-bold">{s.title}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* For everyone */}
      <section id="roles" className="scroll-mt-20 bg-[#f8f9fb]">
        <div className="mx-auto max-w-[1200px] px-4 py-20 text-center md:px-0 md:py-[140px]">
          <Eyebrow>For everyone</Eyebrow>
          <H2>누가 보느냐에 따라<br />딱 필요한 만큼만</H2>
          <div className="mt-12 grid gap-5 text-left sm:grid-cols-2 md:mt-[70px] md:grid-cols-4">
            {ROLES.map((r) => (
              <div key={r.role} className="rounded-inner bg-white p-6">
                <div className="flex items-center gap-4 border-b border-line pb-4">
                  <span className="flex size-14 shrink-0 items-end justify-center overflow-hidden rounded-full bg-key-soft">
                    <Image src={r.img} alt="" width={42} height={52} className="h-[46px] w-auto" />
                  </span>
                  <span className="text-[19px] font-bold">{r.role}</span>
                </div>
                <ul className="mt-4 flex flex-col gap-2.5 text-[15px] text-sub">
                  {r.items.map((it) => <li key={it} className="flex items-center gap-2.5"><span className="size-1.5 shrink-0 rounded-full bg-key" />{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety */}
      <section id="safety" className="scroll-mt-20 bg-white">
        <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-20 md:grid-cols-2 md:gap-0 md:px-0 md:py-[140px]">
          <div className="text-center">
            <Eyebrow>Safety</Eyebrow>
            <H2>AI가 쓰고,<br />확정은 선생님이</H2>
          </div>
          <ul className="flex flex-col gap-3">
            {SAFETY.map((s) => (
              <li key={s} className="flex items-center gap-4 rounded-inner bg-soft px-7 py-5 text-[17px] font-bold">
                <Check size={20} strokeWidth={2.5} className="shrink-0 text-key" />{s}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* More */}
      <section className="bg-[#f8f9fb]">
        <div className="mx-auto max-w-[1200px] px-4 py-20 text-center md:px-0 md:py-[140px]">
          <Eyebrow>More</Eyebrow>
          <H2>기록이 쌓일수록<br />보이는 게 많아져요</H2>
          <div className="mt-12 grid gap-5 text-left sm:grid-cols-2 md:mt-[70px] md:grid-cols-3 md:gap-x-5 md:gap-y-16">
            {MORE.map(([tag, title]) => (
              <div key={title} className="rounded-inner bg-white px-7 py-7">
                <span className="rounded-chip bg-key-soft px-3 py-1.5 text-[13px] font-medium text-key">{tag}</span>
                <div className="mt-4 text-[19px] font-bold">{title}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA + Footer (네이비, 아래로 어두워짐) */}
      <section className="bg-[linear-gradient(180deg,#1c2033_0%,#0a0b12_100%)] text-white">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center px-4 pb-24 pt-20 text-center md:px-0 md:pb-[130px] md:pt-[110px]">
          <Image src="/clover.png" alt="" width={187} height={200} className="h-[160px] w-auto md:h-[190px]" />
          <h2 className="mt-8 text-[30px] font-bold leading-[1.3] md:text-[44px]">이번 학기부터,<br />학생 기록은 한 곳에</h2>
          <Link href="/login" className="mt-8 rounded-control bg-key px-[30px] py-[18px] text-[17px] font-bold hover:bg-key-strong">속초고 계정으로 시작하기</Link>
        </div>
        <footer className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 pb-14 text-[13px] text-[#8b95a1] md:px-0">
          <Link href="/" aria-label="처음으로" className="w-fit">
            <Image src="/schs-logo.png" alt="SCHS" width={93} height={26} />
          </Link>
          <p className="mt-2">속초고등학교 교육과정부 · 학생·교직원 전용</p>
          <p>© 2026 속초고등학교 교육과정부</p>
        </footer>
      </section>
    </div>
  );
}
