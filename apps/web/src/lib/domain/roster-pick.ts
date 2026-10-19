// 이동반 명단 직접 고르기 (Figma N37): 엑셀 없이 등록된 학생 목록에서 분반 명단을 고른다.
// 거르기(학년·반·찾기) · 고르기(한 명 · 보이는 학생 모두) · 다른 분반에서 옮기기 — 모두 순수 함수.

export type PickStudent = { id: string; studentNo: string; grade: number; classNo: number; number: number; name: string };
export type PickFilter = { grade: number; classNo: number | null; q: string };
/** 분반 이름 → 학생 id 목록 (같은 교사·같은 과목) */
export type SectionMembers = Record<string, string[]>;

const byNo = (a: PickStudent, b: PickStudent) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number || a.name.localeCompare(b.name, "ko");

/** 찾는 말이 있으면 학년·반과 상관없이 이름·학번으로 찾고, 없으면 학년(+반)으로 거른다. 학번 순 */
export function filterStudents<T extends PickStudent>(list: T[], f: PickFilter): T[] {
  const q = f.q.replace(/\s+/g, "");
  const out = q
    ? list.filter((s) => s.name.replace(/\s+/g, "").includes(q) || s.studentNo.startsWith(q))
    : list.filter((s) => s.grade === f.grade && (f.classNo === null || s.classNo === f.classNo));
  return [...out].sort(byNo);
}

/** 학년의 반 목록 (등록된 학생 기준) */
export function classesOf(list: PickStudent[], grade: number): number[] {
  return [...new Set(list.filter((s) => s.grade === grade).map((s) => s.classNo))].sort((a, b) => a - b);
}

/** 반마다 고른 학생 수 (그 학년만) */
export function pickedByClass(list: PickStudent[], picked: string[], grade: number): Record<number, number> {
  const set = new Set(picked);
  const out: Record<number, number> = {};
  for (const s of list) if (s.grade === grade && set.has(s.id)) out[s.classNo] = (out[s.classNo] ?? 0) + 1;
  return out;
}

/** 한 명 넣기·빼기 */
export function togglePick(picked: string[], id: string): string[] {
  return picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
}

/** 보이는 학생이 모두 골라졌는지 */
export function pickState(picked: string[], ids: string[]): "all" | "some" | "none" {
  if (!ids.length) return "none";
  const set = new Set(picked);
  const n = ids.filter((id) => set.has(id)).length;
  return n === 0 ? "none" : n === ids.length ? "all" : "some";
}

/** 보이는 학생 모두 고르기(on) · 모두 빼기(off) — 다른 학생은 그대로 */
export function pickAll(picked: string[], ids: string[], on: boolean): string[] {
  if (!on) {
    const drop = new Set(ids);
    return picked.filter((id) => !drop.has(id));
  }
  const set = new Set(picked);
  return [...picked, ...ids.filter((id) => !set.has(id))];
}

/** 학생 id → 이미 들어 있는 다른 분반 이름 (지금 분반은 빼고) */
export function otherSectionOf(members: SectionMembers, current: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [section, ids] of Object.entries(members)) {
    if (section === current) continue;
    for (const id of ids) if (!out.has(id)) out.set(id, section);
  }
  return out;
}

/** 저장 계획: 지금 분반 = 고른 학생, 다른 분반에 있던 고른 학생은 그 분반에서 뺀다 (옮기기) */
export function planPick(members: SectionMembers, current: string, picked: string[]): {
  ids: string[];
  /** 바뀌는 다른 분반 → 남는 학생 */
  others: { section: string; ids: string[]; moved: number }[];
  moved: number;
} {
  const ids = [...new Set(picked)];
  const set = new Set(ids);
  const others = Object.entries(members)
    .filter(([section]) => section !== current)
    .map(([section, list]) => ({ section, ids: list.filter((id) => !set.has(id)), moved: list.filter((id) => set.has(id)).length }))
    .filter((x) => x.moved > 0);
  return { ids, others, moved: others.reduce((n, x) => n + x.moved, 0) };
}

/** "2분반에서 2명 · 3분반에서 1명" (옮겨 오는 학생 안내) */
export function movedNote(members: SectionMembers, current: string, picked: string[]): string {
  return planPick(members, current, picked).others.map((x) => `${x.section}에서 ${x.moved}명`).join(" · ");
}
