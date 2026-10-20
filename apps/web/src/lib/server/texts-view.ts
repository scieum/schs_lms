import "server-only";
import { homeroomStudents, type ActivityArea } from "@/lib/domain/activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { can } from "@/lib/domain/policy";
import { rowNumbers, sortLines, type LogRow, type TextRow, type TextsTab } from "@/lib/domain/texts-view";
import type { Student, Viewer } from "@/lib/domain/types";
import { mySetukScopes, resolveScope, textStatus, type ClassScopeInput, type ResolvedScope } from "./class-scope";
import { scopeRows } from "./class-write";
import { repo } from "./repo";

// 글 모아 보기 (Figma N49 (d), /teacher/texts) 서버 쪽: 탭마다 고를 수 있는 범위(내 분반 · 담임 반 · 내 동아리)와 행.
// 권한 · 범위는 class-scope(resolveScope)와 누가기록 화면과 같은 규칙. 실명은 내 담당 학생만, URL 에는 내부 id 만.

export type LogsScope = { area: ActivityArea; clubId: string | null };

export type TextsOption = {
  /** URL 쿼리 (내부 id 만) */
  query: Record<string, string>;
  label: string;
  /** 고르기 줄 값 비교용 */
  key: string;
} & ({ kind: "scope"; input: ClassScopeInput } | { kind: "logs"; input: LogsScope });

const byNo = (a: Student, b: Student) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number;

/** 탭마다 고를 수 있는 범위 (라벨에 학생 수) */
export async function textsOptions(v: Viewer, tab: TextsTab): Promise<TextsOption[]> {
  if (v.kind !== "teacher") return [];
  const h = v.teacher.homeroom;
  const cls = h ? `${h.grade}학년 ${h.classNo}반` : "";
  const myClubs = async () => (await repo.listClubs(schoolYear())).filter((c) => c.advisorId === v.accountId);
  if (tab === "setuk") {
    if (!can(v, "setuk.write")) return [];
    const out: TextsOption[] = [];
    for (const input of await mySetukScopes(v)) {
      if (input.kind !== "setuk") continue;
      const r = await resolveScope(v, input);
      if (!r) continue;
      const query: Record<string, string> = { course: input.courseId, ...(input.section ? { section: input.section } : {}) };
      out.push({ kind: "scope", input, query, key: `${input.courseId}:${input.section ?? ""}`, label: `${r.title} · ${r.students.length}명` });
    }
    return out;
  }
  if (tab === "record" || tab === "behavior") {
    if (!can(v, "record.write")) return [];
    const out: TextsOption[] = [];
    const areas = tab === "behavior" ? (["행발"] as const) : (["자율·자치", "진로"] as const);
    if (h) {
      for (const area of areas) {
        const r = await resolveScope(v, { kind: "record", area });
        if (r) out.push({ kind: "scope", input: { kind: "record", area }, query: { area }, key: area, label: `${tab === "behavior" ? cls : r.title} · ${r.students.length}명` });
      }
    }
    if (tab === "record") {
      for (const c of await myClubs()) {
        const input: ClassScopeInput = { kind: "record", area: "동아리", clubId: c.id };
        const r = await resolveScope(v, input);
        if (r) out.push({ kind: "scope", input, query: { area: "동아리", club: c.id }, key: `동아리:${c.id}`, label: `${c.name} (동아리) · ${r.students.length}명` });
      }
    }
    return out;
  }
  // 누가기록: 내 동아리 · 담임 반 자율 · 진로 (누가기록 화면과 같은 범위)
  if (!can(v, "logs.write")) return [];
  const out: TextsOption[] = [];
  for (const c of await myClubs()) {
    const n = (await repo.listClubMembers(c.id)).length;
    out.push({ kind: "logs", input: { area: "동아리", clubId: c.id }, query: { area: "동아리", club: c.id }, key: `동아리:${c.id}`, label: `${c.name} (동아리) · ${n}명` });
  }
  if (h) {
    const n = homeroomStudents(v, await repo.listStudents()).length;
    for (const area of ["자율·자치", "진로"] as const) {
      out.push({ kind: "logs", input: { area, clubId: null }, query: { area }, key: area, label: `${cls} ${area === "자율·자치" ? "자율" : area} · ${n}명` });
    }
  }
  return out;
}

/** 쿼리에 맞는 범위 (없으면 첫째) */
export function pickOption(opts: TextsOption[], q: { course?: string; section?: string; area?: string; club?: string }): TextsOption | null {
  const want = q.course ? `${q.course}:${q.section ?? ""}` : q.area ? (q.club ? `${q.area}:${q.club}` : q.area) : "";
  return opts.find((o) => o.key === want) ?? opts[0] ?? null;
}

/** 쓰러 가기 › (그 학생 편집기) */
function editorHref(r: ResolvedScope, studentId: string): string {
  if (r.kind === "setuk") return `/teacher/setuk?course=${r.course!.id}${r.section ? `&section=${encodeURIComponent(r.section)}` : ""}&student=${studentId}`;
  if (r.areaKey === "행발") return `/homeroom/behavior?student=${studentId}`;
  return `/teacher/write?area=${encodeURIComponent(r.areaKey)}${r.clubId ? `&club=${r.clubId}` : ""}&student=${studentId}`;
}

export type TextsData = { scope: ResolvedScope; rows: (TextRow & { href: string })[] };

/** 세특 · 창체 · 행발 행: 반 전체 (확정만/전체 거르기는 화면 쪽 showRows) */
export async function textsRows(v: Viewer, input: ClassScopeInput): Promise<TextsData | null> {
  const r = await resolveScope(v, input);
  if (!r) return null;
  const rows = await scopeRows(r, "all"); // "all" 은 거르지 않으므로 r.students 와 같은 순서
  const nos = rowNumbers(r.students);
  return {
    scope: r,
    rows: r.students.map((s, i) => ({
      id: s.id, no: nos[i], name: s.name, text: rows[i]?.["최종 글"] ?? "", bytes: rows[i]?.바이트 ?? 0,
      status: textStatus(r.latest.get(s.id)), href: editorHref(r, s.id),
    })),
  };
}

/** 누가기록 행: 기록이 있는 학생만 (최신 위). students = 범위 학생 수 */
export async function logsRows(v: Viewer, input: LogsScope): Promise<{ students: number; rows: LogRow[]; href: string } | null> {
  if (v.kind !== "teacher") return null;
  const all = await repo.listStudents();
  let students: Student[] = [];
  if (input.area === "동아리") {
    const club = input.clubId ? await repo.getClub(input.clubId) : null;
    if (!club || club.advisorId !== v.accountId) return null;
    const ids = new Set(await repo.listClubMembers(club.id));
    students = all.filter((s) => ids.has(s.id)).sort(byNo);
  } else {
    if (!v.teacher.homeroom) return null;
    students = homeroomStudents(v, all);
  }
  const logs = (await repo.listActivityLogs(input.area, students.map((s) => s.id))).filter((l) => input.area !== "동아리" || l.clubId === input.clubId);
  const nos = rowNumbers(students);
  const rows: LogRow[] = students.flatMap((s, i) => {
    const lines = sortLines(logs.filter((l) => l.studentId === s.id).map((l) => ({ date: l.date, content: l.content })));
    return lines.length ? [{ id: s.id, no: nos[i], name: s.name, lines }] : [];
  });
  return { students: students.length, rows, href: `/teacher/logs?area=${encodeURIComponent(input.area)}${input.clubId ? `&club=${input.clubId}` : ""}` };
}
