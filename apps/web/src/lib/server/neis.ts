import "server-only";
import { homeroomStudents } from "@/lib/domain/activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { NEIS_MAX_BYTES } from "@/lib/domain/length";
import { countReady, type NeisSet } from "@/lib/domain/neis-export";
import { latestByStudent, studentsInCourse } from "@/lib/domain/setuk";
import type { Viewer } from "@/lib/domain/types";
import { latestRecordByStudent, RECORD_LABEL, RECORD_MAX_BYTES, type RecordArea } from "@/lib/domain/writing";
import { repo } from "./repo";

/**
 * 이 교사가 나이스로 보낼 수 있는 기록 묶음 (Figma N9).
 * 교과 세특은 과목마다(이동반도 분반을 합쳐 한 묶음 — 나이스 화면이 과목 단위), 동아리는 지도 동아리마다, 담임은 자율·자치·진로·행발.
 */
export async function neisSets(v: Viewer): Promise<NeisSet[]> {
  if (v.kind !== "teacher") return [];
  const y = schoolYear();
  const [mine, offered, clubs, all, rosters] = await Promise.all([
    repo.listTeacherCourses(v.accountId), repo.listCourses(y, { joint: true }), repo.listClubs(y), repo.listStudents(), repo.listCourseRosters(v.accountId),
  ]);
  const out: NeisSet[] = [];

  for (const course of offered.filter((c) => mine.some((a) => a.courseId === c.id))) {
    const a = mine.find((x) => x.courseId === course.id)!;
    const rs = rosters.filter((r) => r.courseId === course.id);
    const latest = latestByStudent(await repo.listSetuk(course.id));
    // 이동반이라도 나이스 화면에는 과목 학생이 한 번에 있다 — 분반을 나누지 않고 한 묶음으로 (2026-10-21)
    const ids = studentsInCourse(all, course, a, rs, null).map((s) => s.id);
    const moving = a.mode === "moving" && !!a.sections?.length;
    const q = `course=${course.id}`;
    out.push({
      key: `setuk-${course.id}`, group: "교과 세특",
      title: course.subject,
      sub: [`${course.grade}학년 ${course.semester}학기`, moving ? `${a.sections!.join(" · ")} 함께` : `${a.classes.join(", ")}반`].join(" · "),
      exportHref: `/teacher/setuk/export?${q}`, editHref: `/teacher/setuk/compose?${q}`,
      maxBytes: NEIS_MAX_BYTES["세특"], ...countReady(ids, latest, NEIS_MAX_BYTES["세특"]),
    });
  }

  const record = async (area: RecordArea, ids: string[], extra: Partial<NeisSet> & Pick<NeisSet, "key" | "sub" | "exportHref" | "editHref">) => {
    const latest = latestRecordByStudent(await repo.listRecordDrafts({ area, year: y, studentIds: ids }));
    out.push({ group: area === "행발" ? "행발" : "창체", title: RECORD_LABEL[area], maxBytes: RECORD_MAX_BYTES[area], ...countReady(ids, latest, RECORD_MAX_BYTES[area]), ...extra });
  };

  for (const club of clubs.filter((c) => c.advisorId === v.accountId)) {
    const ids = await repo.listClubMembers(club.id);
    const q = `area=${encodeURIComponent("동아리")}&club=${club.id}`;
    await record("동아리", ids, { key: `club-${club.id}`, sub: club.name, exportHref: `/teacher/write/export?${q}`, editHref: `/teacher/write?${q}` });
  }

  const h = v.teacher.homeroom;
  if (h) {
    const ids = homeroomStudents(v, all).map((s) => s.id);
    const cls = `${h.grade}학년 ${h.classNo}반`;
    for (const area of ["자율·자치", "진로", "행발"] as const) {
      const q = `area=${encodeURIComponent(area)}`;
      await record(area, ids, { key: area, sub: cls, exportHref: `/teacher/write/export?${q}`, editHref: area === "행발" ? "/homeroom/behavior" : `/teacher/write?${q}` });
    }
  }
  return out;
}
