// 외부 생기부 글 직접 넣기 (Figma N46): 기관·외부 강사가 보낸 완성된 생기부 글을 교사가 그대로 넣는다.
// AI 없음 · 자동 확정 없음. 넣은 글은 "직접 입력" 초안(새 버전, AI 원안 없음)이 되고 자동 검사 → 교사 확정 → 담임 전달 흐름을 그대로 탄다.
// 여기는 순수 규칙만: 출처 판정 · 엑셀(외부글 양식) 줄 맞추기 · 덮어쓰기 계획 · 감사 한 줄.

import { listLines, matchRoster, type RosterLine, type RosterStudent } from "./class-roster";
import type { DraftSource, DraftVersionStatus } from "./program";

/** 글 한 칸 최대 (초안 저장과 같은 상한) */
export const EXTERNAL_TEXT_MAX = 5000;
/** 출처 메모 최대 (교사만 봄, 기록 글 아님) */
export const EXTERNAL_NOTE_MAX = 60;

export type DraftOrigin = "external" | "ai" | "manual";
export const ORIGIN_LABEL: Record<DraftOrigin, string> = { external: "직접 입력", ai: "AI 초안", manual: "직접 작성" };

/** 줄바꿈·앞뒤 공백 정리 (글 안의 줄바꿈은 그대로) */
export const cleanExternalText = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
/** 출처 메모: 한 줄 · 60자 */
export const cleanNote = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, EXTERNAL_NOTE_MAX);

/**
 * 이 초안이 어디서 왔나: 최신 버전부터 거꾸로 보며 교사 수정(manual)은 건너뛰고 처음 만난 출처.
 * 외부 글을 넣은 뒤 고쳐도 "직접 입력", AI 초안을 고쳐도 "AI 초안". 처음부터 교사가 쓴 글이면 "직접 작성".
 */
export function draftOrigin(versions: { source: DraftSource; originNote?: string | null; createdAt: string }[]): { origin: DraftOrigin; note: string | null } | null {
  if (!versions.length) return null;
  const sorted = [...versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const v of sorted) {
    if (v.source === "external") return { origin: "external", note: v.originNote?.trim() || null };
    if (v.source === "ai" || v.source === "sample") return { origin: "ai", note: null };
  }
  return { origin: "manual", note: null };
}

// ---------- 엑셀 (외부글_양식.xlsx: 학번·학년·반·번호·이름·생기부 글) ----------

/** 이 학생의 지금 초안 상태 (가장 최신 버전) */
export type ExistingDraft = DraftVersionStatus | "none";

export interface ExternalItem {
  studentId: string;
  line: number;
  /** 정리한 글 */
  text: string;
  target: boolean;
  existing: ExistingDraft;
}

export interface ExternalScan {
  /** 학생 줄 수 (빈 줄 뺌) */
  lines: number;
  found: ExternalItem[];
  unmatched: { line: number | null; text: string }[];
  /** 학생은 찾았는데 글이 빈 줄 */
  empty: number[];
  /** 같은 학생이 두 번 — 처음 줄만 쓴다 */
  duplicates: number[];
  /** 글이 너무 긴 줄 */
  tooLong: number[];
}

const lineText = (l: RosterLine) =>
  [l.studentNo ?? (l.grade && l.classNo && l.number ? `${l.grade}학년 ${l.classNo}반 ${l.number}번` : null), l.name].filter(Boolean).join(" ") || l.raw.slice(0, 20);

/**
 * 양식 본문(readTemplate(rows, "external")) → 학생마다 글. 맞추기는 명단 양식과 같은 규칙(matchRoster):
 * 학번 → 학년·반·번호 → (번호가 없을 때만, 한 명뿐인) 이름. 이름이 다르면 못 찾음.
 */
