// 프로그램·설문·제출 서류·생기부 초안 파이프라인의 순수 규칙.
// 화면·서버 액션·저장소가 같은 판정을 쓰도록 여기 한 곳에 둔다 (부수효과 없음).
import { checkLength, type DraftCategory, type LengthRange, type LengthUnit } from "./length";
import { isAdmin } from "./policy";
import type { Student, Viewer } from "./types";
import type { RecordProv } from "./provenance";

// ---------- 프로그램 ----------

export const AREAS: DraftCategory[] = ["세특", "창체-자율", "창체-동아리", "창체-진로"];
export const AREA_LABEL: Record<DraftCategory, string> = {
  세특: "교과세특",
  "창체-자율": "창체 · 자율",
  "창체-동아리": "창체 · 동아리",
  "창체-진로": "창체 · 진로",
};
export function isArea(v: string): v is DraftCategory {
  return (AREAS as string[]).includes(v);
}

/**
 * 초안 근거: 설문 응답 · 학생 제출 서류 · 둘 다 · 교사 메모만(N41 "memo") · 외부 글(N46 "external").
 * 교사 메모는 설문·서류와 함께 쓸 수도 있다 (Program.useMemos). 메모만이면 source = "memo".
 * 외부 글은 혼자만: 기관이 보낸 생기부 글을 교사가 그대로 넣는다 (학생 화면 없음 · AI 없음).
 */
export type EvidenceSource = "survey" | "docs" | "both" | "memo" | "external";
export const EVIDENCE_SOURCES = ["survey", "docs", "both", "memo", "external"] as const satisfies readonly EvidenceSource[];
export const SOURCE_LABEL: Record<EvidenceSource, string> = { survey: "설문", docs: "서류", both: "설문 + 서류", memo: "교사 메모", external: "외부 글" };
/** 외부 글 프로그램 (N46): 설문·서류·메모·AI 없이 교사가 넣은 글로만 */
export const isExternal = (s: EvidenceSource) => s === "external";
export const usesSurvey = (s: EvidenceSource) => s === "survey" || s === "both";
export const usesDocs = (s: EvidenceSource) => s === "docs" || s === "both";
/** 교사 메모를 근거로 쓰나 (메모만 · 설문/서류와 함께) */
export const usesMemos = (p: Pick<Program, "source" | "useMemos">) => p.source === "memo" || (p.source !== "external" && !!p.useMemos);
/** 화면 이름: "설문 + 교사 메모" 처럼 */
export const sourceLabel = (p: Pick<Program, "source" | "useMemos">) => (p.source !== "memo" && p.source !== "external" && p.useMemos ? `${SOURCE_LABEL[p.source]} + 교사 메모` : SOURCE_LABEL[p.source]);
/** 체크 셋(설문 · 서류 · 교사 메모) → source · useMemos. 아무것도 없으면 null */
export function sourceFromPicks(p: { survey: boolean; docs: boolean; memo: boolean }): { source: EvidenceSource; useMemos: boolean } | null {
  if (p.survey && p.docs) return { source: "both", useMemos: p.memo };
  if (p.survey) return { source: "survey", useMemos: p.memo };
  if (p.docs) return { source: "docs", useMemos: p.memo };
  return p.memo ? { source: "memo", useMemos: true } : null;
}
/** 프로그램 × 학생 관찰 메모 범위 (record_memos.scope, 추가만 — 최신 한 건이 지금 메모) */
export const programMemoScope = (programId: string) => `프로그램:${programId}`;
export const PROGRAM_MEMO_MAX = 1000;

export type ProgramStatus = "draft" | "open" | "closed";

export interface Question {
  id: string;
  title: string;
  prompt: string;
  fixed: boolean;
  minChars: number;
}

export interface Program {
  id: string;
  ownerId: string;
  /** 함께 맡는 교사 (등록한 교사 외). 담당자 모두 수정·검토할 수 있다 */
  coOwnerIds: string[];
  title: string;
  subject: string | null;
  area: DraftCategory;
  unit: LengthUnit;
  max: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (설문·서류 마감)
  source: EvidenceSource;
  /** N41: 설문·서류에 더해 교사 관찰 메모도 근거로 (source = "memo" 면 메모만) */
  useMemos?: boolean;
  requestDocs: boolean;
  docKinds: string[];
  questions: Question[];
  targetIds: string[];
  overview: string;
  status: ProgramStatus;
  createdAt: string;
}

/** 이 교사가 프로그램 담당자인가 (등록한 교사 또는 함께 맡는 교사) */
export function isProgramOwner(p: Pick<Program, "ownerId" | "coOwnerIds">, teacherId: string): boolean {
  return p.ownerId === teacherId || p.coOwnerIds.includes(teacherId);
}

export const MIN_ANSWER_CHARS = 30;
export const MAX_ANSWER_CHARS = 500;
export const MAX_EXTRA_QUESTIONS = 2;

