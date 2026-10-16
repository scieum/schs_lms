import { redirect } from "next/navigation";
import { homePath } from "@/lib/domain/policy";
import { getViewer } from "@/lib/server/viewer";
import { Landing } from "./landing";

export const metadata = { title: "속초고등학교 학생관리시스템" };

// 첫 화면: 로그인 전에는 상세페이지, 로그인했으면 자기 홈 (로고를 누르면 여기로 온다)
export default async function Root() {
  const v = await getViewer();
  if (v) redirect(v.mustChangePassword ? "/change-password" : homePath(v));
  return <Landing />;
}
