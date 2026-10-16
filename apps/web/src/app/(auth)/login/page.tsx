import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Lock, MessageCircle, Sparkles, type LucideIcon } from "lucide-react";
import { Yeongrang } from "@/components/shell/yeongrang";
import { homePath } from "@/lib/domain/policy";
import { isDemo } from "@/lib/server/env";
import { getViewer } from "@/lib/server/viewer";
import { LoginForm } from "./login-form";

export const metadata = { title: "로그인 · 속초고등학교 학생관리시스템" };

const DEMO = [
  ["관리자", "선생님 · 정다은"],
  ["교과 교사", "선생님 · 이서연"],
  ["담임", "선생님 · 박지훈"],
  ["학생", "학번 20301"],
];

const FEATURES: { icon: LucideIcon; title: string; desc: string; ai?: boolean }[] = [
  { icon: ClipboardList, title: "설문·서류 제출", desc: "프로그램이 끝나면 휴대폰으로 바로 내요" },
  { icon: Sparkles, title: "생기부 초안", desc: "응답을 모아 선생님이 다듬을 초안을 만들어요", ai: true },
  { icon: MessageCircle, title: "상담 기록", desc: "담임·교과 선생님이 이어서 봐요" },
  { icon: Lock, title: "가명 처리", desc: "AI에는 이름 대신 가명만 보내요" },
];

// LabStock 로그인 구조: 위 헤더 + 데스크톱은 반 나눔(왼쪽 폼 440 · 오른쪽 서비스 소개), 모바일은 폼만.
// Figma "로그인 · 속초 인디고" 페이지.
export default async function LoginPage() {
  const v = await getViewer();
  if (v && !v.mustChangePassword) redirect(homePath(v));

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="flex h-14 shrink-0 items-center px-4 lg:h-16 lg:border-b lg:border-hair lg:px-10">
        <Link href="/" className="flex items-center gap-2.5" aria-label="처음으로">
          <Image src="/face.png" alt="" width={30} height={32} priority />
          <Image src="/schs-logo.png" alt="속초고등학교 학생관리시스템" width={100} height={28} priority />
        </Link>
      </header>

      <main className="flex flex-1 flex-col lg:grid lg:grid-cols-2">
        <section className="flex flex-1 flex-col items-center justify-between gap-10 px-4 pb-6 pt-8 lg:px-8 lg:pb-8 lg:pt-[72px]">
          <div className="w-full max-w-[440px]">
            <LoginForm />
            {isDemo && (
              <div className="mt-6 rounded-inner bg-wait-soft p-4 text-[13px] text-[#9a6400]">
                <p className="mb-2 font-bold">데모 계정 · 비밀번호 demo1234</p>
                <ul className="space-y-0.5">
                  {DEMO.map(([k, v]) => (
                    <li key={k}>{k}: {v}</li>
                  ))}
                  <li>첫 로그인 체험: 학번 20312 · 비밀번호 schs-2026</li>
                </ul>
              </div>
            )}
          </div>
          <p className="text-xs text-mute">© 2026 속초고등학교 교육과정부</p>
        </section>

        <aside className="hidden flex-col gap-8 bg-key-soft px-16 pb-16 pt-[72px] lg:flex" aria-label="서비스 소개">
          <h2 className="text-[28px] font-bold">학교생활 기록, 한곳에서</h2>
          <ul className="flex flex-col gap-3">
            {FEATURES.map(({ icon: Icon, title, desc, ai }) => (
              <li key={title} className="flex items-center gap-4 rounded-card bg-white p-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-key-soft text-key">
                  <Icon size={22} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold">{title}</span>
                    {ai && <span className="rounded-chip bg-new-soft px-1.5 py-0.5 text-[11px] font-bold text-new">AI</span>}
                  </div>
                  <p className="text-sm text-sub">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </main>
      <Yeongrang />
    </div>
  );
}