export function scanExternal<T extends RosterStudent>(
  body: { line: number; cells: string[] }[],
  students: T[],
  opts: { targetIds: string[]; existing: (studentId: string) => ExistingDraft },
): ExternalScan {
  const targets = new Set(opts.targetIds);
  const seen = new Set<string>();
  const out: ExternalScan = { lines: 0, found: [], unmatched: [], empty: [], duplicates: [], tooLong: [] };
  for (const { line, cells } of body) {
    const [l] = listLines([{ line, cells: cells.slice(0, 5) }]);
    const text = cleanExternalText(cells[5] ?? "");
    if (!l) {
      // 학생 칸이 비었는데 글만 있으면 못 찾음, 둘 다 비면 건너뜀(readTemplate 이 이미 뺌)
      if (text) { out.lines++; out.unmatched.push({ line, text: "학생 칸이 비었어요" }); }
      continue;
    }
    out.lines++;
    const s = matchRoster([l], students).matched[0];
    if (!s) { out.unmatched.push({ line, text: lineText(l) }); continue; }
    if (seen.has(s.id)) { out.duplicates.push(line); continue; }
    seen.add(s.id);
    if (!text) { out.empty.push(line); continue; }
    if (text.length > EXTERNAL_TEXT_MAX) { out.tooLong.push(line); continue; }
    out.found.push({ studentId: s.id, line, text, target: targets.has(s.id), existing: opts.existing(s.id) });
  }
  return out;
}

export type OverwriteMode = "overwrite" | "skip";

export interface ExternalPlan {
  write: { studentId: string; text: string; line: number; mode: "new" | "overwrite" }[];
  /** 대상에 새로 더할 학생 */
  addTargets: string[];
  /** 확정한 초안이라 그대로 둔 학생 (어느 쪽이든) */
  keptFinal: string[];
  /** 건너뛰기를 골라 그대로 둔 학생 */
  skipped: string[];
  /** 대상이 아니라 넣지 않은 학생 */
  notTarget: string[];
}

/**
 * 넣는 계획: 확정한 초안은 언제나 그대로(자동으로 확정을 풀지 않는다), 초안이 있으면 덮어쓰기(새 버전) 또는 건너뛰기,
 * 대상이 아닌 학생은 고르면 대상에 더해 넣는다. 지우는 것은 없다 — 덮어쓰기도 새 버전 추가 (C4).
 */
export function planExternal(found: ExternalItem[], opts: { overwrite: OverwriteMode; addNonTargets: boolean }): ExternalPlan {
  const plan: ExternalPlan = { write: [], addTargets: [], keptFinal: [], skipped: [], notTarget: [] };
  for (const it of found) {
    if (!it.target && !opts.addNonTargets) { plan.notTarget.push(it.studentId); continue; }
    if (it.existing === "finalized") { plan.keptFinal.push(it.studentId); continue; }
    const has = it.existing !== "none";
    if (has && opts.overwrite === "skip") { plan.skipped.push(it.studentId); continue; }
    if (!it.target) plan.addTargets.push(it.studentId);
    plan.write.push({ studentId: it.studentId, text: it.text, line: it.line, mode: has ? "overwrite" : "new" });
  }
  return plan;
}

/** 미리보기 숫자 (화면 요약 4칸 · 넣을 학생 줄) */
export function externalCounts(scan: Pick<ExternalScan, "found" | "unmatched">, plan: ExternalPlan) {
  return {
    found: scan.found.length,
    unmatched: scan.unmatched.length,
    notTarget: scan.found.filter((x) => !x.target).length,
    withDraft: scan.found.filter((x) => x.existing !== "none").length,
    finalized: scan.found.filter((x) => x.existing === "finalized").length,
    write: plan.write.length,
    fresh: plan.write.filter((x) => x.mode === "new").length,
    overwrite: plan.write.filter((x) => x.mode === "overwrite").length,
    kept: plan.keptFinal.length + plan.skipped.length,
  };
}

/** 감사 한 줄: 숫자만 (글 · 이름 · 학번 없음) */
export const externalAuditLine = (programId: string, plan: ExternalPlan) =>
  `${programId} new=${plan.write.filter((x) => x.mode === "new").length} over=${plan.write.filter((x) => x.mode === "overwrite").length} keep=${plan.keptFinal.length} skip=${plan.skipped.length} add=${plan.addTargets.length}`;
