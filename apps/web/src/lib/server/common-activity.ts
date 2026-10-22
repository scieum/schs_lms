import "server-only";
import { homeroomStudents } from "@/lib/domain/activity";
import { parseScope, progressChip, type CommonActivity, type ScopeRef } from "@/lib/domain/common-activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { sectionAllowed, studentsInCourse } from "@/lib/domain/setuk";
import type { Student, Viewer } from "@/lib/domain/types";
import { RECORD_LABEL } from "@/lib/domain/writing";
import { repo } from "./repo";

// 공통 활동 (Figma N26): 범위(과목·분반 / 담임 반 / 동아리)를 이 교사가 쓸 수 있는지 확인하고 그 학생들을 돌려준다.

export type ResolvedScope = {
  ref: ScopeRef;
  /** "물리학 1분반" · "2학년 3반" · "과학탐구반" */
  label: string;
  /** AI 요약에 붙는 기록 이름 */
  kind: string;
  students: Student[];
  /** 공통 활동 목록으로 돌아갈 주소 */
  backHref: string;
  /** 활동 화면 주소 앞부분 */
  detailBase: string;
};

export async function resolveScope(v: Viewer, scope: string): Promise<ResolvedScope | null> {
  if (v.kind !== "teacher") return null;
  const ref = parseScope(scope);
  if (!ref) return null;
  const all = await repo.listStudents();

  if (ref.kind === "세특") {
    const [course, mine, rosters] = await Promise.all([repo.getCourse(ref.courseId), repo.listTeacherCourses(v.accountId), repo.getCourseRosters(v.accountId, ref.courseId)]);
    const a = mine.find((x) => x.courseId === ref.courseId);
    if (!course || !a) return null;
    if (a.mode === "moving" ? !ref.section || !(a.sections ?? []).includes(ref.section) : !sectionAllowed(a, ref.section)) return null;
    const sec = ref.section ? `&section=${encodeURIComponent(ref.section)}` : "";
    return {
      ref, students: studentsInCourse(all, course, a, rosters, ref.section),
      label: ref.section ? `${course.subject} ${ref.section}` : `${course.subject} ${a.classes.join("·")}반`,
      kind: `${course.subject} 교과 세특`,
      backHref: `/teacher/setuk/collect?course=${course.id}${sec}`, detailBase: "/teacher/setuk/activity",
    };
  }
  if (ref.kind === "동아리") {
    const club = await repo.getClub(ref.clubId);
    if (!club || club.advisorId !== v.accountId || club.year !== schoolYear()) return null;
    const ids = new Set(await repo.listClubMembers(club.id));
    return {
      ref, label: club.name, kind: `${RECORD_LABEL.동아리} (${club.name})`,
      students: all.filter((s) => ids.has(s.id)).sort((x, y) => x.studentNo.localeCompare(y.studentNo)),
      backHref: `/teacher/club/collect?club=${club.id}`, detailBase: "/teacher/write/activity",
    };
  }
  const h = v.teacher.homeroom;
  if (!h || h.grade !== ref.grade || h.classNo !== ref.classNo) return null;
  return {
    ref, label: `${h.grade}학년 ${h.classNo}반`, kind: RECORD_LABEL[ref.kind],
    students: homeroomStudents(v, all),
    backHref: ref.kind === "행발" ? "/homeroom/compose?tab=behavior" : `/homeroom/logs?area=${encodeURIComponent(ref.kind)}`, detailBase: "/teacher/write/activity",
  };
}

export type CommonActivityRow = {
  id: string; name: string; date: string | null; students: number; files: number; made: number;
  chip: ReturnType<typeof progressChip>;
};

/** 공통 활동 카드 목록: 이름 · 날짜 · 학생 n명 · 자료 n개 · 조각 n/학생 수 */
export async function commonActivityRows(scope: string, studentIds: string[]): Promise<CommonActivityRow[]> {
  const list = await repo.listCommonActivities(scope);
  const pieces = await repo.listCommonActivityPieces(list.map((a) => a.id));
  const inScope = new Set(studentIds);
  return list.map((a: CommonActivity) => {
    const mine = pieces.filter((p) => p.activityId === a.id && inScope.has(p.studentId));
    const made = new Set(mine.map((p) => p.studentId)).size;
    return { id: a.id, name: a.name, date: a.date, students: studentIds.length, files: mine.reduce((n, p) => n + p.fileCount, 0), made, chip: progressChip(made, studentIds.length) };
  });
}
