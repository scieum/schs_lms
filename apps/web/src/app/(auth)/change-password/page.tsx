import { redirect } from "next/navigation";
import { getViewer } from "@/lib/server/viewer";
import { ChangePasswordForm } from "./form";

export const metadata = { title: "비밀번호 바꾸기 · 속초고등학교 학생관리시스템" };

export default async function ChangePasswordPage() {
  const v = await getViewer();
  if (!v) redirect("/login");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[400px] rounded-card bg-white p-6 md:p-8">
        <h1 className="text-xl font-bold">새 비밀번호를 정해 주세요</h1>
        <p className="mb-6 mt-1 text-sm text-mute">8자 이상, 처음 받은 인증코드와 달라야 해요</p>
        <ChangePasswordForm />
      </div>
    </main>
  );
}
