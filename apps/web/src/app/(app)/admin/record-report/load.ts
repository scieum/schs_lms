import "server-only";
import { schoolYear } from "@/lib/domain/curriculum";
import { NEIS_MAX_BYTES } from "@/lib/domain/length";
import { effectiveStatus, latestVersion } from "@/lib/domain/program";
import {
  AREA_PARAM, byClass, byGroup, byTeacher, filterArea, REPORT_AREAS, statusOf, tally, textIssues,
  type ReportAreaFilter, type ReportRecord,
} from "@/lib/domain/record-report";
import { kstToday, termEndDate, daysBetween } from "@/lib/domain/retention";
import { latestByStudent, studentsInCourse } from "@/lib/domain/setuk";
import { findIdentity, latestRecordByStudent, RECORD_MAX_BYTES, semesterOf, type RecordArea } from "@/lib/domain/writing";
import type { Student } from "@/lib/domain/types";
import { repo } from "@/lib/server/repo";

// 학생부 점검 보고서 (Figma N39 ②) 데이터: 서버에서 글로 검사하고 **건수만** 화면에 넘긴다.
// 화면·엑셀·인쇄 어디에도 학생 이름·학번·글을 넣지 않는다. 숫자 정의는 lib/domain/record-report.ts.

const RECORD_SCOPE: Record<RecordArea, string> = { "자율·자치": "자율", 동아리: "동아리", 진로: "진로", 행발: "행발" };

export type ReportData = Awaited<ReturnType<typeof loadReport>>;

