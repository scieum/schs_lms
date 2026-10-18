import "server-only";
// 상담·학생 기록 화면이 같이 쓰는 서버 읽기 도우미. 권한 판정은 domain/counsel.ts 순수 함수로만 한다.
import type { ActivityLog, ServiceRecord } from "@/lib/domain/activity";
import {
  assignedStudents, latestCounsel, recordsForStudent, visibleCounsel,
  type CounselRecord, type PastRecord,
} from "@/lib/domain/counsel";
import { schoolYear, type Course } from "@/lib/domain/curriculum";
import { latestByStudent, type SetukRecord } from "@/lib/domain/setuk";
import type { Student, Viewer } from "@/lib/domain/types";
import { repo } from "./repo";

/** 이 교사의 담당 학생 (관리자 = 전체) */
export async function loadAssigned(v: Viewer): Promise<Student[]> {
  if (v.kind !== "teacher") return [];
  const [students, courses, mine, clubs, counseled, rosters] = await Promise.all([
    repo.listStudents(),
    repo.listCourses(schoolYear()),
    repo.listTeacherCourses(v.accountId),
    repo.listClubs(schoolYear()),
    repo.listCounsel({ authorId: v.accountId }),
    repo.listCourseRosters(v.accountId),
  ]);
  const byId = new Map(courses.map((c) => [c.id, c]));
  const courseClasses = mine.flatMap((tc) => {
    const c = byId.get(tc.courseId);
    return c && tc.mode !== "moving" ? [{ grade: c.grade, classes: tc.classes }] : [];
  });
  // 이동반: 저장된 분반 명단의 학생
  const moving = new Map(mine.filter((tc) => tc.mode === "moving").map((tc) => [tc.courseId, tc.sections ?? []]));
  const rosterIds = rosters.filter((r) => moving.get(r.courseId)?.includes(r.section)).flatMap((r) => r.studentIds);
  const myClubs = clubs.filter((c) => c.advisorId === v.accountId);
  const members = (await Promise.all(myClubs.map((c) => repo.listClubMembers(c.id)))).flat();
  return assignedStudents(v, students, { courseClasses, clubMemberIds: members, counseledIds: counseled.map((r) => r.studentId), rosterIds });
}

/** 볼 수 있는 상담 기록만, 마지막 버전만, 최신순 */
export async function loadCounsel(v: Viewer, students: Student[]): Promise<CounselRecord[]> {
  if (!students.length) return [];
  const all = await repo.listCounsel({ studentIds: students.map((s) => s.id) });
  return latestCounsel(visibleCounsel(v, all, new Map(students.map((s) => [s.id, s]))));
}

export async function teacherNames(): Promise<Map<string, string>> {
  return new Map((await repo.listTeachers()).map((t) => [t.id, t.name]));
}

export interface SetukView { record: SetukRecord; course: Course }

/** 이 학생의 올해 교과 세특(과목별 마지막 버전) */
export async function loadStudentSetuk(student: Student, year = schoolYear()): Promise<SetukView[]> {
  const courses = (await repo.listCourses(year)).filter((c) => c.grade === student.grade);
  // 과목마다 따로 묻지 않고 한 번에 (과목이 40개쯤이라 따로 물으면 몇 초 걸렸다)
  const records = await repo.listSetukForStudent(student.id, courses.map((c) => c.id));
  const out: SetukView[] = [];
  for (const course of courses) {
    const r = latestByStudent(records.filter((x) => x.courseId === course.id)).get(student.id);
    if (r && r.content.trim()) out.push({ record: r, course });
  }
  return out.sort((a, b) => a.course.semester - b.course.semester || a.course.subject.localeCompare(b.course.subject, "ko"));
}

export async function loadStudentLogs(studentId: string): Promise<ActivityLog[]> {
  const areas = ["자율·자치", "동아리", "진로"] as const;
  const logs = (await Promise.all(areas.map((a) => repo.listActivityLogs(a, [studentId])))).flat();
  return logs.sort((a, b) => b.date.localeCompare(a.date));
}

export async function loadStudentService(studentId: string): Promise<ServiceRecord[]> {
  return (await repo.listServiceRecords({ studentIds: [studentId] })).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * 학생이 보는 확정 생기부: 지난 학년도 확정본(past_records) + 지난 학년도 확정 세특.
 * 올해 기록은 넣지 않는다 (C5). 확정 세특의 id 는 'setuk:<id>'.
 */
export async function loadMyRecords(v: Viewer): Promise<PastRecord[]> {
  if (v.kind !== "student") return [];
  const s = v.student;
  const now = schoolYear();
  const past = await repo.listPastRecords([s.id]);
  const names = await teacherNames();
  const fromSetuk: PastRecord[] = [];
  for (let back = 1; back < s.grade; back++) {
    const year = now - back;
    const grade = s.grade - back;
    const courses = (await repo.listCourses(year)).filter((c) => c.grade === grade);
    for (const c of courses) {
      const r = latestByStudent(await repo.listSetuk(c.id)).get(s.id);
      if (!r || r.status !== "confirmed" || !r.content.trim()) continue;
      // 같은 과목이 past_records 에 이미 있으면 그쪽을 쓴다
      if (past.some((p) => p.year === year && p.area === "교과세특" && p.title === c.subject)) continue;
      fromSetuk.push({
        id: `setuk:${r.id}`, studentId: s.id, year, grade, area: "교과세특", title: c.subject, content: r.content,
        teacherName: names.get(r.authorId) ?? "담당", confirmedAt: r.createdAt.slice(0, 10),
      });
    }
  }
  return recordsForStudent(v, [...past, ...fromSetuk], now);
}

export const fmtDate = (d: string) => d.slice(0, 10).replaceAll("-", ".");
export const shortDate = (d: string) => d.slice(5, 10).replace("-", ".");

export interface ActivityItem { key: string; label: string; title: string; meta: string; status: string; content: string; date: string }

/** 세특·누가기록·봉사를 한 목록으로 (최신순). 화면에서 그대로 그린다 */
export function activityItems(setuk: SetukView[], logs: ActivityLog[], service: ServiceRecord[], names: Map<string, string>): ActivityItem[] {
  const out: ActivityItem[] = [
    ...setuk.map(({ record: r, course: c }) => ({
      key: `s-${r.id}`, label: "교과세특", title: c.subject, date: r.createdAt.slice(0, 10),
      meta: `${names.get(r.authorId) ?? "담당"} · ${c.semester}학기 · ${r.content.length}자`,
      status: r.status === "confirmed" ? "확정" : "작성 중", content: r.content,
    })),
    ...logs.map((l) => ({
      key: `l-${l.id}`, label: `창체 ${l.area}`, title: l.content.length > 24 ? `${l.content.slice(0, 24)}…` : l.content, date: l.date,
      meta: `${names.get(l.authorId) ?? "담당"} · ${shortDate(l.date)}`, status: "누가기록", content: l.content,
    })),
    ...service.map((s) => ({
      key: `v-${s.id}`, label: "봉사", title: s.organization, date: s.date,
      meta: `${s.activity} · ${s.hours}시간 · ${shortDate(s.date)}${s.endDate && s.endDate !== s.date ? `~${shortDate(s.endDate)}` : ""}`, status: s.status === "confirmed" ? "확인 완료" : "확인 대기", content: s.activity,
    })),
  ];
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
