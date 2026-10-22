import "server-only";
import { homeroomStudents } from "@/lib/domain/activity";
import { schoolYear, type Course } from "@/lib/domain/curriculum";
import { NEIS_MAX_BYTES } from "@/lib/domain/length";
import { courseSections, latestByStudent, sectionAllowed, studentsInCourse } from "@/lib/domain/setuk";
import type { Student, Viewer } from "@/lib/domain/types";
import { isRecordArea, latestRecordByStudent, RECORD_LABEL, RECORD_MAX_BYTES, type RecordArea } from "@/lib/domain/writing";
import type { Level } from "@/lib/domain/achievement";
import { exportFileName, statusOf, type ExportRecord, type ExportStudent } from "@/lib/domain/records-export";
import { memoPieces, listMemosWithPieces } from "./merge-pieces";
import { evidenceLogs } from "@/app/(app)/teacher/write/data";
import { repo } from "./repo";

// 반 전체 글 쓰기 · 엑셀로 받기 · 시트용 복사 (Figma N42)가 같이 쓰는 "반" 범위: 세특 분반 · 담임 반 영역 · 동아리.
// 권한은 여기서 한 번에 확인한다 (내 담당 과목·반 학생 / 담임 반 / 내 동아리 부원). 학번·이름은 화면 · 파일에만, URL 에는 내부 id 만.

export type ClassScopeInput = { kind: "setuk"; courseId: string; section?: string | null } | { kind: "record"; area: string; clubId?: string | null };

export type ResolvedScope = {
  kind: "setuk" | "record";
  /** 잠금 · sessionStorage 키 (내부 id 만) */
  key: string;
  /** "물리학 1분반" · "2학년 3반 행발" · "과학탐구반" */
  title: string;
  /** 엑셀 "영역" 칸 · 버튼 영역 이름 ("세특" · "자율" · "진로" · "행발" · "동아리") */
  area: string;
  areaKey: "세특" | RecordArea;
  students: Student[];
  latest: Map<string, ExportRecord & { unit: "bytes" | "chars"; max: number }>;
  maxBytes: number;
  year: number;
  semester: number | null;
  course?: Course;
  section?: string | null;
  clubId?: string | null;
  clubName?: string | null;
  grade?: number;
  classNo?: number;
};

export const AREA_SHORT: Record<"세특" | RecordArea, string> = { 세특: "세특", "자율·자치": "자율", 진로: "진로", 동아리: "동아리", 행발: "행발" };

const byNo = (a: Student, b: Student) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number;

export async function resolveScope(v: Viewer, input: ClassScopeInput): Promise<ResolvedScope | null> {
  if (v.kind !== "teacher") return null;
  // 세특(과목 명단)일 때만 공동교육과정 다른 학교 학생까지 (N54). 담임 · 동아리는 본교만
  const all = await repo.listStudents({ external: input.kind === "setuk" });
  if (input.kind === "setuk") {
    const courseId = String(input.courseId ?? "");
    const section = input.section ? String(input.section) : null;
    const [course, mine, roster] = await Promise.all([repo.getCourse(courseId), repo.listTeacherCourses(v.accountId), repo.getCourseRosters(v.accountId, courseId)]);
    const assignment = mine.find((a) => a.courseId === courseId);
    if (!course || !assignment) return null;
    if (!sectionAllowed(assignment, section)) return null;
    const students = studentsInCourse(all, course, assignment, roster, section);
    const latest = latestByStudent(await repo.listSetuk(course.id));
    return {
      kind: "setuk", key: `setuk:${course.id}${section ? `:${section}` : ""}`,
      title: section ? `${course.subject} ${section}` : course.subject,
      area: "세특", areaKey: "세특", students, maxBytes: NEIS_MAX_BYTES["세특"], year: course.year, semester: course.semester, course, section,
      latest: new Map(students.flatMap((s) => { const r = latest.get(s.id); return r ? [[s.id, r] as const] : []; })),
    };
  }
  const area = String(input.area ?? "");
  if (!isRecordArea(area)) return null;
  let students: Student[] = [];
  let clubName: string | null = null;
  let clubId: string | null = null;
  if (area === "동아리") {
    const club = input.clubId ? await repo.getClub(String(input.clubId)) : null;
    if (!club || club.advisorId !== v.accountId) return null;
    const ids = new Set(await repo.listClubMembers(club.id));
    students = all.filter((s) => ids.has(s.id)).sort(byNo);
    clubName = club.name;
    clubId = club.id;
  } else {
    students = homeroomStudents(v, all);
    if (!v.teacher.homeroom) return null;
  }
  const year = schoolYear();
  const latest = latestRecordByStudent(await repo.listRecordDrafts({ area, year, studentIds: students.map((s) => s.id) }));
  const h = v.teacher.homeroom;
  return {
    kind: "record", key: `record:${area}${clubId ? `:${clubId}` : ""}`,
    title: clubName ?? (h ? `${h.grade}학년 ${h.classNo}반 ${AREA_SHORT[area]}` : RECORD_LABEL[area]),
    area: AREA_SHORT[area], areaKey: area, students, maxBytes: RECORD_MAX_BYTES[area], year, semester: null, clubId, clubName,
    grade: h?.grade, classNo: h?.classNo,
    latest: new Map(students.flatMap((s) => { const r = latest.get(s.id); return r ? [[s.id, r] as const] : []; })),
  };
}

