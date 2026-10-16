import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, Card, Row, Segmented, StatTiles, Tag } from "@/components/ui";
import { schoolYear, type Course } from "@/lib/domain/curriculum";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { archiveCourse } from "./actions";
import { AddCourseForm } from "./add-course-form";

export const metadata = { title: "편제표 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ grade?: string }> };

export default async function CurriculumPage({ searchParams }: Props) {
  await requireCan("curriculum.manage");
  const { grade: g } = await searchParams;
  const grade = ["1", "2", "3"].includes(g ?? "") ? Number(g) : 1;
  const year = schoolYear();
  const [courses, assigns, teachers] = await Promise.all([repo.listCourses(year), repo.listAllTeacherCourses(), repo.listTeachers()]);
  const nameOf = new Map(teachers.map((t) => [t.id, t.name]));
  const teachersOf = (c: Course) =>
    assigns.filter((a) => a.courseId === c.id).map((a) => `${nameOf.get(a.teacherId) ?? "?"}(${a.classes.join("·")}반)`);
  const count = (n: number) => courses.filter((c) => c.grade === n).length;
  const shown = courses.filter((c) => c.grade === grade);
  const unassigned = courses.filter((c) => teachersOf(c).length === 0).length;

  return (
    <>
      <PageHeader title={`${year}학년도 편제표`} />
      <PageBody>
        <StatTiles items={[["개설 과목", `${courses.length}개`], ["1학년", `${count(1)}개`], ["2학년", `${count(2)}개`], ["담당 교사 없음", `${unassigned}개`]]} />
        <AiBanner label="자동" title="과목 이름 맞추기" line="2022 개정 과목과 이름이 다르면(띄어쓰기·Ⅰ/1) 자동으로 맞춰요" />
        <Segmented
          active={grade - 1}
          items={[1, 2, 3].map((n) => ({ label: `${n}학년`, href: `/admin/curriculum?grade=${n}` }))}
        />
        <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
          <div className="flex flex-col gap-4 md:gap-6">
            {[1, 2].map((sem) => {
              const list = shown.filter((c) => c.semester === sem);
              return (
                <Card key={sem} title={`${sem}학기`} action={<span className="text-[13px] text-mute">{list.reduce((n, c) => n + c.credits, 0)}학점</span>}>
                  {list.length === 0 ? (
                    <p className="py-4 text-center text-sm text-mute">아직 과목이 없어요</p>
                  ) : (
                    list.map((c, i) => {
                      const ts = teachersOf(c);
                      return (
                        <Row
                          key={c.id}
                          last={i === list.length - 1}
                          lead={<Tag tone="bg-key-soft text-key-strong">{c.group}</Tag>}
                          title={c.subject}
                          meta={`${c.type ?? "직접 입력"} · ${c.credits}학점 · ${ts.length ? ts.join(", ") : "담당 교사 없음"}`}
                          right={
                            <form action={archiveCourse}>
                              <input type="hidden" name="id" value={c.id} />
                              <button className="rounded-control px-2.5 py-1.5 text-[13px] text-mute hover:bg-white">내리기</button>
                            </form>
                          }
                        />
                      );
                    })
                  )}
                </Card>
              );
            })}
          </div>
          <Card title="과목 추가">
            <AddCourseForm />
          </Card>
        </div>
      </PageBody>
    </>
  );
}
