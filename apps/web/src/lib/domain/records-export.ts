// 엑셀로 받기 · 시트용 복사 (Figma N42 ②③): 학생 한 줄 — 학번 · 이름 · 영역 · AI 원안 · 최종 글 · 수정 % · 바이트 · 상태 · 확정일.
// 순수 함수 (테스트: records-export.test.ts). 파일 만들기는 lib/server/excel.ts, TSV 는 lib/domain/tsv.ts.

import { neisBytes } from "./length";
import { editRatio, PROVENANCE_DEFAULTS } from "./provenance";

export type ExportWho = "all" | "confirmed" | "draft";
export const EXPORT_WHO: ExportWho[] = ["all", "confirmed", "draft"];
export const WHO_LABEL: Record<ExportWho, string> = { all: "전체", confirmed: "확정만", draft: "임시만" };

/** 엑셀 열 (학번 · 이름은 끌 수 없음). 성취수준은 세특만 · 기본 끔 */
export const EXPORT_COLS = ["학번", "이름", "영역", "AI 원안", "최종 글", "수정 %", "바이트", "상태", "확정일", "성취수준"] as const;
export type ExportCol = (typeof EXPORT_COLS)[number];
export const LOCKED_COLS: ExportCol[] = ["학번", "이름"];
export const DEFAULT_COLS: ExportCol[] = ["학번", "이름", "영역", "AI 원안", "최종 글", "수정 %", "바이트", "상태", "확정일"];

/** 시트용 복사 열: 학번 · 이름 · 글 · 바이트(기본 켬) + 성취수준 · 상태(끔). 순서는 이 순서 고정 */
export const COPY_COLS = ["학번", "이름", "글", "바이트", "성취수준", "상태"] as const;
export type CopyCol = (typeof COPY_COLS)[number];
export const DEFAULT_COPY_COLS: CopyCol[] = ["학번", "이름", "글", "바이트"];

export type ExportStudent = { id: string; no: string; name: string; level?: string | null };
export type ExportRecord = { content: string; status: "draft" | "confirmed"; createdAt: string; aiOriginalId?: string | null; editRatio?: number | null };
export type ExportStatus = "확정" | "임시" | "빈 글";

export type ExportRow = {
  학번: string; 이름: string; 영역: string; "AI 원안": string; "최종 글": string;
  "수정 %": number | null; 바이트: number; 상태: ExportStatus; 확정일: string; 성취수준: string;
  /** 바이트가 한도를 넘었는지 (엑셀에서 그 칸 굵게 · 주황) */
  over: boolean;
};

export const statusOf = (r: ExportRecord | undefined): ExportStatus => (!r?.content.trim() ? "빈 글" : r.status === "confirmed" ? "확정" : "임시");

export function matchWho(s: ExportStatus, who: ExportWho): boolean {
  return who === "all" ? true : who === "confirmed" ? s === "확정" : s === "임시";
}

/** 학생 한 줄씩 (학생 칩 "전체"면 빈 글 학생도 한 줄). 수정 %는 원안이 있을 때만 — 확정이면 저장된 값, 임시면 그때 계산 */
export function exportRows(
  students: ExportStudent[], records: Map<string, ExportRecord>, originals: Map<string, string>,
  opts: { area: string; who: ExportWho; maxBytes: number },
): ExportRow[] {
  return students.flatMap((s): ExportRow[] => {
    const r = records.get(s.id);
    const st = statusOf(r);
    if (!matchWho(st, opts.who)) return [];
    const text = r?.content.trim() ? r.content : "";
    const orig = r?.aiOriginalId ? originals.get(r.aiOriginalId) ?? "" : "";
    const ratio = orig && text ? (st === "확정" && r?.editRatio != null ? r.editRatio : editRatio(orig, text)) : null;
    const bytes = neisBytes(text);
    return [{
      학번: s.no, 이름: s.name, 영역: opts.area, "AI 원안": orig, "최종 글": text, "수정 %": ratio, 바이트: bytes,
      상태: st, 확정일: st === "확정" && r ? r.createdAt.slice(0, 10) : "", 성취수준: s.level ?? "", over: bytes > opts.maxBytes,
    }];
  });
}

