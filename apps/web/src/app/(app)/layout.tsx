import { AppShell } from "@/components/shell/app-shell";
import type { NavBadges } from "@/components/shell/nav";
import { today } from "@/lib/domain/activity";
import type { Viewer } from "@/lib/domain/types";
import { isDemo } from "@/lib/server/env";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";

/** 사이드바 숫자 배지 (Figma: 초안 검토 · 오류 처리 · 설문·서류 제출). 실패해도 화면은 뜨게 0으로 */
async function loadBadges(v: Viewer): Promise<NavBadges> {
  try {
    if (v.kind === "student") return { "/student/submit": (await repo.listStudentTodos(v.student.id, today())).length };
    const out: NavBadges = { "/teacher/drafts": await repo.countDraftReviewQueue(v.accountId) };
    if (v.teacher.roles.includes("admin")) out["/admin/errors"] = (await repo.listDraftJobs({ states: ["ERROR"] })).length;
    return out;
  } catch {
    return {};
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const badges = await loadBadges(viewer);
  return (
    <AppShell viewer={viewer} demo={isDemo} badges={badges}>
      {children}
    </AppShell>
  );
}
