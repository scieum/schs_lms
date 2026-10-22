import "server-only";
import { schoolYear } from "@/lib/domain/curriculum";
import { addDays, deadlineOf, isPastDeadline, seoulNow, weekStart } from "@/lib/domain/night";
import { isClosed } from "@/lib/domain/offering";
import type { TodoInput } from "@/lib/domain/student-assist";
import type { Student } from "@/lib/domain/types";
import { repo } from "@/lib/server/repo";

/** 학생 홈 "할 일 정리" 재료: 서류 + 다음 주 야자 신청 + 과목 신청 (서버에서만 모은다) */
export async function myTodoInputs(s: Student, today: string): Promise<TodoInput[]> {
  const now = seoulNow();
  const next = addDays(weekStart(now.date), 7);
  const [todos, round, nextWeek] = await Promise.all([
    repo.listStudentTodos(s.id, today),
    repo.offeringRound(schoolYear(), s.grade),
    repo.listNightSignups(next, addDays(next, 4), [s.id]),
  ]);
  const items: TodoInput[] = todos.map((t) => ({
    key: `${t.kind}-${t.programId}`,
    kind: t.kind,
    title: `${t.title} 제출`,
    due: t.endDate,
    progress: t.progress,
    href: `/student/submit?p=${t.programId}`,
  }));
  const signed = nextWeek.filter((x) => x.status === "신청").length;
  if (!isPastDeadline(now, next) && signed === 0) {
    items.push({ key: "night", kind: "night", title: "다음 주 야자 신청", due: deadlineOf(next).date, progress: "아직 0일", href: "/student/night" });
  }
  if (round && !isClosed(round.deadline, new Date())) {
    const mine = await repo.offeringChoicesOf(round.id, s.id);
    if (mine.length === 0) items.push({ key: "courses", kind: "courses", title: `${round.semester}학기 과목 신청`, due: round.deadline, progress: "아직 안 담음", href: "/student/courses" });
  }
  return items;
}