export type ExportSummary = {
  students: number; confirmed: number; draft: number; empty: number; withOriginal: number;
  avgEdit: number | null; lowEdit: number; avgBytes: number | null; over: number;
};

/** 요약 시트 숫자 (빈 글은 바이트 평균에서 뺀다) */
export function exportSummary(rows: ExportRow[], editRatioMin: number = PROVENANCE_DEFAULTS.editRatioMin): ExportSummary {
  const written = rows.filter((r) => r.상태 !== "빈 글");
  const ratios = rows.map((r) => r["수정 %"]).filter((x): x is number => x != null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    students: rows.length,
    confirmed: rows.filter((r) => r.상태 === "확정").length,
    draft: rows.filter((r) => r.상태 === "임시").length,
    empty: rows.filter((r) => r.상태 === "빈 글").length,
    withOriginal: rows.filter((r) => r["AI 원안"]).length,
    avgEdit: avg(ratios),
    lowEdit: ratios.filter((x) => x < editRatioMin).length,
    avgBytes: avg(written.map((r) => r.바이트)),
    over: rows.filter((r) => r.over).length,
  };
}

/** 열 고르기 (쿼리 cols=학번,이름,…) — 모르는 열은 버리고, 학번 · 이름은 늘 넣고, 순서는 EXPORT_COLS 순서 */
export function parseCols(raw: string | null | undefined, allowLevel = true): ExportCol[] {
  const asked = raw ? raw.split(",").map((x) => x.trim()) : DEFAULT_COLS;
  const set = new Set<string>([...asked, ...LOCKED_COLS]);
  return EXPORT_COLS.filter((c) => set.has(c) && (allowLevel || c !== "성취수준"));
}

export function parseCopyCols(raw: unknown): CopyCol[] {
  const asked = Array.isArray(raw) ? raw.map(String) : DEFAULT_COPY_COLS;
  return COPY_COLS.filter((c) => asked.includes(c));
}

export const parseWho = (v: unknown): ExportWho => (EXPORT_WHO.includes(v as ExportWho) ? (v as ExportWho) : "all");

/** 엑셀 칸 값 (수정 %는 "23%", 숫자 칸은 숫자) */
export function cellOf(r: ExportRow, c: ExportCol): string | number {
  if (c === "수정 %") return r["수정 %"] == null ? "" : `${r["수정 %"]}%`;
  return r[c];
}

/** 시트용 복사 한 줄 (바이트는 쉼표 없는 숫자 · 글은 최종 글) */
export function copyCells(r: ExportRow, cols: CopyCol[]): (string | number)[] {
  return cols.map((c) => (c === "글" ? r["최종 글"] : c === "바이트" ? (r["최종 글"] ? r.바이트 : "") : r[c]));
}

/** 파일 이름: 세특_<과목>_<분반>_<학년도>-<학기>.xlsx · <영역>_<학년>-<반>_<학년도>.xlsx · 동아리_<동아리명>_<학년도>.xlsx */
export function exportFileName(x: { kind: "setuk"; subject: string; section?: string | null; year: number; semester: number } | { kind: "record"; area: string; grade?: number; classNo?: number; club?: string | null; year: number }): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, "_");
  if (x.kind === "setuk") return `세특_${safe(x.subject)}${x.section ? `_${safe(x.section)}` : ""}_${x.year}-${x.semester}.xlsx`;
  if (x.club) return `동아리_${safe(x.club)}_${x.year}.xlsx`;
  return `${safe(x.area)}_${x.grade ?? ""}-${x.classNo ?? ""}_${x.year}.xlsx`;
}

/** 엑셀 시트 이름 (31자 · 금지 글자 빼기) */
export const sheetName = (s: string) => s.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "시트";
