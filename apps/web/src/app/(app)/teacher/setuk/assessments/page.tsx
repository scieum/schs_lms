import type { CSSProperties } from "react";
import Link from "next/link";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card, cx } from "@/components/ui";
import { assessmentsFor, assessScope, latestSummaries } from "@/lib/domain/assessment";
import { latestGrades } from "@/lib/domain/rubric";
import { schoolYear, type Course } from "@/lib/domain/curriculum";
import { courseSections, studentsInCourse } from "@/lib/domain/setuk";
import { aiEnabled } from "@/lib/server/ai/claude";
import { libraryEntries } from "@/lib/server/assess-library";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { AssessBoard, NewAssessButton } from "./board";

export const metadata = { title: "수행평가 · 속초고 쌤기부" };

type Props = { searchParams: Promise<{ course?: string; section?: string; a?: string }> };

// 탭 이름은 과목 이름만 (2026-10-22: "1-2" 같은 학년-학기는 뺌)
const short = (c: Course) => c.subject;

// 세특 · 수행평가 (Figma N59 a · b · c): 반 탭 → 수행평가 목록 · 고른 수행평가(자료 n/m · 합본 PDF 나누기 · 한 명씩 · 학생 칸 · 요약).
// 루브릭 채점 (N72 a~e): 고른 수행평가가 루브릭이면 확정 n/m · 학생마다 판정(AI 제안 · 확정) · 채점 확인 창.
// 주소에는 내부 id 만 (C3).
export default async function AssessmentsPage({ searchParams }: Props) {
  const v = await requireCan("setuk.write");
  const q = await searchParams;
  const [mine, offered, rosters, all] = await Promise.all([
    repo.listTeacherCourses(v.accountId), repo.listCourses(schoolYear(), { joint: true }), repo.listCourseRosters(v.accountId), repo.listStudents({ external: true }),
  ]);
  const myCourses = offered.filter((c) => mine.some((a) => a.courseId === c.id));
  if (!myCourses.length) {
    return (
      <>
        <PageHeader title="수행평가" />
        <PageBody>
          <Card><div className="flex flex-col items-center gap-3 py-8 text-center"><p className="font-bold">담당 과목이 아직 없어요</p><ButtonLink href="/teacher/subjects">내 수업 정하기</ButtonLink></div></Card>
        </PageBody>
      </>
    );
  }
  const tabs = myCourses.flatMap((c) => {
    const a = mine.find((x) => x.courseId === c.id)!;
    const rs = rosters.filter((r) => r.courseId === c.id);
    if (a.mode === "moving" && a.sections?.length) return a.sections.map((sec) => ({ course: c, section: sec as string | null, name: c.joint ? `공동 · ${c.subject}` : `${c.subject} ${sec}`, n: studentsInCourse(all, c, a, rs, sec).length }));
    // 고정반 여러 반은 반마다 따로 (2026-10-22)
    return courseSections(a).map((sec) => ({ course: c, section: sec, name: sec ? `${short(c)} · ${sec}` : `${short(c)} · ${a.classes.join(", ")}반`, n: studentsInCourse(all, c, a, rs, sec).length }));
  });
  const tab = tabs.find((t) => t.course.id === q.course && (t.section ?? "") === (q.section ?? "")) ?? tabs.find((t) => t.course.id === q.course) ?? tabs[0];
  const assignment = mine.find((a) => a.courseId === tab.course.id)!;
  const students = studentsInCourse(all, tab.course, assignment, rosters.filter((r) => r.courseId === tab.course.id), tab.section);
  const list = assessmentsFor(await repo.listAssessments({ courseId: tab.course.id }), tab.course.id, tab.section).filter((a) => a.teacherId === v.accountId);
  const ids = students.map((s) => s.id);
  const summaries = await Promise.all(list.map(async (a) => latestSummaries(ids.length ? await repo.listRecordMemos(assessScope(tab.course.id, a.id), ids) : [])));
  // 루브릭: 학생마다 가장 최근 판정 (목록에는 확정 수)
  const grades = await Promise.all(list.map(async (a) => (a.kind === "rubric" ? latestGrades(await repo.listGrades(a.id)) : null)));
  const confirmed = (i: number) => [...(grades[i]?.values() ?? [])].filter((g) => g.status === "confirmed" && ids.includes(g.studentId)).length;
  const selIndex = Math.max(0, list.findIndex((a) => a.id === q.a));
  const sel = list[selIndex] ?? null;
  const sec = (t: typeof tab) => (t.section ? `&section=${encodeURIComponent(t.section)}` : "");
  const base = `/teacher/setuk/assessments?course=${tab.course.id}${sec(tab)}`;

  return (
    <>
      <PageHeader title="수행평가" actions={<NewAssessButton courseId={tab.course.id} section={tab.section} base={base} aiOn={aiEnabled()} library={libraryEntries(tab.course).length} />} />
      <PageBody>
        {tabs.length > 1 && (
          <nav className="grid grid-cols-2 gap-1 rounded-card border border-line bg-[#fff] p-1 md:grid-cols-[repeat(var(--tabs),minmax(0,1fr))]" style={{ "--tabs": Math.min(tabs.length, 5) } as CSSProperties}>
            {tabs.map((t) => {
              const on = t === tab;
              return (
                <Link key={`${t.course.id}-${t.section ?? ""}`} href={`/teacher/setuk/assessments?course=${t.course.id}${sec(t)}`} aria-current={on ? "page" : undefined}
                  className={cx("flex h-11 min-w-0 flex-col items-center justify-center whitespace-nowrap rounded-control px-3 md:h-[37px] md:flex-row md:gap-1",
                    on ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub hover:bg-soft")}>
                  <span className="max-w-full truncate text-[13px] md:text-[14px]">{t.name}</span>
                  <span className="text-[11px] text-mute md:text-[14px]">· {t.n}명</span>
                </Link>
              );
            })}
          </nav>
        )}
        <AssessBoard
          base={base}
          aiOn={aiEnabled()}
          courseId={tab.course.id}
          section={tab.section}
          items={list.map((a, i) => ({ id: a.id, title: a.title, date: a.date, description: a.description, kind: a.kind, done: a.kind === "rubric" ? confirmed(i) : summaries[i].size }))}
          selected={sel ? { id: sel.id, title: sel.title, date: sel.date, description: sel.description, kind: sel.kind, rubric: sel.rubric, modelAnswer: sel.modelAnswer } : null}
          total={students.length}
          students={students.map((s) => {
            const g = sel ? grades[selIndex]?.get(s.id) ?? null : null;
            return { id: s.id, no: s.school ?? s.studentNo, name: s.name, summary: sel ? summaries[selIndex].get(s.id)?.content ?? null : null,
              grade: g ? { status: g.status, total: g.total, picks: g.picks, reading: g.reading, piece: g.piece } : null };
          })}
          composeHref={`/teacher/setuk/compose?course=${tab.course.id}${sec(tab)}`}
        />
      </PageBody>
    </>
  );
}
