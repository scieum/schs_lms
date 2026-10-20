// 글 모아 보기 (Figma N49 메모 묶어 쓰기 (d), /teacher/texts): 세특 · 창체 · 행발 · 누가기록 글을 반 · 분반 단위로 모아 본다.
// 순수 함수 (테스트: texts-view.test.ts). 게이트 통과 = 최신 글이 [한도 − 기본 오차, 한도] 안 (length-gate 기본 오차).

import { neisBytes } from "./length";
import { gateBand, gateCheck } from "./length-gate";
import { makeStudentNo } from "./roster";
import { toTsv } from "./tsv";

export type TextsTab = "setuk" | "record" | "behavior" | "logs";
export const TEXTS_TABS: { key: TextsTab; label: string }[] = [
  { key: "setuk", label: "세특" },
  { key: "record", label: "창체" },
  { key: "behavior", label: "행발" },
  { key: "logs", label: "누가기록" },
];
export const parseTextsTab = (v: unknown): TextsTab => (TEXTS_TABS.some((t) => t.key === v) ? (v as TextsTab) : "setuk");

/** 기본은 확정만 (나이스에 옮길 글 모음이 목적) */
export type TextsWho = "confirmed" | "all";
export const parseTextsWho = (v: unknown): TextsWho => (v === "all" ? "all" : "confirmed");

export type TextStatus = "confirmed" | "draft" | "empty";
export const STATUS_LABEL: Record<TextStatus, string> = { confirmed: "확정", draft: "임시", empty: "비어 있음" };

export type TextRow = { id: string; no: string; name: string; text: string; bytes: number; status: TextStatus };

/** 번호 칸: 한 반이면 출석 번호, 여러 반이 섞인 분반이면 학번 */
export function rowNumbers(students: { grade: number; classNo: number; number: number }[]): string[] {
  const one = new Set(students.map((s) => `${s.grade}-${s.classNo}`)).size <= 1;
  return students.map((s) => (one ? String(s.number) : makeStudentNo(s.grade, s.classNo, s.number)));
}

/** 게이트 통과: 글이 있고 [한도 − 기본 오차, 한도] 안 */
export function gatePass(text: string, max: number): boolean {
  if (!text.trim()) return false;
  return gateCheck(text, gateBand({ unit: "bytes", target: max, limit: max })).pass;
}

/** 바이트 색: 한도 넘음 빨강 · 범위 아래 주황 · 안 = 보통 · 글 없음 흐림 */
export function bytesTone(bytes: number, max: number): "over" | "short" | "ok" | "none" {
  if (bytes <= 0) return "none";
  if (bytes > max) return "over";
  return bytes < gateBand({ unit: "bytes", target: max, limit: max }).lo ? "short" : "ok";
}

export const showRows = <T extends TextRow>(rows: T[], who: TextsWho): T[] => (who === "all" ? rows : rows.filter((r) => r.status === "confirmed"));

export type TextsSummary = { students: number; confirmed: number; gate: number };

/** 요약 숫자는 확정만/전체와 상관없이 반 전체로 센다 */
export function textsSummary(rows: TextRow[], max: number): TextsSummary {
  return {
    students: rows.length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    gate: rows.filter((r) => gatePass(r.text, max)).length,
  };
}

/** "28명 · 확정 21 · 게이트 통과 25" (모바일 "… · 통과 25") */
export const summaryLabel = (s: TextsSummary, short = false) => `${s.students}명 · 확정 ${s.confirmed} · ${short ? "통과" : "게이트 통과"} ${s.gate}`;

/** 모두 복사: 보이는 행을 번호 순 "번호\t이름\t글" (N42 시트용 복사 형식, 머리 줄 포함) */
export function copyAllTsv(rows: { no: string; name: string; text: string }[]): string {
  return toTsv(["번호", "이름", "글"], rows.map((r) => [r.no, r.name, r.text]));
}

export const AREA_NOUN: Record<Exclude<TextsTab, "logs">, string> = { setuk: "세특", record: "창체", behavior: "행발" };

/** 빈 화면 한 줄 */
export function emptyLine(tab: TextsTab, who: TextsWho, students: number): string {
  if (!students) return "이 반에 학생이 없어요";
  if (tab === "logs") return "남긴 누가기록이 아직 없어요";
  return who === "confirmed" ? `확정한 ${AREA_NOUN[tab]}이 아직 없어요` : `쓴 ${AREA_NOUN[tab]}이 아직 없어요`;
}

// ---------- 누가기록 ----------

export type LogLine = { date: string; content: string };
export type LogRow = { id: string; no: string; name: string; lines: LogLine[] };

/** "2026-10-19" → "10.19" */
export function logDate(d: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(d);
  return m ? `${Number(m[1])}.${Number(m[2])}` : d;
}

/** 최신 위 */
export const sortLines = <T extends LogLine>(lines: T[]): T[] => [...lines].sort((a, b) => b.date.localeCompare(a.date));

/** "3건 · 342B" (바이트는 글만, 날짜는 빼고) */
export function logStats(lines: LogLine[]): string {
  const b = lines.reduce((n, l) => n + neisBytes(l.content), 0);
  return `${lines.length}건 · ${b.toLocaleString("ko-KR")}B`;
}

/** 행 복사: 모든 줄 "10.19 글" */
export const logText = (lines: LogLine[]) => lines.map((l) => `${logDate(l.date)} ${l.content}`).join("\n");

/** "12명 · 기록 41건" */
export const logsSummary = (students: number, rows: LogRow[]) => `${students}명 · 기록 ${rows.reduce((n, r) => n + r.lines.length, 0)}건`;

export const copyAllLogsTsv = (rows: LogRow[]) => copyAllTsv(rows.map((r) => ({ no: r.no, name: r.name, text: logText(r.lines) })));

/** 바이트 표시 "1,482B" */
export const bytesLabel = (n: number) => `${n.toLocaleString("ko-KR")}B`;

