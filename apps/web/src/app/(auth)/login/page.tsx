import Image from "next/image";
import { redirect } from "next/navigation";
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

export default async function LoginPage() {
  const v = await getViewer();
  if (v && !v.mustChangePassword) redirect(homePath(v));

  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center gap-3 text-white">
          <Image src="/yeongrang.png" alt="" width={56} height={42} />
          <div>
            <div className="text-xl font-bold leading-tight">속초고등학교</div>
            <div className="text-sm text-[#c2caff]">학생관리시스템</div>
          </div>
        </div>
        <div className="rounded-card bg-white p-6 md:p-8">
          <LoginForm />
        </div>
        {isDemo && (
          <div className="mt-4 rounded-inner bg-navy-2 p-4 text-[13px] text-[#c2caff]">
            <p className="mb-2 font-bold text-white">데모 계정 · 비밀번호 demo1234</p>
            <ul className="space-y-0.5">
              {DEMO.map(([k, v]) => (
                <li key={k}>{k}: {v}</li>
              ))}
              <li>첫 로그인 체험: 학번 20312 · 비밀번호 schs-2026</li>
            </ul>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-[#9eaaff]">© 2026 속초고등학교 교육과정부</p>
      </div>
    </main>
  );
}