/** 고정 4문항 (PRD F2-2) */
export const FIXED_QUESTIONS: Question[] = [
  { id: "q1", title: "활동 내용", prompt: "어떤 활동을 했나요?", fixed: true, minChars: MIN_ANSWER_CHARS },
  { id: "q2", title: "배운 점", prompt: "활동을 통해 무엇을 배웠나요?", fixed: true, minChars: MIN_ANSWER_CHARS },
  { id: "q3", title: "느낀 점", prompt: "활동하며 어떤 생각이 들었나요?", fixed: true, minChars: MIN_ANSWER_CHARS },
  { id: "q4", title: "후속 계획", prompt: "무엇을 더 해보고 싶나요?", fixed: true, minChars: MIN_ANSWER_CHARS },
];

/** 고정 4문항 + 추가 0~2문항. 빈 문항은 빼고, 2개를 넘으면 오류 */
export function buildQuestions(extra: string[]): Question[] | string {
  const list = extra.map((q) => q.trim()).filter(Boolean);
  if (list.length > MAX_EXTRA_QUESTIONS) return `추가 문항은 ${MAX_EXTRA_QUESTIONS}개까지예요`;
  if (list.some((q) => q.length > 100)) return "문항은 100자까지 쓸 수 있어요";
  return [
    ...FIXED_QUESTIONS,
    ...list.map((q, i) => ({ id: `q${5 + i}`, title: `추가 ${i + 1}`, prompt: q, fixed: false, minChars: MIN_ANSWER_CHARS })),
  ];
}

export const DEFAULT_DOC_KINDS = ["탐구 보고서", "활동지", "소감문"];

// ---------- 날짜 ----------

const DAY = 86400000;
const dayNum = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / DAY;

/** 마감까지 남은 날 (오늘 마감 = 0, 지났으면 음수) */
export function daysLeft(endDate: string, today: string): number {
  return dayNum(endDate) - dayNum(today);
}

/** "D-4" · "D-day" · "마감" */
export function ddayLabel(endDate: string, today: string): string {
  const n = daysLeft(endDate, today);
  if (n < 0) return "마감";
  return n === 0 ? "D-day" : `D-${n}`;
}

/** 날짜 더하기 (YYYY-MM-DD) */
export function addDays(ymd: string, n: number): string {
  return new Date((dayNum(ymd) + n) * DAY).toISOString().slice(0, 10);
}

/** 10.13 형식 */
export const md = (ymd: string) => `${+ymd.slice(5, 7)}.${String(+ymd.slice(8, 10)).padStart(2, "0")}`;

/** 마감이 지나면 닫힌 것으로 본다 */
export function effectiveStatus(p: Pick<Program, "status" | "endDate">, today: string): ProgramStatus {
  if (p.status === "open" && daysLeft(p.endDate, today) < 0) return "closed";
  return p.status;
}

// ---------- 설문 응답 ----------

export interface SurveyResponse {
  id: string;
  programId: string;
  studentId: string;
  answers: Record<string, string>;
  /** null 이면 임시 저장 */
  submittedAt: string | null;
  updatedAt: string;
}

/** 제출 검사: 모든 문항에 최소 글자 이상. 임시 저장은 길이 상한만 본다 */
export function validateAnswers(questions: Question[], answers: Record<string, string>, submit: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of questions) {
    const a = (answers[q.id] ?? "").trim();
    if (a.length > MAX_ANSWER_CHARS) errors[q.id] = `${MAX_ANSWER_CHARS}자까지 쓸 수 있어요`;
    else if (submit && a.length < q.minChars) errors[q.id] = `${q.minChars}자 이상 써 주세요 (지금 ${a.length}자)`;
  }
  return errors;
}

export function answeredCount(questions: Question[], answers: Record<string, string>): number {
  return questions.filter((q) => (answers[q.id] ?? "").trim().length >= q.minChars).length;
}

export function responseRate(targets: number, submitted: number): number {
  return targets === 0 ? 0 : Math.round((submitted / targets) * 100);
}

// ---------- 제출 서류 ----------

/** matched 학생 연결됨 · needs_review 확인 필요 · bundle 합본(나누기 전) · split_done 나눈 원본 */
export type MaterialStatus = "matched" | "needs_review" | "bundle" | "split_done";
export type MatchedBy = "studentNo" | "name" | "manual" | "ai" | "split" | "student" | null;

export interface Material {
  id: string;
  programId: string;
  studentId: string | null;
  fileName: string;
  mime: string;
  size: number;
  pages: number | null;
  filePath: string;
  status: MaterialStatus;
  matchedBy: MatchedBy;
  /** 서류에서 읽은 글 (이름·학번은 가린 뒤 저장) */
  text: string | null;
  uploaderId: string;
  createdAt: string;
  /** 보존 기간이 지나 원본 파일을 지운 때 (N39). 지운 뒤에는 filePath 가 "" */
  purgedAt?: string | null;
  /** 보존 기간이 지나 읽은 글(text)을 지운 때 (N39) */
  textPurgedAt?: string | null;
}

