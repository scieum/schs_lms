// 학교 평가계획서 수행평가 라이브러리 (Figma N78, 2026-10-26 "이 세개의 파일을 토대로 각 과목마다 수행평가 자체를 바로 불러올 수 있도록 라이브러리"):
// 학년별 교수학습 · 평가 계획서의 "수행평가 세부 기준"을 옮긴 JSON(assess-library/*.json)을 과목 이름으로 찾아,
// 수행평가 등록 창에서 고르면 이름 · 평가 내용 · 루브릭(평가 요소 · 배점 · 단계 설명 · 점수) · 성취기준이 AI 없이 바로 채워진다. 저장은 교사가 [등록].
// 단계 수가 기준마다 다르므로 내 루브릭 파일 가져오기(N72)와 같은 규칙: 가장 많은 단계가 3 이하면 상중하, 4 이상이면 A~E,
// 모자라는 아래 수준은 비우고(0점) 넘치는 단계는 마지막 칸에 잇는다. "각 20점 × 5문항"처럼 문항마다 같은 기준이면 문항 수만큼 기준을 늘린다.

import { normalizeSubjectName } from "./curriculum";
import { ASSESS_LIMITS } from "./assessment";
import { RUBRIC_LIMITS, SCALE_LABELS, defaultLevels, newCriterionId, type Rubric, type RubricCriterion, type RubricScale } from "./rubric";

export type LibLevel = { points: number | null; desc: string };
/** perItem: "각 20점 × 5문항"처럼 같은 기준을 되풀이하는 수, perUnit: 그 단위("번" 문항 · "회") */
export type LibCriterion = { area: string; name: string; points: number | null; perItem: number | null; perUnit?: string; levels: LibLevel[] };
export type LibItem = {
  title: string;
  /** 학기 성적 반영 비율 % */
  weight: number | null;
  /** 영역 만점 */
  max: number | null;
  /** 평가 시기 (계획서 그대로, 예: "10월~11월") */
  when: string | null;
  standards: { code: string; text: string }[];
  overview: string;
  methods: string[];
  criteria: LibCriterion[];
  /** 채점 규칙 (실시 방법 · 감점 · 연동 채점 …) — 평가 내용 칸에 들어간다 */
  notes: string | null;
  /** 옮긴 사람의 확인 메모 (계획서 오타 · 겹치는 구간 …) — 화면에 내지 않는다 */
  check?: string | null;
};
export type LibSubject = { subject: string; perfRatio: number | null; items: LibItem[] };
export type LibPlan = { source: string; year: number; semester: number; grade: number; subjects: LibSubject[] };

/** 등록 창에 보이는 한 줄 */
export type LibEntry = LibItem & { key: string; subject: string; year: number; semester: number; grade: number; source: string };

/** 이 과목의 수행평가 — 같은 학년도 · 학년 · 학기 계획서가 앞, 과목 이름이 같으면 다른 학년 것도 뒤에 */
export function libraryFor(plans: LibPlan[], course: { subject: string; year: number; grade: number; semester: number }): LibEntry[] {
  const key = normalizeSubjectName(course.subject);
  const rank = (p: LibPlan) => (p.year === course.year ? 0 : 4) + (p.grade === course.grade ? 0 : 2) + (p.semester === course.semester ? 0 : 1);
  return [...plans]
    .sort((a, b) => rank(a) - rank(b))
    .flatMap((p) => p.subjects
      .filter((s) => normalizeSubjectName(s.subject) === key)
      .flatMap((s) => s.items.map((it, i) => ({ ...it, key: `${p.year}-${p.semester}-${p.grade}:${s.subject}:${i}`, subject: s.subject, year: p.year, semester: p.semester, grade: p.grade, source: p.source }))));
}

/** "9월 · 반영 15% · 100점" */
export function libraryLine(it: Pick<LibItem, "when" | "weight" | "max">): string {
  return [it.when, it.weight != null ? `반영 ${it.weight}%` : null, it.max != null ? `${it.max}점` : null].filter(Boolean).join(" · ");
}

