import "server-only";
import { homeroomStudents } from "@/lib/domain/activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { NEIS_MAX_BYTES } from "@/lib/domain/length";
import type { MergePiece } from "@/lib/domain/merge";
import { latestByStudent, statusLabel, studentsInCourse } from "@/lib/domain/setuk";
import type { Student, Viewer } from "@/lib/domain/types";
import { latestRecordByStudent, RECORD_LABEL, RECORD_MAX_BYTES, recordStatus, type RecordArea } from "@/lib/domain/writing";
import { evidenceLogs } from "@/app/(app)/teacher/write/data";
import { listMemosWithPieces, logPieces, memoPieces, programPieces } from "./merge-pieces";
import { repo } from "./repo";

// 생기부 조각 (Figma N13): 학생별로 지금까지 모인 조각(누가기록·관찰 메모·받은 특색 활동 초안)과 저장한 본문을 영역마다 모아 본다.
// 이 교사가 쓰는 영역만: 교과 세특(내 과목·분반), 동아리(지도 동아리), 자율·자치·진로·행발(담임 반).

export type AreaFilter = "세특" | RecordArea;
export type BodyStatus = "확정" | "작성 중" | "미작성";
export type AreaBox = {
  key: string;
  filter: AreaFilter;
  title: string;
  sub: string;
  /** 이 학생 쓰기 화면 (합치기 탭으로 바로) */
  editHref: string;
  maxBytes: number;
  body: { content: string; status: BodyStatus };
  pieces: MergePiece[];
};

type Ref = {
  key: string; filter: AreaFilter; title: string; sub: string; maxBytes: number;
  students: Student[];
  href: (studentId: string) => string;
  load: (ids: string[]) => Promise<{ pieces: Map<string, MergePiece[]>; body: Map<string, { content: string; status: BodyStatus }> }>;
};

const group = (list: (MergePiece & { studentId: string })[]) => {
  const m = new Map<string, MergePiece[]>();
  for (const { studentId, ...p } of list) m.set(studentId, [...(m.get(studentId) ?? []), p]);
  return m;
};