/**
 * 올린 파일을 지울 수 있나 (N33). 화면·서버 액션이 같이 쓴다.
 * - 교사: 프로그램 담당(등록·공동) 또는 관리자 → 그 프로그램의 모든 자료(학생이 올린 것 포함)
 * - 학생: 내가 올린(matchedBy "student") 내 파일 + 발행된 프로그램이 열려 있고 마감 전
 * - 그 밖(담임·다른 교사)은 안 된다
 */
export function canDeleteMaterial(
  v: Viewer,
  program: Pick<Program, "id" | "ownerId" | "coOwnerIds" | "status" | "endDate" | "targetIds">,
  material: Pick<Material, "programId" | "studentId" | "uploaderId" | "matchedBy">,
  today: string,
): boolean {
  if (material.programId !== program.id) return false;
  if (v.kind === "teacher") return isProgramOwner(program, v.accountId) || isAdmin(v);
  const me = v.student.id;
  return (
    material.uploaderId === me && material.studentId === me && material.matchedBy === "student" &&
    program.targetIds.includes(me) && effectiveStatus(program, today) === "open" && daysLeft(program.endDate, today) >= 0
  );
}

/** 제출 서류 형식. HWPX 는 서버가 글을 뽑아 둔다 (lib/server/hwpx.ts, hwpx 스킬 방식) */
export const MATERIAL_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "application/hwp+zip", "application/vnd.openxmlformats-officedocument.presentationml.presentation"] as const;
/** AI 가 원본 파일(PDF·이미지)을 직접 읽을 수 있는 형식 */
export const isReadableByAi = (mime: string) => mime === "application/pdf" || mime.startsWith("image/");
export const MATERIAL_MAX_BYTES = 50 * 1024 * 1024;

/**
 * 파일 이름의 학번·이름으로 학생 찾기 (T6 자동 매칭).
 * 예: "20312_김민준_탐구보고서.pdf". 학번이 먼저, 이름은 대상 중 한 명일 때만
 */
export function matchFileName(fileName: string, students: Student[]): { studentId: string; by: "studentNo" | "name" } | null {
  const base = fileName.replace(/\.[^.]+$/, "");
  for (const m of base.matchAll(/(?<!\d)(\d{5})(?!\d)/g)) {
    const s = students.find((x) => x.studentNo === m[1]);
    if (s) return { studentId: s.id, by: "studentNo" };
  }
  const flat = base.replace(/\s/g, "");
  const hits = students.filter((s) => s.name.length >= 2 && flat.includes(s.name));
  // "이수아"와 "수아"처럼 겹치면 긴 이름이 이긴다
  const longest = hits.filter((s) => !hits.some((o) => o !== s && o.name.length > s.name.length && o.name.includes(s.name)));
  if (longest.length === 1) return { studentId: longest[0].id, by: "name" };
  return null;
}

/** 합본으로 볼 파일: 여러 학생 것이 한 PDF 에 (파일 이름에 "합본" 또는 쪽수가 많음) */
export function looksLikeBundle(fileName: string, pages: number | null): boolean {
  return /합본|전체|모음|bundle/i.test(fileName) || (pages ?? 0) >= 12;
}

// ---------- 개인정보 가림 ----------

/**
 * 이름·학번을 가린다. AI에 보내기 전·서류 글을 저장하기 전에 쓴다.
 * 이름은 성을 뺀 이름(2글자 이상)도 같이 가린다.
 */
export function maskIdentity(text: string, people: { name: string; studentNo: string }[], label = "○○"): string {
  let out = text;
  const nos = [...new Set(people.map((p) => p.studentNo).filter(Boolean))];
  for (const no of nos) out = out.replace(new RegExp(`(?<!\\d)${no}(?!\\d)`, "g"), "#####");
  const names = new Set<string>();
  for (const p of people) {
    const n = p.name.replace(/\s/g, "");
    if (n.length >= 2) names.add(n);
    if (n.length >= 3) names.add(n.slice(1));
  }
  for (const n of [...names].sort((a, b) => b.length - a.length)) out = out.split(n).join(label);
  return out;
}

/** 실명·학번이 남아 있는지 (G1 ③, 초안 자동 검사) */
export function findIdentity(text: string, people: { name: string; studentNo: string }[]): string[] {
  const found: string[] = [];
  for (const p of people) {
    if (p.name.length >= 2 && text.includes(p.name)) found.push("실명");
    if (p.studentNo && new RegExp(`(?<!\\d)${p.studentNo}(?!\\d)`).test(text)) found.push("학번");
  }
  return [...new Set(found)];
}

// ---------- 합본 PDF 나누기 ----------

export interface PageRange {
  from: number;
  to: number;
  studentId: string | null;
}