/** 평가 내용 칸 (AI가 답안 · 자료를 읽을 때도 참고): 개요 + 평가 방법 + 채점 규칙, 500자까지 */
export function libraryDescription(it: Pick<LibItem, "overview" | "methods" | "notes">): string {
  const parts = [it.overview.trim(), it.methods.length ? `평가 방법: ${it.methods.join(" · ")}` : "", (it.notes ?? "").trim()].filter(Boolean);
  const all = parts.join("\n");
  return all.length > ASSESS_LIMITS.description ? `${all.slice(0, ASSESS_LIMITS.description - 1)}…` : all;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const codeKey = (c: string) => c.replace(/[\s[\]]/g, "");

/** 계획서 기준 → 등록 창 루브릭. 기준이 없으면 null (자료 요약으로 등록) */
export function libraryRubric(it: Pick<LibItem, "criteria" | "standards">, known: { code: string }[] = []): Rubric | null {
  // 문항(회)마다 같은 기준(perItem)은 그 수만큼 늘린다 — 1번 문항 기준들, 2번 문항 기준들 … 순서. 8개를 넘기면 한 기준으로 두고 이름에 "문항마다"
  const rounds = Math.max(1, ...it.criteria.map((c) => c.perItem ?? 1));
  const per = (c: LibCriterion) => (c.perItem ?? 1) > 1;
  const each = (c: LibCriterion) => (per(c) ? `${c.name} (${c.perUnit === "회" ? "회" : "문항"}마다)` : c.name);
  const expanded = Array.from({ length: rounds }, (_, i) => it.criteria
    .filter((c) => i < (c.perItem ?? 1))
    .map((c) => ({ ...c, name: per(c) ? `${i + 1}${c.perUnit ?? "번"} · ${c.name}` : c.name }))).flat();
  const criteria = (expanded.length > RUBRIC_LIMITS.criteria ? it.criteria.map((c) => ({ ...c, name: each(c) })) : expanded)
    .slice(0, RUBRIC_LIMITS.criteria)
    .filter((c) => clean(c.name) || clean(c.area));
  if (!criteria.length) return null;
  const most = Math.max(...criteria.map((c) => c.levels.length));
  const scale: RubricScale = most >= 4 ? "A-E" : "상중하";
  const n = SCALE_LABELS[scale].length;
  const out: RubricCriterion[] = criteria.map((c) => {
    const top = Math.max(0, ...c.levels.map((l) => l.points ?? 0));
    const points = Math.min(RUBRIC_LIMITS.points, Math.max(1, Math.round(c.points ?? (top || 10))));
    const src = c.levels.length > n
      ? [...c.levels.slice(0, n - 1), { desc: c.levels.slice(n - 1).map((l) => clean(l.desc)).filter(Boolean).join(" / "), points: c.levels[c.levels.length - 1].points }]
      : c.levels;
    const levels = defaultLevels(scale, points, src.map((l) => clean(l.desc).slice(0, RUBRIC_LIMITS.desc))).map((l, i) => {
      if (i >= src.length) return { ...l, points: 0 };
      const p = src[i].points;
      return p == null ? l : { ...l, points: Math.min(points, Math.max(0, Math.round(p))) };
    });
    return { id: newCriterionId(), name: clean(c.name || c.area).slice(0, RUBRIC_LIMITS.name), points, levels };
  });
  // 총점이 200을 넘으면 뒤 기준부터 뺀다 (계획서는 보통 100점)
  while (out.length > 1 && out.reduce((s, c) => s + c.points, 0) > RUBRIC_LIMITS.total) out.pop();
  const want = it.standards.map((s) => codeKey(s.code));
  const standards = known.filter((s) => want.includes(codeKey(s.code))).map((s) => s.code).slice(0, RUBRIC_LIMITS.standards);
  return { scale, criteria: out, standards };
}

/** 등록 창 제목 칸 (40자) */
export const libraryTitle = (it: Pick<LibItem, "title">) => clean(it.title).slice(0, ASSESS_LIMITS.title);
