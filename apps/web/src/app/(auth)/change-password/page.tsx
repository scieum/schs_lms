import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/server/viewer";
import { ChangePasswordForm } from "./form";

export const metadata = { title: "비밀번호 바꾸기 · 속초고등학교 학생관리시스템" };

export default async function ChangePasswordPage() {
  const v = await getViewer();
  if (!v) redirect("/");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-4 py-10">
      <Link href="/" className="flex items-center gap-2.5" aria-label="홈으로">
        <Image src="/face.png" alt="" width={30} height={32} priority />
        <Image src="/schs-logo.png" alt="속초고등학교 학생관리시스템" width={100} height={28} priority />
      </Link>
      <div className="w-full max-w-[400px] rounded-card bg-white p-6 md:p-8">
        <h1 className="text-xl font-bold">새 비밀번호를 정해 주세요</h1>
        <p className="mb-6 mt-1 text-sm text-mute">8자 이상, 처음 받은 인증코드와 달라야 해요</p>
        <ChangePasswordForm />
      </div>
    </main>
  );
}
