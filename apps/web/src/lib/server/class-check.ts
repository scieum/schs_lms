import "server-only";
import { classCheck, fixTargets, sortForReview, type ClassCheckView, type ClassViewRow } from "@/lib/domain/class-check";
import type { LengthRange } from "@/lib/domain/length";
import { makeStudentNo } from "@/lib/domain/roster";
import { similarPairs } from "@/lib/domain/similar";
import type { Student } from "@/lib/domain/types";
import { findIdentity } from "@/lib/domain/writing";
import type { CheckMore } from "@/lib/domain/auto-check";

// 반 전체 검사 (Figma N35 ①): 세특 분반 · 초안 검토(프로그램) · 담임 반/동아리 기록이 같이 쓰는 묶음.
// 규칙만(AI 없음). 비슷한 문장(N34)도 같이 센다. 학번·이름은 화면 표에만, 링크에는 내부 id만.

export type ClassItem = {
  id: string; student: Student; text: string; range: LengthRange; locked: boolean; href: string; context?: string;
  /** N38: 근거 없는 문장 · 수정 비율 (AI 원안이 있을 때만) */
  more?: CheckMore; editRatio?: number | null; editRatioMin?: number;
};

export function buildClassView(items: ClassItem[], ignore: string[] = []): ClassCheckView {
  const texts = items.filter((x) => x.text.trim()).map((x) => ({ id: x.id, text: x.text }));
  const pairs = similarPairs(texts, { ignore });
  const byId = new Map(items.map((x) => [x.id, x]));
  const res = classCheck(items.map((x) => {
    const mine = pairs.filter((p) => p.a === x.id || p.b === x.id);
    const best = mine[0];
    const other = best ? byId.get(best.a === x.id ? best.b : best.a) : undefined;
    return {
      id: x.id, label: x.student.name, text: x.text, range: x.range, identity: findIdentity(x.text, x.student), locked: x.locked, context: x.context, more: x.more, editRatio: x.editRatio, editRatioMin: x.editRatioMin,
      similar: mine.length ? { count: mine.length, with: other?.student.name, spots: best.runs.length } : undefined,
    };
  }));
  const sorted = sortForReview(res.rows);
  const fix = new Set(fixTargets(sorted).map((r) => r.id));
  const rows: ClassViewRow[] = sorted.map((r) => {
    const it = byId.get(r.id)!;
    const s = it.student;
    return { ...r, no: makeStudentNo(s.grade, s.classNo, s.number), name: s.name, href: it.href, unit: it.range.unit, max: it.range.max, text: fix.has(r.id) ? it.text : undefined };
  });
  return { ok: true, at: new Date().toISOString(), totals: res.totals, rows };
}

/** 감사 로그 한 줄: 학생 식별자 없이 명수·결과 수만 */
export const classAudit = (what: string, v: ClassCheckView) => (v.ok ? `${what} ${v.rows.length}명 block ${v.totals.block} warn ${v.totals.warn}` : what);
