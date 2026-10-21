import { LockedFeature } from "@/components/locked-feature";
import { requireViewer } from "@/lib/server/viewer";

export const metadata = { title: "잠긴 기능 · 속초고 쌤기부" };

/** 잠근 기능(성적)의 주소로 들어오면 여기로 보낸다 */
export default async function LockedPage() {
  const v = await requireViewer();
  const home = v.kind === "student" ? "/student" : v.teacher.homeroom ? "/homeroom" : "/teacher";
  return <LockedFeature title="잠긴 기능" home={home} />;
}
