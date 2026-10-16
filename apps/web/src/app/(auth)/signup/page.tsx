import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck, UserPlus, type LucideIcon } from "lucide-react";
import { Yeongrang } from "@/components/shell/yeongrang";
import { homePath } from "@/lib/domain/policy";
import { repo } from "@/lib/server/repo";
import { getViewer } from "@/lib/server/viewer";
import { SignupForm } from "./signup-form";

export const metadata = { title: "교사 가입 · 속초고등학교 학생관리시스템" };

const STEPS: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: KeyRound, title: "학교 인증코드", desc: "교육과정부에서 받은 코드로 가입해요" },
  { icon: UserPlus, title: "이름으로 로그인", desc: "가입한 이름이 로그인 ID예요" },
  { icon: ShieldCheck, title: "역할은 관리자가", desc: "담임 반·관리자 역할은 계정 관리에서 정해요" },
];

// 로그인 화면(Figma 103:33 / 103:3682)과 같은 구조: 왼쪽 폼 440 · 오른쪽 안내, 모바일은 폼만.
export default async function SignupPage() {
  const v = await getViewer();
  if (v && !v.mustChangePassword) redirect(homePath(v));
  const first = (await repo.adminCountTeachers()) === 0;

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
            <SignupForm first={first} />
          </div>
          <p className="text-xs text-mute">© 2026 속초고등학교 교육과정부</p>
        </section>

        <aside className="hidden flex-col gap-8 bg-key-soft px-16 pb-16 pt-[72px] lg:flex" aria-label="가입 안내">
          <h2 className="text-[28px] font-bold">선생님 계정 만들기</h2>
          <ul className="flex flex-col gap-3">
            {STEPS.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-center gap-4 rounded-card bg-white p-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-key-soft text-key">
                  <Icon size={22} />
                </span>
                <div className="min-w-0">
                  <span className="font-bold">{title}</span>
                  <p className="text-sm text-sub">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </main>
      <Yeongrang student />
    </div>
  );
}
