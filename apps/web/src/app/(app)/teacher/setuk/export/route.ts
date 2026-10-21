import { neisBytes } from "@/lib/domain/length";
import { latestByStudent, studentsInCourse } from "@/lib/domain/setuk";
import { can } from "@/lib/domain/policy";
import { repo } from "@/lib/server/repo";
import { getViewer } from "@/lib/server/viewer";

// 나이스 입력 버튼(북마클릿)용 내보내기: 내 과목의 '확정'된 세특만.
// 이름은 나이스 화면에서 학생 줄을 맞추는 데만 쓰고, 확장은 이 파일을 브라우저 안에서만 쓴다.
export async function GET(req: Request) {
  const v = await getViewer();
  if (!v || !can(v, "setuk.write")) return new Response("권한이 없어요", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const courseId = new URL(req.url).searchParams.get("course") ?? "";
  const [course, mine, roster] = await Promise.all([repo.getCourse(courseId), repo.listTeacherCourses(v.accountId), repo.getCourseRosters(v.accountId, courseId)]);
  const assignment = mine.find((a) => a.courseId === courseId);
  if (!course || !assignment) return new Response("내 담당 과목이 아니에요", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const [students, records] = await Promise.all([repo.listStudents({ external: true }), repo.listSetuk(course.id)]);
  const latest = latestByStudent(records);
  const rows = studentsInCourse(students, course, assignment, roster, new URL(req.url).searchParams.get("section"))
    .map((s) => ({ s, r: latest.get(s.id) }))
    .filter(({ r }) => r?.status === "confirmed" && r.content.trim())
    .map(({ s, r }) => ({ grade: s.grade, classNo: s.classNo, number: s.number, name: s.name, content: r!.content, bytes: neisBytes(r!.content) }));

  const body = {
    format: "schs-neis/1",
    kind: "교과세특",
    section: new URL(req.url).searchParams.get("section"),
    subject: course.subject,
    year: course.year,
    grade: course.grade,
    semester: course.semester,
    maxBytes: 1500,
    exportedAt: new Date().toISOString(),
    students: rows,
  };
  await repo.audit(v.accountId, "setuk.export", `${course.subject} ${rows.length}명`);
  const file = `세특_${course.subject}_${course.grade}-${course.semester}.json`;
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="setuk.json"; filename*=UTF-8''${encodeURIComponent(file)}`,
      "Cache-Control": "no-store",
    },
  });
}
