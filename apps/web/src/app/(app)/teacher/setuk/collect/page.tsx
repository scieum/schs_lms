import type { CSSProperties } from "react";
import Link from "next/link";
import { PencilLine } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card, cx } from "@/components/ui";
import { courseSections, studentsInCourse } from "@/lib/domain/setuk";
import { schoolYear, type Course } from "@/lib/domain/curriculum";
import { recentPieces } from "@/lib/domain/collect";
import { seoulNow } from "@/lib/domain/night";
import { repo } from "@/lib/server/repo";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireCan } from "@/lib/server/viewer";
import { listMemosWithPieces, memoPieces } from "@/lib/server/merge-pieces";
import { CollectBoard } from "@/components/writing/collect-board";
import { setukScope } from "@/lib/domain/common-activity";
import { commonActivityRows } from "@/lib/server/common-activity";
import { lessonView } from "@/lib/server/lessons";
import { ClassMaterials } from "@/components/writing/class-materials";

export const metadata = { title: "세특 조각 모으기 · 속초고 쌤기부" };

type Props = { searchParams: Promise<{ course?: string; section?: string; student?: string }> };

const short = (c: Course) => `${c.subject} ${c.grade}-${c.semester}`;
const seoulDay = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// 세특 · 조각 모으기 (Figma N52 a 599:17196 · 모바일 600:10311): 반 탭 → 받는 학생(여러 명) · 활동명 · 메모 → 남기기.
// 조각은 학생마다 "세특:<과목>" 조각 메모로 남고, 글 짓기 왼쪽 칸에 "메모"로 들어간다. 주소는 id만 (C3).
export default async function SetukCollectPage({ searchParams }: Props) {
  const v = await requireCan("setuk.write");
  const q = await searchParams;
  const [mine, offered, rosters] = await Promise.all([repo.listTeacherCourses(v.accountId), repo.listCourses(schoolYear(), { joint: true }), repo.listCourseRosters(v.accountId)]);
  const myCourses = offered.filter((c) => mine.some((a) => a.courseId === c.id));

  if (myCourses.length === 0) {
    return (
      <>
        <PageHeader title="조각 모으기" />
        <PageBody>
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">담당 과목이 아직 없어요</p>
              <ButtonLink href="/teacher/subjects">내 수업 정하기</ButtonLink>
            </div>
          </Card>
        </PageBody>
      </>
    );
  }

  // 공동교육과정 수업(N54)이면 다른 학교 학생도 명단에 든다
  const all = await repo.listStudents({ external: true });
  // 반 탭: 고정반 과목은 과목 하나, 이동반 과목은 분반마다 하나 (글 짓기와 같은 규칙)
  const tabs = myCourses.flatMap((c) => {
    const a = mine.find((x) => x.courseId === c.id)!;
    const rs = rosters.filter((r) => r.courseId === c.id);
    if (a.mode === "moving" && a.sections?.length) {
      return a.sections.map((sec) => ({ course: c, section: sec as string | null, name: c.joint ? `공동 · ${c.subject}` : `${c.subject} ${sec}`, n: studentsInCourse(all, c, a, rs, sec).length }));
    }
    // 고정반 여러 반은 반마다 따로 (2026-10-22)
    return courseSections(a).map((sec) => ({ course: c, section: sec, name: sec ? `${short(c)} · ${sec}` : `${short(c)} · ${a.classes.join(", ")}반`, n: studentsInCourse(all, c, a, rs, sec).length }));
  });
  const tab = tabs.find((t) => t.course.id === q.course && (t.section ?? "") === (q.section ?? "")) ?? tabs.find((t) => t.course.id === q.course) ?? tabs[0];
  const course = tab.course;
  const assignment = mine.find((a) => a.courseId === course.id);
  const students = studentsInCourse(all, course, assignment, rosters.filter((r) => r.courseId === course.id), tab.section);
  const ids = students.map((s) => s.id);
  const memos = ids.length ? await listMemosWithPieces(`세특:${course.id}`, ids) : [];
  const sec = (t: typeof tab) => (t.section ? `&section=${encodeURIComponent(t.section)}` : "");
  const compose = `/teacher/setuk/compose?course=${course.id}${sec(tab)}`;
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const today = seoulNow().date;
  // 공통 활동 · 차시별 활동 (N26 · N43): 다 같이 한 활동은 여기서 등록 → 학생 자료를 한꺼번에 올려 조각으로 (글 짓기 아래와 같은 카드)
  const scopeKey = setukScope(course.id, tab.section);
  const [commonRows, lesson] = await Promise.all([commonActivityRows(scopeKey, ids), lessonView(scopeKey, students, tab.section ? `${course.subject} ${tab.section}` : course.subject)]);

  return (
    <>
      <PageHeader title="조각 모으기" actions={<ButtonLink href={q.student ? `${compose}&student=${q.student}` : compose} kind="outline" size="sm"><PencilLine size={14} /> 글 짓기</ButtonLink>} />
      <PageBody>
        {tabs.length > 1 && (
          <nav className="grid grid-cols-2 gap-1 rounded-card border border-line bg-[#fff] p-1 md:grid-cols-[repeat(var(--tabs),minmax(0,1fr))]" style={{ "--tabs": Math.min(tabs.length, 5) } as CSSProperties}>
            {tabs.map((t) => {
              const on = t === tab;
              return (
                <Link key={`${t.course.id}-${t.section ?? ""}`} href={`/teacher/setuk/collect?course=${t.course.id}${sec(t)}`} aria-current={on ? "page" : undefined}
                  className={cx("flex h-11 min-w-0 flex-col items-center justify-center whitespace-nowrap rounded-control px-3 md:h-[37px] md:flex-row md:gap-1",
                    on ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub hover:bg-soft")}>
                  <span className="max-w-full truncate text-[13px] md:text-[14px]">{t.name}</span>
                  <span className="text-[11px] md:text-[14px]"><span className="hidden md:inline">· </span>{t.n}명</span>
                </Link>
              );
            })}
          </nav>
        )}
        <ClassMaterials year={schoolYear()} lesson={lesson} common={{ scope: scopeKey, rows: commonRows, detailBase: "/teacher/setuk/activity", today }} />
        <CollectBoard
          key={`${course.id}-${tab.section ?? ""}`}
          target={{ kind: "setuk", courseId: course.id }}
          // 다른 학교 학생(N54)은 칸이 좁아 번호 자리에 학교 이름만
          students={students.map((s) => ({ id: s.id, no: s.school ?? s.studentNo, name: s.name, count: memoPieces(memos.filter((m) => m.studentId === s.id)).length }))}
          recent={recentPieces(memos.filter((m) => m.authorId === v.accountId).map((m) => ({ studentId: m.studentId, date: m.date ?? seoulDay(m.createdAt), content: m.content })), (id) => nameOf.get(id))}
          composeHref={compose}
          today={today}
          withDate={false}
          preselect={q.student ? [q.student] : []}
          aiOn={aiEnabled()}
        />
      </PageBody>
    </>
  );
}