/** 세특 "내 분반 모두": 내 담당 과목(이동반이면 분반마다) */
export async function mySetukScopes(v: Viewer): Promise<ClassScopeInput[]> {
  if (v.kind !== "teacher") return [];
  const [mine, offered] = await Promise.all([repo.listTeacherCourses(v.accountId), repo.listCourses(schoolYear())]);
  return offered.filter((c) => mine.some((a) => a.courseId === c.id)).flatMap((c): ClassScopeInput[] => {
    const a = mine.find((x) => x.courseId === c.id)!;
    return courseSections(a).map((s) => ({ kind: "setuk" as const, courseId: c.id, section: s }));
  });
}

/** 담임 "셋 다": 자율 · 진로 · 행발 */
export const HOMEROOM_AREAS: RecordArea[] = ["자율·자치", "진로", "행발"];

export const exportStudents = (r: ResolvedScope, levels?: Record<string, Level | null>): ExportStudent[] =>
  r.students.map((s) => ({ id: s.id, no: s.studentNo, name: s.name, level: levels?.[s.id] ?? null }));

/** 세특 학생별 성취수준 (N35) */
export async function scopeLevels(r: ResolvedScope): Promise<Record<string, Level | null>> {
  if (r.kind !== "setuk" || !r.course) return {};
  const m = await repo.listLevels({ courseId: r.course.id, year: schoolYear(), semester: r.course.semester }, r.students.map((s) => s.id)).catch(() => ({} as Record<string, Level>));
  return Object.fromEntries(r.students.map((s) => [s.id, m[s.id] ?? null]));
}

/** AI 원안 글 (id → 원안) */
export async function scopeOriginals(r: ResolvedScope): Promise<Map<string, string>> {
  const ids = [...r.latest.values()].map((x) => x.aiOriginalId ?? "").filter(Boolean);
  if (!ids.length) return new Map();
  return new Map((await repo.listAiOriginals(ids)).map((o) => [o.id, o.content]));
}

/** 학생별 활동 메모(합칠 조각) 수: 세특 = 관찰 메모 · 조각 · 공통 활동 · 자료 요약 / 창체 = 누가기록 + 메모 (+ 받은 특색 활동) / 행발 = 세 영역 누가기록 + 메모 + 에피소드 메모 */
export async function memoCounts(r: ResolvedScope): Promise<Map<string, number>> {
  const ids = r.students.map((s) => s.id);
  const out = new Map(ids.map((id) => [id, 0]));
  if (!ids.length) return out;
  const add = (id: string, n: number) => out.set(id, (out.get(id) ?? 0) + n);
  const memoScope = r.kind === "setuk" ? `세특:${r.course!.id}` : r.areaKey;
  const memos = await listMemosWithPieces(memoScope, ids);
  for (const id of ids) add(id, memoPieces(memos.filter((m) => m.studentId === id)).length);
  if (r.kind === "record") {
    const area = r.areaKey as RecordArea;
    const logs = await evidenceLogs(area, ids, r.clubId);
    for (const l of logs) add(l.studentId, 1);
    if (area === "자율·자치" || area === "진로") {
      const want = area === "자율·자치" ? "창체-자율" : "창체-진로";
      for (const d of await repo.listDraftsForStudents(ids).catch(() => [])) if (d.area === want) add(d.studentId, 1);
    }
    if (area === "행발") {
      for (const p of await repo.listBehaviorPicks(ids, schoolYear()).catch(() => [])) if (p.memo.trim()) add(p.studentId, 1);
    }
  }
  return out;
}

/** 엑셀 파일 이름 (all = 내 분반 모두 · 담임 영역 셋 다) */
export function scopeFileName(r: ResolvedScope, all = false): string {
  if (r.kind === "setuk") {
    return all ? `세특_내분반_${r.year}-${r.semester ?? ""}.xlsx` : exportFileName({ kind: "setuk", subject: r.course?.subject ?? "", section: r.section, year: r.year, semester: r.semester ?? 1 });
  }
  return all ? `담임_${r.grade ?? ""}-${r.classNo ?? ""}_${r.year}.xlsx` : exportFileName({ kind: "record", area: r.area, grade: r.grade, classNo: r.classNo, club: r.clubName, year: r.year });
}

export const textStatus =(r: ExportRecord | undefined) => {
  const s = statusOf(r);
  return s === "확정" ? "confirmed" : s === "임시" ? "draft" : "empty";
};