/** 쪽 구간 검사: 1..pages 안, from ≤ to, 겹침 없음, 학생 지정 필수, 같은 학생 두 번 금지 */
export function validateRanges(ranges: PageRange[], pages: number): string | null {
  if (ranges.length === 0) return "구간을 하나 이상 넣어 주세요";
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  for (const r of sorted) {
    if (!Number.isInteger(r.from) || !Number.isInteger(r.to) || r.from < 1 || r.to > pages || r.from > r.to) {
      return `${r.from}–${r.to}쪽은 1–${pages}쪽 안에서 골라 주세요`;
    }
    if (!r.studentId) return `${r.from}–${r.to}쪽의 학생을 골라 주세요`;
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].from <= sorted[i - 1].to) return `${sorted[i - 1].from}–${sorted[i - 1].to}쪽과 ${sorted[i].from}–${sorted[i].to}쪽이 겹쳐요`;
  }
  const ids = sorted.map((r) => r.studentId);
  if (new Set(ids).size !== ids.length) return "한 학생에게 구간을 두 번 줄 수 없어요";
  return null;
}

/** 빠른 나누기: N쪽씩, 명렬표 순서로 학생을 배정한다 */
export function quickSplit(pages: number, per: number, studentIds: string[]): PageRange[] {
  const n = Math.max(1, Math.floor(per));
  const out: PageRange[] = [];
  for (let from = 1, i = 0; from <= pages; from += n, i++) {
    out.push({ from, to: Math.min(pages, from + n - 1), studentId: studentIds[i] ?? null });
  }
  return out;
}

export const rangeLabel = (r: { from: number; to: number }) => (r.from === r.to ? `${r.from}쪽` : `${r.from}–${r.to}쪽`);

// ---------- 초안 파이프라인 ----------

export type DraftState = "PENDING" | "RUNNING" | "DONE" | "ERROR";
export const MAX_ATTEMPTS = 3;