// 이 교사가 볼 수 있는 영역과 학생
async function refsFor(v: Viewer): Promise<Ref[]> {
  if (v.kind !== "teacher") return [];
  const y = schoolYear();
  const [mine, offered, clubs, all, rosters] = await Promise.all([
    repo.listTeacherCourses(v.accountId), repo.listCourses(y), repo.listClubs(y), repo.listStudents(), repo.listCourseRosters(v.accountId),
  ]);
  const refs: Ref[] = [];

  for (const course of offered.filter((c) => mine.some((a) => a.courseId === c.id))) {
    const a = mine.find((x) => x.courseId === course.id)!;
    const rs = rosters.filter((r) => r.courseId === course.id);
    const sections: (string | null)[] = a.mode === "moving" && a.sections?.length ? a.sections : [null];
    for (const sec of sections) {
      const q = `course=${course.id}${sec ? `&section=${encodeURIComponent(sec)}` : ""}`;
      refs.push({
        key: `setuk-${course.id}-${sec ?? ""}`, filter: "세특", title: `${course.subject} 세특`, sub: `${course.grade}학년 ${course.semester}학기${sec ? ` · ${sec}` : ""}`,
        maxBytes: NEIS_MAX_BYTES["세특"], students: studentsInCourse(all, course, a, rs, sec),
        href: (id) => `/teacher/setuk?${q}&student=${id}&panel=merge`,
        load: async (ids) => {
          const [memos, records] = await Promise.all([listMemosWithPieces(`세특:${course.id}`, ids), repo.listSetuk(course.id)]);
          const latest = latestByStudent(records);
          const pieces = new Map(ids.map((id) => [id, memoPieces(memos.filter((m) => m.studentId === id))]));
          const body = new Map(ids.map((id) => [id, { content: latest.get(id)?.content ?? "", status: statusLabel(latest.get(id)) as BodyStatus }]));
          return { pieces, body };
        },
      });
    }
  }

  const recordRef = (area: RecordArea, students: Student[], extra: { key: string; sub: string; clubId?: string }): Ref => ({
    key: extra.key, filter: area, title: area === "동아리" ? `동아리 · ${extra.sub}` : RECORD_LABEL[area], sub: area === "동아리" ? "동아리 특기사항" : extra.sub,
    maxBytes: RECORD_MAX_BYTES[area], students,
    href: (id) => (area === "행발" ? `/homeroom/behavior?student=${id}&panel=merge` : `/teacher/write?area=${encodeURIComponent(area)}${extra.clubId ? `&club=${extra.clubId}` : ""}&student=${id}&panel=merge`),
    load: async (ids) => {
      const programArea = area === "자율·자치" ? "창체-자율" : area === "진로" ? "창체-진로" : null;
      const [logs, memos, drafts, records] = await Promise.all([
        evidenceLogs(area, ids, extra.clubId),
        listMemosWithPieces(area, ids),
        programArea ? repo.listDraftsForStudents(ids) : Promise.resolve([]),
        repo.listRecordDrafts({ area, year: y, studentIds: ids }),
      ]);
      const latest = latestRecordByStudent(records);
      const pieces = group([
        ...ids.flatMap((id) => programPieces(drafts.filter((d) => d.studentId === id && d.area === programArea)).map((p) => ({ ...p, studentId: id }))),
        ...ids.flatMap((id) => logPieces(logs.filter((l) => l.studentId === id)).map((p) => ({ ...p, studentId: id }))),
        ...ids.flatMap((id) => memoPieces(memos.filter((m) => m.studentId === id)).map((p) => ({ ...p, studentId: id }))),
      ]);
      const body = new Map(ids.map((id) => [id, { content: latest.get(id)?.content ?? "", status: recordStatus(latest.get(id)) as BodyStatus }]));
      return { pieces, body };
    },
  });

  for (const club of clubs.filter((c) => c.advisorId === v.accountId)) {
    const ids = new Set(await repo.listClubMembers(club.id));
    refs.push(recordRef("동아리", all.filter((s) => ids.has(s.id)), { key: `club-${club.id}`, sub: club.name, clubId: club.id }));
  }
  const h = v.teacher.homeroom;
  if (h) {
    const kids = homeroomStudents(v, all);
    for (const area of ["자율·자치", "진로", "행발"] as const) refs.push(recordRef(area, kids, { key: area, sub: `${h.grade}학년 ${h.classNo}반` }));
  }
  return refs;
}

export type PiecesBoard = {
  students: (Student & { pieceCount: number })[];
  /** 고른 학생의 영역들 */
  boxes: AreaBox[];
  selected: Student | null;
};

/** 학생 목록(조각 수) + 고른 학생의 영역별 조각 */
export async function piecesBoard(v: Viewer, studentId?: string): Promise<PiecesBoard> {
  const refs = await refsFor(v);
  const loaded = await Promise.all(refs.map(async (r) => ({ r, data: r.students.length ? await r.load(r.students.map((s) => s.id)) : null })));
  const byId = new Map<string, Student & { pieceCount: number }>();
  for (const { r, data } of loaded) {
    for (const s of r.students) {
      const cur = byId.get(s.id) ?? { ...s, pieceCount: 0 };
      cur.pieceCount += data?.pieces.get(s.id)?.length ?? 0;
      byId.set(s.id, cur);
    }
  }
  const students = [...byId.values()].sort((a, b) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number);
  const selected = students.find((s) => s.id === studentId) ?? students[0] ?? null;
  const boxes: AreaBox[] = selected
    ? loaded.filter(({ r }) => r.students.some((s) => s.id === selected.id)).map(({ r, data }) => ({
        key: r.key, filter: r.filter, title: r.title, sub: r.sub, maxBytes: r.maxBytes,
        editHref: r.href(selected.id),
        body: data?.body.get(selected.id) ?? { content: "", status: "미작성" },
        pieces: data?.pieces.get(selected.id) ?? [],
      }))
    : [];
  return { students, boxes, selected };
}