export async function loadReport(gradeParam: string | undefined, area: ReportAreaFilter) {
  const year = schoolYear();
  const semester = semesterOf();
  const today = kstToday();
  const [allStudents, teachers, courses, assignments, programs, clubs, termEnds] = await Promise.all([
    repo.listStudents(), repo.listTeachers(), repo.listCourses(year), repo.listAllTeacherCourses(), repo.listPrograms(), repo.listClubs(year), repo.getTermEnds(),
  ]);
  const grades = [...new Set(allStudents.map((s) => s.grade))].sort((a, b) => a - b);
  const asked = Number(gradeParam);
  const grade = grades.includes(asked) ? asked : grades.includes(2) ? 2 : grades[0] ?? 2;
  const students = allStudents.filter((s) => s.grade === grade);
  const ids = students.map((s) => s.id);
  const byId = new Map(students.map((s) => [s.id, s]));
  const tName = new Map(teachers.map((t) => [t.id, t.name]));
  const homeroomOf = new Map(teachers.filter((t) => t.homeroom).map((t) => [`${t.homeroom!.grade}-${t.homeroom!.classNo}`, t]));
  const classKey = (s: Pick<Student, "grade" | "classNo">) => `${s.grade}-${s.classNo}`;
  const records: ReportRecord[] = [];
  const base = (s: Student) => ({ grade: s.grade, classNo: s.classNo });

  // ① 세특: 이 학년 과목(올해 1·2학기) × 맡은 선생님 × 학생(고정반·이동반 분반)
  const gradeCourses = courses.filter((c) => c.grade === grade && c.semester <= semester);
  const rosterCache = new Map<string, Awaited<ReturnType<typeof repo.listCourseRosters>>>();
  for (const c of gradeCourses) {
    const assigned = assignments.filter((a) => a.courseId === c.id);
    if (!assigned.length) continue;
    const latest = latestByStudent(await repo.listSetuk(c.id));
    for (const a of assigned) {
      let rosters: { section: string; studentIds: string[] }[] | null = null;
      if (a.mode === "moving") {
        if (!rosterCache.has(a.teacherId)) rosterCache.set(a.teacherId, await repo.listCourseRosters(a.teacherId));
        rosters = rosterCache.get(a.teacherId)!.filter((r) => r.courseId === c.id);
      }
      const sections = a.mode === "moving" ? (a.sections ?? []) : [null];
      for (const section of sections) {
        const list = studentsInCourse(students, c, a, rosters, section);
        const scope = `${c.subject} ${grade}학년${section ? ` ${section}` : a.classes.length ? ` ${a.classes.join("·")}반` : ""}`;
        const label = `${c.subject} ${c.semester}학기${section ? ` · ${section}` : a.classes.length ? ` · ${a.classes.join("·")}반` : ""}`;
        for (const s of list) {
          const r = latest.get(s.id);
          const text = r?.content ?? "";
          records.push({
            ...base(s), area: "세특", teacherId: a.teacherId, scope,
            group: { key: `${c.id}|${section ?? a.classes.join(",")}|${a.teacherId}`, label, courseId: c.id, section },
            status: statusOf(text, r?.status === "confirmed"),
            issues: textIssues(text, { maxBytes: NEIS_MAX_BYTES.세특, identity: text ? findIdentity(text, s) : [] }),
            updatedAt: r?.createdAt ?? null,
          });
        }
      }
    }
  }

  // ② 창체(자율·자치 · 진로 · 동아리) · 행발: 학생마다 영역별 1건 (동아리는 동아리 학생만)
  const clubOf = new Map<string, { name: string; advisorId: string }>();
  for (const club of clubs) for (const sid of await repo.listClubMembers(club.id)) if (byId.has(sid) && !clubOf.has(sid)) clubOf.set(sid, { name: club.name, advisorId: club.advisorId });
  for (const ar of ["자율·자치", "동아리", "진로", "행발"] as RecordArea[]) {
    const targets = ar === "동아리" ? students.filter((s) => clubOf.has(s.id)) : students;
    if (!targets.length) continue;
    const latest = latestRecordByStudent(await repo.listRecordDrafts({ area: ar, year, studentIds: targets.map((s) => s.id) }));
    for (const s of targets) {
      const r = latest.get(s.id);
      const text = r?.content ?? "";
      const homeroom = homeroomOf.get(classKey(s));
      const club = clubOf.get(s.id);
      const teacherId = ar === "동아리" ? club!.advisorId : homeroom?.id ?? r?.authorId ?? null;
      records.push({
        ...base(s), area: ar, teacherId,
        scope: ar === "동아리" ? `동아리 '${club!.name}'` : `${RECORD_SCOPE[ar]} ${classKey(s)}`,
        status: statusOf(text, r?.status === "confirmed"),
        issues: textIssues(text, { maxBytes: RECORD_MAX_BYTES[ar], identity: text ? findIdentity(text, s) : [] }),
        updatedAt: r?.createdAt ?? null,
      });
    }
  }

  // ③ 프로그램 초안: 발행한 프로그램의 이 학년 대상 학생마다 1건. 담임 미전달 = 확정했지만 아직 담임에게 안 간 것(프로그램이 안 닫힘)
  const live = programs.filter((p) => p.status !== "draft" && p.targetIds.some((id) => byId.has(id)));
  if (live.length) {
    const pids = live.map((p) => p.id);
    const [jobs, versions] = await Promise.all([repo.listDraftJobs({ programIds: pids, studentIds: ids }), repo.listDraftVersions({ programIds: pids, studentIds: ids })]);
    for (const p of live) {
      const closed = effectiveStatus(p, today) === "closed";
      for (const sid of p.targetIds) {
        const s = byId.get(sid);
        if (!s) continue;
        const job = jobs.find((j) => j.programId === p.id && j.studentId === sid);
        const v = job ? latestVersion(versions, job.id) : undefined;
        const text = v && v.status !== "rejected" ? v.content : "";
        const finalized = v?.status === "finalized";
        records.push({
          ...base(s), area: "프로그램 초안", teacherId: p.ownerId, scope: p.title,
          status: statusOf(text, finalized),
          issues: { ...textIssues(text, { maxBytes: NEIS_MAX_BYTES[p.area], identity: text ? findIdentity(text, s) : [] }), undelivered: finalized && !closed },
          updatedAt: v?.createdAt ?? null,
        });
      }
    }
  }

  const studentsByClass: Record<string, number> = {};
  for (const s of students) studentsByClass[classKey(s)] = (studentsByClass[classKey(s)] ?? 0) + 1;
  const homerooms = Object.fromEntries([...homeroomOf.entries()].map(([k, t]) => [k, t.name]));
  const view = (a: ReportAreaFilter) => {
    const shown = filterArea(records, a);
    return { summary: tally(shown), classes: byClass(shown, studentsByClass, homerooms), groups: a === "세특" ? byGroup(shown) : [] };
  };
  const deadline = termEndDate(year, semester, termEnds);
  return {
    year, semester, grade, grades, area, areaParam: AREA_PARAM[area],
    at: new Date(),
    deadline, dday: daysBetween(today, deadline),
    ...view(area),
    /** 인쇄 2쪽 · 엑셀 "과목·분반" 시트: 영역마다 */
    perArea: REPORT_AREAS.map((a) => ({ area: a, ...view(a) })),
    teachers: byTeacher(filterArea(records, area)).map((t) => ({ ...t, name: tName.get(t.teacherId) ?? "?" })),
    teacherName: (id: string | null) => (id ? tName.get(id) ?? "?" : "—"),
    studentCount: students.length,
  };
}

/** 숫자를 누르면 맡은 선생님의 목록으로 (그 페이지가 원래 권한대로 판정한다). 학번·이름은 주소에 넣지 않는다 (C3) */
export function listHref(area: ReportAreaFilter, filter: string, o: { classKey?: string; courseId?: string; section?: string | null }): string {
  const q = (p: Record<string, string | undefined | null>) => Object.entries(p).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
  if (o.courseId) return `/teacher/setuk?${q({ course: o.courseId, section: o.section, filter })}`;
  switch (area) {
    case "자율·자치":
    case "동아리":
    case "진로":
      return `/teacher/write?${q({ area, filter })}`;
    case "행발":
      return `/homeroom/behavior?${q({ filter })}`;
    case "프로그램 초안":
      return `/teacher/drafts?${q({ filter })}`;
    default:
      return `/homeroom/students?${q({ class: o.classKey, filter })}`;
  }
}