export interface DraftJob {
  id: string;
  programId: string;
  studentId: string;
  state: DraftState;
  attempts: number;
  error: string | null;
  unit: LengthUnit;
  max: number;
  /** 관리자가 담당 교사에게 수동 작성을 요청한 때 */
  manualRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 생기부 기록 상태: draft 초안 · finalized 확정(교사만) · rejected 반려(사유 필수) */
export type DraftVersionStatus = "draft" | "finalized" | "rejected";
/** ai · sample = AI(예시) 초안, manual = 교사가 고친 버전, external = 외부 글 직접 넣기 (N46, AI 원안 없음) */
export type DraftSource = "ai" | "sample" | "manual" | "external";

/** 초안 버전. 고칠 때마다 새로 추가하고 지우거나 덮어쓰지 않는다 (C4) */
export interface DraftVersion extends RecordProv {
  id: string;
  jobId: string;
  programId: string;
  studentId: string;
  content: string;
  status: DraftVersionStatus;
  reason: string | null;
  source: DraftSource;
  authorId: string | null;
  createdAt: string;
  /** 외부 글 출처 (N46, 선택 · 60자). 기록 글이 아니라 교사만 보는 메모 */
  originNote?: string | null;
}

/** 한 번 시도한 결과로 다음 상태를 정한다. 실패는 3회까지 다시 시도하고, 그래도 안 되면 ERROR */
export function afterAttempt(job: Pick<DraftJob, "attempts">, ok: boolean, error?: string): Pick<DraftJob, "state" | "attempts" | "error"> {
  const attempts = job.attempts + 1;
  if (ok) return { state: "DONE", attempts, error: null };
  if (attempts >= MAX_ATTEMPTS) return { state: "ERROR", attempts, error: `${MAX_ATTEMPTS}회 재시도 실패 · 수동 작성 필요${error ? ` (${error})` : ""}` };
  return { state: "PENDING", attempts, error: error ?? null };
}

/** 학생별 마지막 버전 */
export function latestVersion(versions: DraftVersion[], jobId: string): DraftVersion | undefined {
  let best: DraftVersion | undefined;
  for (const v of versions) if (v.jobId === jobId && (!best || best.createdAt <= v.createdAt)) best = v;
  return best;
}

export type ReviewStatus = "검토 대기" | "확정" | "반려" | "생성 중" | "생성 실패" | "대기";
export function reviewStatus(job: DraftJob | undefined, latest: DraftVersion | undefined): ReviewStatus {
  if (!job) return "대기";
  if (latest?.status === "finalized") return "확정";
  if (latest?.status === "rejected") return "반려";
  if (job.state === "ERROR") return latest ? "검토 대기" : "생성 실패";
  if (job.state === "PENDING" || job.state === "RUNNING") return "생성 중";
  return latest ? "검토 대기" : "생성 실패";
}

// ---------- 초안 자동 검사 ----------

/** 받침이 ㅁ 인 글자(함·음·임·됨·봄…)로 끝나는 문장인가 — NEIS 개조식 어미 */
function endsWithNominal(sentence: string): boolean {
  const s = sentence.replace(/[\s'"’”」』)]+$/, "");
  const ch = s.charCodeAt(s.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return false;
  const jong = (ch - 0xac00) % 28;
  return jong === 16 || jong === 10; // ㅁ, ㄻ(만듦)
}

/** 문장 나누기: 마침표 기준 (따옴표 안 마침표는 드물어 무시) */
export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=\.)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 근거 글에서 뽑은 핵심 낱말 (2글자 이상 한글 낱말, 흔한 말 제외) */
const STOP = new Set(["그리고", "그래서", "하지만", "활동", "이번", "통해", "대해", "정말", "많이", "있어요", "했어요", "했다", "것을", "것이", "수업", "생각", "학생", "있는", "하는", "되는", "에서", "으로"]);
export function keywords(text: string): string[] {
  const words = text.match(/[가-힣A-Za-z0-9]{2,}/g) ?? [];
  const stems = words.map((w) => w.replace(/(을|를|이|가|은|는|에서|으로|로|와|과|의|에|도|만|까지|부터|이라|라고|했어요|했다|해요|하고|하여|해서)$/, ""));
  return [...new Set(stems.filter((w) => w.length >= 2 && !STOP.has(w)))];
}

export interface EvidenceItem {
  /** "설문 Q1" · "서류 탐구보고서.pdf" */
  label: string;
  text: string;
}

/** 학생 한 명의 근거: 설문 답(답한 문항) + 연결된 서류 + 교사 관찰 메모(N41). 프로그램의 근거 설정을 따른다 */
export function buildEvidence(
  program: Pick<Program, "source" | "questions" | "useMemos">,
  response: Pick<SurveyResponse, "answers" | "submittedAt"> | null | undefined,
  materials: Pick<Material, "fileName" | "text" | "status">[],
  memo?: string | null,
): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  if (usesSurvey(program.source) && response?.submittedAt) {
    program.questions.forEach((q, i) => {
      const a = (response.answers[q.id] ?? "").trim();
      if (a) out.push({ label: `설문 Q${i + 1} ${q.title}`, text: a });
    });
  }
  if (usesDocs(program.source)) {
    for (const m of materials) if (m.status === "matched") out.push({ label: `서류 ${m.fileName}`, text: m.text ?? "" });
  }
  if (usesMemos(program) && memo?.trim()) out.push({ label: "교사 메모", text: memo.trim() });
  return out;
}

export interface DraftCheck {
  length: { ok: boolean; value: number; reason?: "too_short" | "too_long" };
  identity: { ok: boolean; found: string[] };
  ending: { ok: boolean; bad: number; total: number };
  evidence: { ok: boolean; hits: string[]; total: number };
  /** 학생 근거(설문 답·서류 글)의 낱말이 들어간 문장 수. 프로그램 일반 설명·상투어 문장은 여기서 빠진다 */
  specific: { ok: boolean; grounded: number; total: number };
  /** 근거는 넉넉한데 근거 문장이 너무 적다 → 다시 만들어 볼 만하다 */
  weak: boolean;
  /** 다시 만들어야 하는 문제 (분량 초과·실명/학번·빈 글) */
  hardFail: string | null;
  allOk: boolean;
}

/** 초안 자동 검사: 글자수 범위 · 학번·실명 0건 · 어미 '~함.' · 근거 반영 */
/** 근거 문장 비율: 이 아래면 검사에서 "확인 필요", 더 낮으면 다시 만든다 */
export const SPECIFIC_MIN = 0.5;
export const SPECIFIC_RETRY = 0.4;

export function checkDraft(text: string, opts: { range: LengthRange; people: { name: string; studentNo: string }[]; evidence: EvidenceItem[] }): DraftCheck {
  const body = text.trim();
  const len = checkLength(body, opts.range);
  const found = findIdentity(body, opts.people);
  const ss = sentences(body);
  const bad = ss.filter((s) => !endsWithNominal(s.replace(/\.$/, "")) || !s.endsWith(".")).length;
  const draftWords = new Set(keywords(body));
  const hits = opts.evidence.filter((e) => keywords(e.text).some((k) => draftWords.has(k) || body.includes(k))).map((e) => e.label);
  const needHits = Math.min(1, opts.evidence.length);
  const evWords = new Set(opts.evidence.flatMap((e) => keywords(e.text)));
  const grounded = ss.filter((s) => keywords(s).some((k) => evWords.has(k))).length;
  const ratio = ss.length ? grounded / ss.length : 0;
  const specific = { ok: evWords.size === 0 || ratio >= SPECIFIC_MIN, grounded, total: ss.length };
  const weak = evWords.size >= 5 && ss.length > 0 && ratio < SPECIFIC_RETRY;
  const hardFail = !body ? "빈 초안" : len.reason === "too_long" ? "분량 초과" : found.length ? `${found.join("·")} 포함` : null;
  const result = {
    length: { ok: len.ok, value: len.value, reason: len.reason },
    identity: { ok: found.length === 0, found },
    ending: { ok: ss.length > 0 && bad === 0, bad, total: ss.length },
    evidence: { ok: hits.length >= needHits, hits, total: opts.evidence.length },
    specific,
    weak,
    hardFail,
  };
  return { ...result, allOk: !hardFail && result.length.ok && result.ending.ok && result.evidence.ok && specific.ok };
}

/** 분량을 넘으면 문장 단위로 뒤에서부터 잘라 맞춘다 (자르지 못하면 그대로) */
export function fitToLength(text: string, range: LengthRange): string {
  const ss = sentences(text);
  while (ss.length > 1 && checkLength(ss.join(" "), range).reason === "too_long") ss.pop();
  return ss.join(" ");
}

// ---------- AI 키가 없을 때의 예시 초안 (데모) ----------

const clip = (s: string, n = 48) => {
  const first = s.split(/[.!?…]\s/)[0] ?? s;
  const one = first.replace(/['"‘’“”]/g, "").replace(/[.!?~…]+/g, " ").replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n).trim()}…` : one;
};

/**
 * 결정적 예시 초안. AI가 꺼진 데모에서도 흐름을 볼 수 있게 한다 (화면에 "예시" 표시).
 * 입력은 이미 가림 처리된 글이어야 한다.
 */
export function sampleDraft(input: {
  title: string;
  area: DraftCategory;
  answers: string[];
  docs: { kind: string; text: string | null }[];
  careerGoal: string | null;
  range: LengthRange;
  /** 교사 관찰 메모 (N41, 가린 글) */
  memo?: string | null;
}): string {
  const [a1, a2, a3, a4] = input.answers.map((a) => (a ?? "").trim());
  const out: string[] = [];
  out.push(`${input.title} 활동에 참여하여 스스로 정한 주제로 탐구를 수행함.`);
  if (a1) out.push(`활동 과정에서 '${clip(a1)}'라고 정리하며 탐구 과정을 구체적으로 기록함.`);
  if (input.memo?.trim()) out.push(`활동 중 '${clip(input.memo, 60)}'(이)라는 모습이 관찰됨.`);
  for (const d of input.docs.slice(0, 2)) {
    out.push(d.text ? `제출한 ${d.kind}에서 '${clip(d.text, 40)}'라는 내용을 근거로 결과를 정리함.` : `제출한 ${d.kind}에 탐구 과정과 결과를 체계적으로 정리함.`);
  }
  if (a2) out.push(`활동을 통해 '${clip(a2)}'라는 점을 배웠다고 밝힘.`);
  if (a3) out.push(`'${clip(a3)}'라는 소감에서 스스로 돌아보는 태도를 보임.`);
  if (a4) out.push(`후속 계획으로 '${clip(a4)}'를 제시하며 탐구를 이어가려는 의지를 보임.`);
  if (input.careerGoal && (a2 || a4)) out.push(`희망 진로인 ${input.careerGoal} 분야와 '${clip(a4 || a2, 30)}'를 연결하여 의미를 해석함.`);
  return fitToLength(out.join(" "), input.range);
}

// ---------- 파이프라인 현황 (A4) ----------

export type Stage = "S1" | "S2" | "S3" | "S4" | "S5";
export const STAGE_LABEL: Record<Stage, string> = { S1: "수집", S2: "초안", S3: "검사", S4: "확정", S5: "전달" };

/**
 * 학생 한 명이 지금 어느 단계인가.
 * S1 근거 수집 · S2 초안 생성(대기·생성 중·실패) · S3 검사·교사 검토 대기 · S4 확정 · S5 전달(마감 지난 프로그램의 확정본)
 */
export function studentStage(o: { job?: DraftJob; latest?: DraftVersion; closed: boolean }): Stage {
  if (!o.job) return "S1";
  if (o.latest?.status === "finalized") return o.closed ? "S5" : "S4";
  if (o.job.state !== "DONE" && !(o.job.state === "ERROR" && o.latest)) return "S2";
  return "S3";
}

export type GateTag = "통과" | "진행" | "대기";
/** 프로그램의 게이트 G1~G4 (수집·초안·검토·전달) */
export function programGates(stages: Stage[], hasError: boolean): GateTag[] {
  const num = stages.map((s) => Number(s.slice(1)));
  const gate = (k: number): GateTag => {
    if (num.length > 0 && num.every((x) => x > k)) return "통과";
    return num.some((x) => x >= k) ? "진행" : "대기";
  };
  const g = [gate(1), gate(2), gate(3), gate(4)];
  if (hasError && g[1] === "통과") g[1] = "진행";
  return g;
}

/** 프로그램 대표 단계 = 가장 뒤처진 학생의 단계 */
export function programStage(stages: Stage[]): Stage {
  if (stages.length === 0) return "S1";
  return stages.reduce((a, b) => (Number(b.slice(1)) < Number(a.slice(1)) ? b : a));
}

/** 실패 원인을 묶어 센다 (A4 "실패 원인 요약" — 규칙 기반) */
export function summarizeErrors(errors: (string | null)[]): { cause: string; n: number }[] {
  const m = new Map<string, number>();
  for (const e of errors) {
    if (!e) continue;
    const cause = /분량 초과/.test(e) ? "글자 수 초과" : /실명|학번/.test(e) ? "실명·학번 포함" : /근거|자료 없음/.test(e) ? "근거 부족" : /AI|키|사용량|호출/.test(e) ? "AI 호출 실패" : "기타";
    m.set(cause, (m.get(cause) ?? 0) + 1);
  }
  return [...m.entries()].map(([cause, n]) => ({ cause, n })).sort((a, b) => b.n - a.n);
}

// ---------- 학생 할 일 ----------

export interface StudentTodo {
  programId: string;
  title: string;
  kind: "survey" | "docs";
  endDate: string;
  /** 설문: 답한 문항 / 전체, 서류: 올린 수 */
  progress: string;
}

// ---------- AI 보강의 규칙 대체 (키가 없을 때 "자동") ----------

/** A4 실패 원인별 조치 (규칙). AI 가 켜져 있으면 이 결과를 다듬는다 */
const ADVICE: Record<string, string> = {
  "글자 수 초과": "분량을 늘려 다시 만들거나 근거 자료가 너무 길지 않은지 확인해요",
  "실명·학번 포함": "자료 관리에서 서류 글에 이름·학번이 남았는지 확인한 뒤 다시 시도해요",
  "근거 부족": "설문 미제출·서류 미연결 학생은 담당 교사에게 수동 작성을 요청해요",
  "AI 호출 실패": "잠시 뒤 모두 다시 시도해요. 계속되면 AI 키·사용량을 확인해요",
  기타: "초안 보기에서 오류 내용을 확인하고 직접 작성을 요청해요",
};
export function errorAdvice(causes: { cause: string; n: number }[]): string[] {
  return causes.map((c) => `${c.cause} ${c.n}건 — ${ADVICE[c.cause] ?? ADVICE.기타}`);
}

/** T1·프로그램 목록 "이번 주 할 일" (규칙): 마감 임박·미응답·검토 대기·실패·발행 전 */
export interface WeekTodo {
  programId: string;
  text: string;
  /** 낮을수록 먼저 */
  rank: number;
}
export function weekTodos(
  items: { id: string; title: string; status: ProgramStatus; endDate: string; targets: number; submitted: number; review: number; failed: number; drafts: number }[],
  today: string,
): WeekTodo[] {
  const out: WeekTodo[] = [];
  for (const s of items) {
    const left = daysLeft(s.endDate, today);
    const missing = s.targets - s.submitted;
    if (s.status === "open" && left <= 7 && missing > 0) out.push({ programId: s.id, rank: left, text: `${s.title} ${ddayLabel(s.endDate, today)} · 미응답 ${missing}명` });
    if (s.failed > 0) out.push({ programId: s.id, rank: 1, text: `${s.title} 생성 실패 ${s.failed}건` });
    if (s.review > 0) out.push({ programId: s.id, rank: 3, text: `${s.title} 검토 대기 ${s.review}건` });
    if (s.status === "closed" && s.drafts === 0 && s.submitted > 0) out.push({ programId: s.id, rank: 2, text: `${s.title} 마감 · 초안 만들기 전` });
    if (s.status === "draft") out.push({ programId: s.id, rank: 5, text: `${s.title} 발행 전` });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

/** T2 응답 분석 (규칙): 공통 낱말 · 눈에 띄는 응답 · 근거가 얇은 학생. 입력은 가명ID와 가린 답 */
export interface ResponseDigest {
  themes: string[];
  highlights: { pid: string; note: string }[];
  thin: { pid: string; note: string }[];
}
export function responseDigest(students: { pid: string; answers: string[] }[], minChars = MIN_ANSWER_CHARS): ResponseDigest {
  const df = new Map<string, number>();
  for (const s of students) for (const k of new Set(keywords(s.answers.join(" ")))) df.set(k, (df.get(k) ?? 0) + 1);
  const floor = Math.max(2, Math.ceil(students.length * 0.2));
  const themes = [...df.entries()].filter(([, n]) => n >= floor).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).slice(0, 6).map(([k, n]) => `${k} (${n}명)`);
  const scored = students.map((s) => {
    const all = s.answers.join(" ");
    const len = all.replace(/\s/g, "").length;
    const rare = keywords(all).filter((k) => (df.get(k) ?? 0) === 1);
    return { s, len, rare, nums: /\d/.test(all) };
  });
  const highlights = scored
    .filter((x) => x.rare.length >= 3 && x.len >= minChars * 2)
    .sort((a, b) => b.rare.length - a.rare.length || b.len - a.len)
    .slice(0, 3)
    .map((x) => ({ pid: x.s.pid, note: `다른 학생에게 없는 낱말: ${x.rare.slice(0, 3).join(", ")}${x.nums ? " · 수치 있음" : ""}` }));
  const thin = scored
    .filter((x) => x.s.answers.filter((a) => a.trim().length < minChars * 1.5).length >= Math.ceil(x.s.answers.length / 2))
    .sort((a, b) => a.len - b.len)
    .slice(0, 5)
    .map((x) => ({ pid: x.s.pid, note: `답이 짧아요 (모두 ${x.len}자)` }));
  return { themes, highlights, thin };
}

/** T4 비슷한 문장 찾기: 글자 3-gram 자카드 유사도 (공백·문장부호 무시) */
function grams(s: string, n = 3): Set<string> {
  const t = s.replace(/[\s.,'"’”‘“·()]/g, "");
  const out = new Set<string>();
  for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n));
  return out;
}
export function similarity(a: string, b: string): number {
  const x = grams(a);
  const y = grams(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const g of x) if (y.has(g)) inter++;
  return inter / (x.size + y.size - inter);
}
export interface SimilarHit {
  sentence: string;
  peer: string;
  peerSentence: string;
  score: number;
}
/** 내 초안 문장마다 다른 학생 초안에서 가장 비슷한 문장 (threshold 이상만, 높은 순) */
export function similarSentences(text: string, peers: { label: string; text: string }[], threshold = 0.45): SimilarHit[] {
  const others = peers.flatMap((p) => sentences(p.text).map((s) => ({ label: p.label, s })));
  const hits: SimilarHit[] = [];
  for (const mine of sentences(text)) {
    if (mine.replace(/\s/g, "").length < 12) continue;
    let best: SimilarHit | null = null;
    for (const o of others) {
      const score = similarity(mine, o.s);
      if (score >= threshold && (!best || score > best.score)) best = { sentence: mine, peer: o.label, peerSentence: o.s, score: Math.round(score * 100) / 100 };
    }
    if (best) hits.push(best);
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** 문장 다르게 쓰기 (규칙): 어미를 '~함.'으로 맞추고 흔한 서술어를 바꾼 안. 같은 글이면 빼고 최대 2개 */
const VERB_SWAP: [RegExp, string][] = [
  [/정리함\.$/, "체계적으로 정리함."], [/조사함\.$/, "찾아 비교함."], [/발표함\.$/, "설명함."], [/탐구함\.$/, "깊이 있게 탐구함."],
  [/보임\.$/, "드러냄."], [/깨달음\.$/, "이해함."], [/참여함\.$/, "성실히 임함."], [/노력함\.$/, "힘씀."], [/하였음\.$/, "함."],
];
export function rephraseRule(sentence: string): string[] {
  const s = sentence.trim();
  const ending = s
    .replace(/(했다|하였다|했어요|해요|한다)\.?$/, "함.")
    .replace(/(이다|입니다)\.?$/, "임.")
    .replace(/(였다|었다)\.?$/, "음.")
    .replace(/([^.])$/, "$1.");
  const out = [ending];
  const swap = VERB_SWAP.find(([re]) => re.test(ending));
  if (swap) out.push(ending.replace(swap[0], swap[1]));
  return [...new Set(out.map((x) => x.replace(/\s{2,}/g, " ").trim()))].filter((x) => x !== s).slice(0, 2);
}

// ---------- 전체 일정 (목록·캘린더) ----------

/** "2026-10" → 그 달을 덮는 주(일~토, 2026-10-17 사용자 결정: 일요일 시작) 목록. 칸은 YYYY-MM-DD, 앞뒤 달 날짜도 채운다 */
export function monthGrid(ym: string): string[][] {
  const [y, m] = ym.split("-").map(Number);
  const first = `${ym}-01`;
  const dow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 일=0
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks: string[][] = [];
  let d = addDays(first, -dow);
  while (weeks.length === 0 || d <= `${ym}-${String(last).padStart(2, "0")}`) {
    const w: string[] = [];
    for (let i = 0; i < 7; i++) { w.push(d); d = addDays(d, 1); }
    weeks.push(w);
  }
  return weeks;
}

/** 이 달과 겹치는 프로그램 (시작일 순) */
export function programsInMonth<T extends Pick<Program, "startDate" | "endDate">>(list: T[], ym: string): T[] {
  const from = `${ym}-01`;
  const to = `${ym}-31`;
  return list.filter((p) => p.startDate <= to && p.endDate >= from).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** "2026-10" 에서 n달 이동 */
export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface WeekBar { id: string; from: number; to: number; lane: number; starts: boolean; ends: boolean }

/** 한 주(월~일 7칸)에 프로그램을 이어진 막대로 놓는다. 겹치면 아래 줄(lane)로 내린다 */
export function weekBars(week: string[], list: Pick<Program, "id" | "startDate" | "endDate">[]): WeekBar[] {
  const first = week[0];
  const last = week[week.length - 1];
  const lanes: number[] = []; // lane 마다 마지막으로 찬 칸
  return list
    .filter((p) => p.startDate <= last && p.endDate >= first)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate))
    .map((p) => {
      const from = Math.max(0, week.indexOf(p.startDate < first ? first : p.startDate));
      const to = p.endDate > last ? week.length - 1 : week.indexOf(p.endDate);
      let lane = lanes.findIndex((end) => end < from);
      if (lane === -1) { lane = lanes.length; lanes.push(to); } else lanes[lane] = to;
      return { id: p.id, from, to, lane, starts: p.startDate >= first, ends: p.endDate <= last };
    });
}

/** 그 날이 들어 있는 주 (일~토 7칸) */
export function weekOf(ymd: string): string[] {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  const start = addDays(ymd, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
