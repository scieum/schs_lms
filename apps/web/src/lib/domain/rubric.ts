// 루브릭 채점 수행평가 (Figma N72, 2026-10-24 선생님 요청 "클리포처럼"): 수행평가 탭의 다른 종류.
// 평가 기준(배점 · 연결한 성취기준) × 수준(상중하 또는 A~E, 수준마다 설명 · 점수). AI가 답안을 읽고 기준마다 수준을 제안하면
// 교사가 고쳐 확정한다. 확정하면 점수가 남고 "조각으로 남길 글"이 수행평가 조각이 된다. 성적 기능(FEATURE_SCORES)과는 다른 기능.

export type RubricScale = "상중하" | "A-E";
export const RUBRIC_SCALES: RubricScale[] = ["상중하", "A-E"];
export const SCALE_LABELS: Record<RubricScale, string[]> = { 상중하: ["상", "중", "하"], "A-E": ["A", "B", "C", "D", "E"] };
export const SCALE_NAME: Record<RubricScale, string> = { 상중하: "3단계 · 상중하", "A-E": "5단계 · A~E" };
/** 수준 점수 기본값: 배점에 곱하는 비율 */
const RATIO: Record<RubricScale, number[]> = { 상중하: [1, 0.6, 0.3], "A-E": [1, 0.8, 0.6, 0.4, 0.2] };

export type RubricLevel = { label: string; points: number; desc: string };
export type RubricCriterion = { id: string; name: string; points: number; levels: RubricLevel[] };
export type Rubric = { scale: RubricScale; criteria: RubricCriterion[]; standards: string[] };

export const RUBRIC_LIMITS = { criteria: 8, name: 30, desc: 200, points: 100, total: 200, standards: 6 } as const;

export function defaultLevels(scale: RubricScale, points: number, descs: string[] = []): RubricLevel[] {
  return SCALE_LABELS[scale].map((label, i) => ({ label, points: Math.max(0, Math.round(points * RATIO[scale][i])), desc: descs[i] ?? "" }));
}

let seq = 0;
export const newCriterionId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newCriterion(scale: RubricScale, points = 10, name = ""): RubricCriterion {
  return { id: newCriterionId(), name, points, levels: defaultLevels(scale, points) };
}

export const emptyRubric = (scale: RubricScale = "상중하"): Rubric => ({ scale, criteria: [newCriterion(scale)], standards: [] });

export const rubricTotal = (r: Rubric) => r.criteria.reduce((s, c) => s + c.points, 0);

/** 단계를 바꾸면 수준 칸을 새 단계로 (설명은 위에서부터 이어 받는다) */
export function changeScale(r: Rubric, scale: RubricScale): Rubric {
  return { ...r, scale, criteria: r.criteria.map((c) => ({ ...c, levels: defaultLevels(scale, c.points, c.levels.map((l) => l.desc)) })) };
}

/** 배점을 바꾸면 수준 점수를 비율대로 다시 */
export function changePoints(c: RubricCriterion, scale: RubricScale, points: number): RubricCriterion {
  return { ...c, points, levels: defaultLevels(scale, points, c.levels.map((l) => l.desc)) };
}

export function checkRubric(r: Rubric): string | null {
  if (!RUBRIC_SCALES.includes(r.scale)) return "수준 단계를 골라 주세요";
  if (!r.criteria.length) return "평가 기준을 하나 이상 넣어 주세요";
  if (r.criteria.length > RUBRIC_LIMITS.criteria) return `평가 기준은 ${RUBRIC_LIMITS.criteria}개까지예요`;
  if (r.standards.length > RUBRIC_LIMITS.standards) return `성취기준은 ${RUBRIC_LIMITS.standards}개까지 연결해요`;
  const n = SCALE_LABELS[r.scale].length;
  for (const [i, c] of r.criteria.entries()) {
    const at = `${i + 1}번째 기준`;
    if (!c.name.trim()) return `${at} 이름을 적어 주세요`;
    if (c.name.trim().length > RUBRIC_LIMITS.name) return `${at} 이름은 ${RUBRIC_LIMITS.name}자까지예요`;
    if (!Number.isInteger(c.points) || c.points < 1 || c.points > RUBRIC_LIMITS.points) return `${at} 배점은 1~${RUBRIC_LIMITS.points}점이에요`;
    if (c.levels.length !== n) return `${at} 수준이 ${n}개여야 해요`;
    for (const l of c.levels) {
      if (!Number.isInteger(l.points) || l.points < 0 || l.points > c.points) return `${at} '${l.label}' 점수는 0~${c.points}점이에요`;
      if (l.desc.length > RUBRIC_LIMITS.desc) return `${at} '${l.label}' 설명은 ${RUBRIC_LIMITS.desc}자까지예요`;
    }
  }
  if (rubricTotal(r) > RUBRIC_LIMITS.total) return `총점은 ${RUBRIC_LIMITS.total}점까지예요`;
  return null;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);

