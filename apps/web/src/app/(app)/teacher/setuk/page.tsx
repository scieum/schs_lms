import Link from "next/link";
import { Download } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, ButtonLink, Card, Segmented, StatTiles, Tag, cx } from "@/components/ui";
import { measure, neisMax, UNIT_LABEL } from "@/lib/domain/length";
import { latestByStudent, statusLabel, studentsInCourse } from "@/lib/domain/setuk";
import { schoolYear, type Course } from "@/lib/domain/curriculum";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { SetukEditor } from "./editor";

export const metadata = { title: "교과 세특 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ course?: string; student?: string }> };

const short = (c: Course) => `${c.subject} ${c.grade}-${c.semester}`;

export default async function SetukPage({ searchParams }: Props) {
  const v = await requireCan("setuk.write");
  const q = await searchParams;
  const [mine, offered] = await Promise.all([repo.listTeacherCourses(v.accountId), repo.listCourses(schoolYear())]);
  const myCourses = offered.filter((c) => mine.some((a) => a.courseId === c.id));

  if (myCourses.length === 0) {
    return (
      <>
        <PageHeader title="교과 세특" />
        <PageBody>
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">담당 과목이 아직 없어요</p>
              <p className="text-sm text-sub">내 교과와 과목, 맡은 반을 먼저 골라 주세요</p>
              <ButtonLink href="/teacher/subjects">내 교과·과목 고르기</ButtonLink>
            </div>
          </Card>
        </PageBody>
      </>
    );
  }

  const course = myCourses.find((c) => c.id === q.course) ?? myCourses[0];
  const assignment = mine.find((a) => a.courseId === course.id);
  const [allStudents, records] = await Promise.all([repo.listStudents(), repo.listSetuk(course.id)]);
  const students = studentsInCourse(allStudents, course, assignment);
  const latest = latestByStudent(records);
  const selected = students.find((s) => s.id === q.student) ?? students.find((s) => statusLabel(latest.get(s.id)) !== "확정") ?? students[0];
  const counts = { 확정: 0, "작성 중": 0, 미작성: 0 };
  for (const s of students) counts[statusLabel(latest.get(s.id))]++;
  const cur = selected ? latest.get(selected.id) : undefined;
  const href = (studentId?: string) => `/teacher/setuk?course=${course.id}${studentId ? `&student=${studentId}` : ""}`;

  return (
    <>
      <PageHeader
        title="교과 세특"
        actions={
          <>
            <ButtonLink href="/teacher/subjects" kind="outline" size="sm">내 과목</ButtonLink>
            {/* 일반 a 태그: 미리 불러오기(prefetch)로 내보내기가 실행되지 않게 */}
            <a
              href={`/teacher/setuk/export?course=${course.id}`}
              download
              aria-disabled={counts.확정 === 0}
              className={cx("inline-flex items-center gap-1.5 rounded-control px-3.5 py-2 text-[13px] font-medium", counts.확정 ? "bg-key text-white hover:bg-key-strong" : "pointer-events-none bg-faint text-white")}
            >
              <Download size={14} /> 나이스로 내보내기
            </a>
          </>
        }
      />
      <PageBody>
        {myCourses.length > 1 && (
          <Segmented active={myCourses.indexOf(course)} items={myCourses.map((c) => ({ label: short(c), href: `/teacher/setuk?course=${c.id}` }))} />
        )}
        <StatTiles items={[["학생", `${students.length}명`], ["확정", `${counts.확정}명`], ["작성 중", `${counts["작성 중"]}명`], ["미작성", `${counts.미작성}명`]]} />
        <AiBanner title="AI 초안" line="수업 관찰·과제 근거로 만든 초안이 있으면 여기에 불러와요" />

        {students.length === 0 ? (
          <Card>
            <p className="py-6 text-center text-sm text-mute">이 과목에 맡은 반 학생이 없어요. 내 과목에서 반을 확인해 주세요</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-[300px_1fr] md:gap-6">
            <Card title={`${course.subject} · ${assignment?.classes.join("·")}반`} className="md:self-start">
              <ul className="-mx-2 flex max-h-[560px] flex-col overflow-y-auto">
                {students.map((s) => {
                  const r = latest.get(s.id);
                  const on = s.id === selected?.id;
                  return (
                    <li key={s.id}>
                      <Link
                        href={href(s.id)}
                        aria-current={on ? "true" : undefined}
                        className={cx("flex items-center gap-3 rounded-inner px-2 py-2.5", on ? "bg-white" : "hover:bg-white/60")}
                      >
                        <span className="w-12 shrink-0 text-[13px] text-mute">{s.classNo}-{s.number}</span>
                        <span className={cx("min-w-0 flex-1 truncate", on && "font-bold")}>{s.name}</span>
                        <Tag tone={statusLabel(r) === "확정" ? undefined : statusLabel(r) === "작성 중" ? "bg-wait-soft text-wait" : "bg-white text-mute"}>
                          {statusLabel(r)}
                        </Tag>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {selected && (
              <Card
                title={`${selected.name} · ${selected.classNo}반 ${selected.number}번`}
                action={cur ? <span className="text-[13px] text-mute">{new Date(cur.createdAt).toLocaleDateString("ko-KR")} 저장</span> : undefined}
              >
                <SetukEditor
                  key={`${course.id}-${selected.id}`}
                  courseId={course.id}
                  studentId={selected.id}
                  initial={cur?.content ?? ""}
                  unit={cur?.unit ?? "bytes"}
                  max={cur?.max ?? neisMax("세특", "bytes")}
                  confirmed={cur?.status === "confirmed"}
                />
                {cur && (
                  <p className="mt-3 text-[12px] text-mute">
                    지난 저장 {measure(cur.content, cur.unit).toLocaleString()}{UNIT_LABEL[cur.unit]} · 버전 {records.filter((r) => r.studentId === selected.id).length}
                  </p>
                )}
              </Card>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}
