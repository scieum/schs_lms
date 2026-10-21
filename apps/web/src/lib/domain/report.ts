// 학생 리포트 (Figma N55): 교사가 볼 수 있는 범위(우리 반 · 내 분반 · 내 동아리)의 기록을 학생마다 한 장으로 모은다.
// 화면에서는 한 학생씩 넘겨 보고, 인쇄하면 학생마다 A4 한 장(PDF로 저장 가능). 저장하는 것은 없다 — 한마디 · AI 한눈에 보기는 그 화면에만.

export type ReportScopeKind = "homeroom" | "course" | "club";
export type ReportItem = "setuk" | "record" | "behavior" | "logs" | "program" | "service" | "counsel" | "ai";
export type ReportTerm = 1 | 2 | "year";

export const REPORT_ITEM_LABEL: Record<ReportItem, string> = {
  setuk: "교과 세특", record: "창체 · 자율 · 동아리 · 진로", behavior: "행동특성 및 종합의견", logs: "누가기록",
  program: "특색활동", service: "봉사", counsel: "상담 기록", ai: "AI 한눈에 보기",
};

/** 범위마다 넣을 수 있는 것 (그 교사가 볼 수 있는 기록만). 분반 = 그 과목 세특 + 세특 조각, 동아리 = 동아리 특기사항 + 동아리 누가기록 */
export function itemsFor(kind: ReportScopeKind): ReportItem[] {
  if (kind === "course") return ["setuk", "logs", "ai"];
  if (kind === "club") return ["record", "logs", "ai"];
  return ["setuk", "record", "behavior", "logs", "program", "service", "counsel", "ai"];
}

/** 처음 켜 둘 것: 상담 기록은 민감해서 꺼 둔다 */
export const defaultItems = (kind: ReportScopeKind): ReportItem[] => itemsFor(kind).filter((i) => i !== "counsel");

/** 주소의 items=setuk,logs → 그 범위에서 쓸 수 있는 것만 (없으면 기본) */
export function parseItems(raw: string | undefined, kind: ReportScopeKind): ReportItem[] {
  const ok = itemsFor(kind);
  if (raw === undefined) return defaultItems(kind);
  return raw.split(",").filter((x): x is ReportItem => (ok as string[]).includes(x));
}

export const parseTerm = (raw: string | undefined, now: 1 | 2): ReportTerm => (raw === "1" ? 1 : raw === "2" ? 2 : raw === "year" ? "year" : now);
export const TERM_LABEL = (t: ReportTerm) => (t === "year" ? "1년" : `${t}학기`);

/** 학기 날짜 범위 (YYYY-MM-DD, 끝 포함): 1학기 3/1 ~ 8/31, 2학기 9/1 ~ 다음 해 2월 말, 1년 3/1 ~ 다음 해 2월 말 */
export function termRange(year: number, term: ReportTerm): [string, string] {
  const feb = `${year + 1}-02-${new Date(Date.UTC(year + 1, 2, 0)).getUTCDate()}`;
  if (term === 1) return [`${year}-03-01`, `${year}-08-31`];
  if (term === 2) return [`${year}-09-01`, feb];
  return [`${year}-03-01`, feb];
}

export const inTerm = (date: string, [from, to]: [string, string]) => { const d = date.slice(0, 10); return d >= from && d <= to; };

export type ReportStatus = "확정" | "임시" | "비어 있음";
export function reportStatus(r: { content: string; status: string } | undefined | null): ReportStatus {
  if (!r || !r.content.trim()) return "비어 있음";
  return r.status === "confirmed" ? "확정" : "임시";
}

export type ReportText = { label: string; status: ReportStatus; text: string };
export type ReportLog = { date: string; tag: string; text: string };

/** 한 학생 리포트 (화면 · 인쇄 공통). 이름 · 학번은 화면에만 — URL 에는 내부 id 만 */
export type StudentReport = {
  id: string;
  name: string;
  /** "2학년 3반 1번 · 20301" (다른 학교 학생은 학교 이름) */
  classLine: string;
  setuk: ReportText[];
  record: ReportText[];
  behavior: ReportText | null;
  logs: ReportLog[];
  programs: { title: string; date: string }[];
  service: { date: string; activity: string; hours: number }[];
  counsel: ReportLog[];
};

/** 숫자 4칸: 누가기록 · 확정한 글 · 봉사 시간 · 특색활동 (켠 항목만) */
export function reportTiles(r: StudentReport, items: ReportItem[]): { label: string; value: string }[] {
  const on = new Set(items);
  const texts = [...(on.has("setuk") ? r.setuk : []), ...(on.has("record") ? r.record : []), ...(on.has("behavior") && r.behavior ? [r.behavior] : [])];
  const out: { label: string; value: string }[] = [];
  if (on.has("logs")) out.push({ label: "누가기록", value: `${r.logs.length}` });
  if (texts.length) out.push({ label: "확정한 글", value: `${texts.filter((t) => t.status === "확정").length} / ${texts.length}` });
  if (on.has("service")) out.push({ label: "봉사", value: `${r.service.reduce((n, s) => n + s.hours, 0)}시간` });
  if (on.has("program")) out.push({ label: "특색활동", value: `${r.programs.length}` });
  return out;
}

/** 누가기록은 인쇄 한 장에 들어가게 최근 몇 건만 */
export const LOGS_ON_PAPER = 6;

/** AI 한눈에 보기에 보낼 글: 이름 · 학번 없이 영역 이름과 글만 */
export function reportAiLines(r: StudentReport, items: ReportItem[]): string[] {
  const on = new Set(items);
  return [
    ...(on.has("setuk") ? r.setuk.filter((t) => t.text).map((t) => `[세특 ${t.label}] ${t.text}`) : []),
    ...(on.has("record") ? r.record.filter((t) => t.text).map((t) => `[${t.label}] ${t.text}`) : []),
    ...(on.has("behavior") && r.behavior?.text ? [`[행발] ${r.behavior.text}`] : []),
    ...(on.has("logs") ? r.logs.map((l) => `[누가기록 ${l.tag} ${l.date}] ${l.text}`) : []),
    ...(on.has("program") ? r.programs.map((p) => `[특색활동] ${p.title}`) : []),
  ];
}