/** DB · 화면에서 온 값을 루브릭 모양으로 (모르는 값은 버린다). 모양이 아니면 null */
export function parseRubric(v: unknown): Rubric | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const scale = RUBRIC_SCALES.includes(o.scale as RubricScale) ? (o.scale as RubricScale) : "상중하";
  const labels = SCALE_LABELS[scale];
  const criteria = (Array.isArray(o.criteria) ? o.criteria : []).slice(0, RUBRIC_LIMITS.criteria).map((x): RubricCriterion => {
    const c = (x ?? {}) as Record<string, unknown>;
    const points = int(c.points, 1, RUBRIC_LIMITS.points, 10);
    const lv = Array.isArray(c.levels) ? (c.levels as Record<string, unknown>[]) : [];
    return {
      id: str(c.id, 40) || newCriterionId(),
      name: str(c.name, RUBRIC_LIMITS.name),
      points,
      levels: labels.map((label, i) => ({ label, points: int(lv[i]?.points, 0, points, defaultLevels(scale, points)[i].points), desc: str(lv[i]?.desc, RUBRIC_LIMITS.desc) })),
    };
  });
  if (!criteria.length) return null;
  const standards = (Array.isArray(o.standards) ? o.standards : []).filter((s): s is string => typeof s === "string").slice(0, RUBRIC_LIMITS.standards);
  return { scale, criteria, standards };
}

// ---------- 채점 ----------

/** 기준 하나의 판정: level = 수준 순서(0 = 가장 높음) */
export type GradePick = { criterionId: string; level: number; reason: string };
export type GradeStatus = "ai" | "confirmed";
export type AssessmentGrade = {
  id: string;
  assessmentId: string;
  studentId: string;
  teacherId: string;
  picks: GradePick[];
  total: number;
  status: GradeStatus;
  /** AI가 답안에서 읽은 것 (이름 · 학번 가림) */
  reading: string;
  /** 조각으로 남길 글 */
  piece: string;
  createdAt: string;
};

export const GRADE_LIMITS = { reason: 200, reading: 1200, piece: 600 } as const;

export function gradeTotal(r: Rubric, picks: GradePick[]): number {
  return r.criteria.reduce((s, c) => {
    const p = picks.find((x) => x.criterionId === c.id);
    return s + (p ? c.levels[p.level]?.points ?? 0 : 0);
  }, 0);
}

/** 모든 기준에 수준이 있는지 · 수준 번호가 맞는지. 맞으면 기준 순서대로 정리해 돌려준다 */
export function checkPicks(r: Rubric, picks: GradePick[]): { ok: true; picks: GradePick[] } | { ok: false; error: string } {
  const out: GradePick[] = [];
  for (const c of r.criteria) {
    const p = picks.find((x) => x.criterionId === c.id);
    if (!p || !Number.isInteger(p.level) || p.level < 0 || p.level >= c.levels.length) return { ok: false, error: `'${c.name}' 수준을 골라 주세요` };
    out.push({ criterionId: c.id, level: p.level, reason: String(p.reason ?? "").slice(0, GRADE_LIMITS.reason) });
  }
  return { ok: true, picks: out };
}

/** 학생마다 가장 최근 판정 (확정이 AI 제안보다 앞서지 않는다 — 시간순 마지막) */
export function latestGrades(list: AssessmentGrade[]): Map<string, AssessmentGrade> {
  const m = new Map<string, AssessmentGrade>();
  for (const g of [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) m.set(g.studentId, g);
  return m;
}

/** "주장의 타당성 중 5 · 근거 활용 상 8" */
export function gradeLine(r: Rubric, picks: GradePick[]): string {
  return r.criteria.map((c) => {
    const p = picks.find((x) => x.criterionId === c.id);
    const l = p ? c.levels[p.level] : null;
    return l ? `${c.name} ${l.label} ${l.points}` : null;
  }).filter(Boolean).join(" · ");
}

/** 점수 엑셀 (N72): 제목 줄 + 학생마다 한 줄 — 기준마다 "수준 점수", 합계, 상태(확정 · AI 제안 · 비어 있음) */
export function scoreSheet(r: Rubric, students: { no: string; name: string; id: string }[], latest: Map<string, AssessmentGrade>): { head: string[]; rows: (string | number)[][] } {
  const head = ["학번", "이름", ...r.criteria.map((c) => `${c.name} (${c.points})`), `합계 (${rubricTotal(r)})`, "상태"];
  const rows = students.map((s) => {
    const g = latest.get(s.id);
    const cells = r.criteria.map((c) => {
      const p = g?.picks.find((x) => x.criterionId === c.id);
      const l = p ? c.levels[p.level] : null;
      return l ? `${l.label} ${l.points}` : "";
    });
    return [s.no, s.name, ...cells, g ? gradeTotal(r, g.picks) : "", g ? (g.status === "confirmed" ? "확정" : "AI 제안") : ""];
  });
  return { head, rows };
}
