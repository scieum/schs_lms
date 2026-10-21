import "server-only";
import { homeroomStudents } from "@/lib/domain/activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { inTerm, reportStatus, termRange, type ReportLog, type ReportScopeKind, type ReportTerm, type StudentReport } from "@/lib/domain/report";
import type { Student, Viewer } from "@/lib/domain/types";
import { latestRecordByStudent, type RecordArea } from "@/lib/domain/writing";
import { mySetukScopes, resolveScope } from "./class-scope";
import { loadCounsel, loadStudentSetuk } from "./counsel";
import { listMemosWithPieces, memoPieces } from "./merge-pieces";
import { repo } from "./repo";

// 학생 리포트 (Figma N55) 서버 쪽: 고를 수 있는 범위와 학생별 기록.
// 범위 · 권한은 글 모아 보기 · 반 전체 쓰기와 같은 규칙(class-scope): 담임 = 우리 반 전 영역(상담은 볼 수 있는 것만), 분반 = 그 과목 세특 · 조각, 동아리 = 동아리 특기사항 · 누가기록.

export type ReportScope = { key: string; kind: ReportScopeKind; label: string; count: number; courseId?: string; section?: string | null; clubId?: string };

const classLine = (s: Student) => (s.school ? `${s.school} · ${s.grade}학년 ${s.classNo}반 ${s.number}번` : `${s.grade}학년 ${s.classNo}반 ${s.number}번 · ${s.studentNo}`);
const empty = (s: Student): StudentReport => ({ id: s.id, name: s.name, classLine: classLine(s), setuk: [], record: [], behavior: null, logs: [], programs: [], service: [], counsel: [] });
const recent = (logs: ReportLog[]) => logs.sort((a, b) => b.date.localeCompare(a.date));

/** 이 교사가 리포트로 뽑을 수 있는 범위: 우리 반 · 내 분반 · 내 동아리 (주소 key 는 내부 id 만) */
export async function reportScopes(v: Viewer): Promise<ReportScope[]> {
  if (v.kind !== "teacher") return [];
  const out: ReportScope[] = [];
  const h = v.teacher.homeroom;
  if (h) out.push({ key: "homeroom", kind: "homeroom", label: `우리 반 ${h.grade}학년 ${h.classNo}반`, count: homeroomStudents(v, await repo.listStudents()).length });
  for (const input of await mySetukScopes(v)) {
    if (input.kind !== "setuk") continue;
    const r = await resolveScope(v, input);
    if (r) out.push({ key: `course:${input.courseId}${input.section ? `:${input.section}` : ""}`, kind: "course", label: r.title, count: r.students.length, courseId: input.courseId, section: input.section ?? null });
  }
  for (const c of (await repo.listClubs(schoolYear())).filter((c) => c.advisorId === v.accountId)) {
    out.push({ key: `club:${c.id}`, kind: "club", label: `${c.name} (동아리)`, count: (await repo.listClubMembers(c.id)).length, clubId: c.id });
  }
  return out;
}

/** 고른 범위 · 학기의 학생별 기록 (항목 거르기는 화면에서). 볼 수 없는 범위면 null */
export async function loadReports(v: Viewer, scope: ReportScope, term: ReportTerm): Promise<StudentReport[] | null> {
  if (v.kind !== "teacher") return null;
  const year = schoolYear();
  const range = termRange(year, term);

  if (scope.kind === "course") {
    const r = await resolveScope(v, { kind: "setuk", courseId: scope.courseId!, section: scope.section });
    if (!r || !r.course) return null;
    const ids = r.students.map((s) => s.id);
    const memos = ids.length ? await listMemosWithPieces(`세특:${r.course.id}`, ids) : [];
    return r.students.map((s) => {
      const rec = r.latest.get(s.id);
      const logs = memoPieces(memos.filter((m) => m.studentId === s.id))
        .filter((p) => !p.date || inTerm(p.date, range))
        .map((p) => ({ date: (p.date ?? "").slice(0, 10), tag: "조각", text: p.text }));
      return { ...empty(s), setuk: [{ label: r.course!.subject, status: reportStatus(rec), text: rec?.content ?? "" }], logs: recent(logs) };
    });
  }

  if (scope.kind === "club") {
    const r = await resolveScope(v, { kind: "record", area: "동아리", clubId: scope.clubId });
    if (!r) return null;
    const ids = r.students.map((s) => s.id);
    const logs = (await repo.listActivityLogs("동아리", ids)).filter((l) => l.clubId === scope.clubId && inTerm(l.date, range));
    return r.students.map((s) => {
      const rec = r.latest.get(s.id);
      return {
        ...empty(s),
        record: [{ label: r.clubName ?? "동아리", status: reportStatus(rec), text: rec?.content ?? "" }],
        logs: recent(logs.filter((l) => l.studentId === s.id).map((l) => ({ date: l.date, tag: "동아리", text: l.content }))),
      };
    });
  }

  // 우리 반: 전 영역
  const students = homeroomStudents(v, await repo.listStudents());
  if (!students.length) return v.teacher.homeroom ? [] : null;
  const ids = students.map((s) => s.id);
  const areas: RecordArea[] = ["자율·자치", "동아리", "진로", "행발"];
  const [drafts, logLists, service, finals, counsel, setuk] = await Promise.all([
    Promise.all(areas.map((area) => repo.listRecordDrafts({ area, year, studentIds: ids }).then(latestRecordByStudent))),
    Promise.all((["자율·자치", "동아리", "진로"] as const).map((a) => repo.listActivityLogs(a, ids))),
    repo.listServiceRecords({ studentIds: ids }),
    repo.listDraftsForStudents(ids),
    loadCounsel(v, students),
    Promise.all(students.map((s) => loadStudentSetuk(s, year))),
  ]);
  const byArea = new Map(areas.map((a, i) => [a, drafts[i]]));
  const short: Record<string, string> = { "자율·자치": "자율", 동아리: "동아리", 진로: "진로" };
  const logs = logLists.flat().filter((l) => inTerm(l.date, range));
  return students.map((s, i) => {
    const text = (area: RecordArea, label: string) => { const r = byArea.get(area)?.get(s.id); return { label, status: reportStatus(r), text: r?.content ?? "" }; };
    return {
      ...empty(s),
      setuk: setuk[i].filter(({ course }) => term === "year" || course.semester === term).map(({ record, course }) => ({ label: course.subject, status: reportStatus(record), text: record.content })),
      record: [text("자율·자치", "자율·자치"), text("동아리", "동아리"), text("진로", "진로")],
      behavior: text("행발", "행발"),
      logs: recent(logs.filter((l) => l.studentId === s.id).map((l) => ({ date: l.date, tag: short[l.area] ?? l.area, text: l.content }))),
      programs: finals.filter((d) => d.studentId === s.id && inTerm(d.finalizedAt, range)).map((d) => ({ title: d.programTitle, date: d.finalizedAt.slice(0, 10) })),
      service: service.filter((x) => x.studentId === s.id && x.status === "confirmed" && inTerm(x.date, range)).sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ date: x.date, activity: x.activity, hours: x.hours })),
      counsel: recent(counsel.filter((c) => c.studentId === s.id && inTerm(c.date, range)).map((c) => ({ date: c.date, tag: c.area, text: c.content }))),
    };
  });
}

