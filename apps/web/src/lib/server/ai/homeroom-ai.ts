import "server-only";
import { z } from "zod";
import { AREAS, INQUIRY_LABEL, SUBJECT_LABEL, SUBJECTS, type Area, type InquiryMode, type NumberedScoreRow, type ParsedMinRule } from "@/lib/domain/scores";
import { aiEnabled, aiJson, fileBlock, type AiResult } from "./claude";

// 담임 화면(H1~H5·봉사)의 버튼형 AI. 결과는 화면에서 사람이 확인한 뒤에만 반영한다.
// 학생은 가명ID만 보낸다. 서버가 결과의 가명ID를 다시 이름으로 바꿔 보여 준다.
// 예외: 성적표 사진·PDF(readScorePicture) — 사진 안의 이름 열이 그대로 전송될 수 있다. 번호 열만 읽게 지시하고 이름은 받지 않는다.

type Labeled<T> = T & { label: "AI" | "자동"; error?: string };

// ---------------------------------------------------------------- H1 우리 반 브리핑

export interface BriefCandidate {
  pid: string;
  signals: string[];
}

/** 규칙으로 고른 후보(최대 6명)를 보고 먼저 볼 3명과 이유를 고른다. 꺼져 있으면 규칙 상위 3명 */
export async function briefClass(cands: BriefCandidate[], fallback: { line: string; picks: { pid: string; reason: string }[] }): Promise<Labeled<{ line: string; picks: { pid: string; reason: string }[] }>> {
  if (!cands.length || !aiEnabled()) return { ...fallback, label: "자동" };
  const r = await aiJson(z.object({ summary: z.string(), picks: z.array(z.object({ id: z.string(), reason: z.string() })) }), {
    model: "fast",
    system: `고등학교 담임교사의 "우리 반 브리핑"을 만든다. 학생별 신호(수능 최저 근접·미충족, 야자 결석 패턴, 정정 요청, 새 초안)를 보고 오늘 먼저 챙길 학생 3명을 고른다.
- 지금 상담하면 바뀔 수 있는 학생(최저 근접, 결석이 늘어나는 학생)을 앞에 둔다
- reason 은 45자 이내 한 문장, 무엇을 확인·상담할지 구체적으로
- summary 는 반 전체 한 줄(45자 이내)
- 목록에 없는 학생은 만들지 않는다`,
    content: `학생 신호 (가명ID: 신호들):\n${cands.map((c) => `${c.pid}: ${c.signals.join(" / ")}`).join("\n")}`,
  });
  if (!r.ok) return { ...fallback, label: "자동", error: r.error };
  const known = new Set(cands.map((c) => c.pid));
  const picks = r.data.picks.filter((p) => known.has(p.id)).slice(0, 3).map((p) => ({ pid: p.id, reason: p.reason.trim().slice(0, 80) }));
  if (!picks.length) return { ...fallback, label: "자동" };
  return { line: r.data.summary.trim().slice(0, 80), picks, label: "AI" };
}

// ---------------------------------------------------------------- H2 학생 기록 탭 해석

/** 성적 탭: 모의고사 추이 해석 한 줄 */
export async function scoreTrendLine(
  pid: string,
  data: { trend: { label: string; average: number | null }[]; latest: Record<string, number | null> | null; targets: { rank: number; status: string; reason: string }[] },
  fallback: string,
): Promise<Labeled<{ line: string }>> {
  if (data.trend.length < 2 || !aiEnabled()) return { line: fallback, label: "자동" };
  const r = await aiJson(z.object({ line: z.string() }), {
    model: "fast",
    system: "고등학교 담임이 학생 성적 추이를 빠르게 이해하도록 돕는다. 모의고사 평균 등급(낮을수록 좋음) 추이와 최근 과목별 등급, 목표 대학 최저 판정을 보고 해석을 한 줄(60자 이내)로 쓴다. 흐름(오름·내림·정체)과 상담에서 짚을 과목 하나를 넣는다. 해요체.",
    content: `학생: ${pid}
추이: ${data.trend.map((t) => `${t.label} ${t.average ?? "없음"}`).join(" → ")}
최근 등급: ${data.latest ? SUBJECTS.map((k) => `${SUBJECT_LABEL[k]} ${data.latest![k] ?? "빈칸"}`).join(", ") : "없음"}
목표 판정: ${data.targets.map((t) => `${t.rank}순위 ${t.status} (${t.reason})`).join(" / ") || "없음"}`,
  });
  return r.ok ? { line: r.data.line.trim().slice(0, 100), label: "AI" } : { line: fallback, label: "자동", error: r.error };
}

/** 야자 탭: 4주 출결 한 줄 */
export async function nightLine(pid: string, records: string[], fallback: string): Promise<Labeled<{ line: string }>> {
  if (!records.length || !aiEnabled()) return { line: fallback, label: "자동" };
  const r = await aiJson(z.object({ line: z.string() }), {
    model: "fast",
    system: "고등학교 담임을 돕는다. 학생의 최근 4주 야간 자율학습 기록(날짜·요일·교시·상태)을 보고 출결 흐름을 한 줄(50자 이내)로 정리한다. 결석이 몰린 요일·교시가 있으면 넣는다. 꾸짖지 않는 해요체.",
    content: `학생: ${pid}\n기록:\n${records.join("\n")}`,
  });
  return r.ok ? { line: r.data.line.trim().slice(0, 100), label: "AI" } : { line: fallback, label: "자동", error: r.error };
}

// ---------------------------------------------------------------- H3 성적표 사진·PDF 읽기

const G = z.number().int().nullable();
const PictureOut = z.object({
  rows: z.array(z.object({ number: z.number().int().nullable(), ko: G, ma: G, en: G, hi: G, t1: G, t2: G })),
});

/** 성적표 사진·PDF → 번호·등급 행. 이름은 받지 않는다 (서버에서 번호로 명단과 맞춘다) */
export async function readScorePicture(bytes: Uint8Array, mime: string): Promise<AiResult<NumberedScoreRow[]>> {
  const r = await aiJson(PictureOut, {
    model: "fast",
    maxTokens: 6000,
    system: `첨부한 파일은 고등학교 한 반의 모의고사 성적표(사진·캡처·PDF)다. 표를 읽어 학생 한 줄씩 옮긴다.
- 학생 이름 열은 읽지 않고 옮기지도 않는다. 번호(출석번호) 열만 number 로 쓴다. 번호가 안 보이면 null
- ko=국어, ma=수학, en=영어, hi=한국사, t1=탐구 첫 과목(통합사회·사회탐구), t2=탐구 둘째 과목(통합과학·과학탐구)
- 원점수·표준점수·백분위가 아니라 등급(1~9)만 옮긴다. 비었거나 결시면 null
- 표에 없는 행을 만들지 않는다`,
    content: [fileBlock(bytes, mime), { type: "text", text: "번호와 과목별 등급만 옮겨 주세요." }],
  });
  if (!r.ok) return r;
  const s = (n: number | null) => (n === null ? "" : String(n));
  return {
    ok: true,
    data: r.data.rows.map((x) => ({ number: s(x.number), ko: s(x.ko), ma: s(x.ma), en: s(x.en), hi: s(x.hi), t1: s(x.t1), t2: s(x.t2) })),
  };
}

// ---------------------------------------------------------------- H4 모집요강 → 최저 기준

const AREA_ENUM = z.enum(AREAS as [Area, ...Area[]]);
const RuleOut = z.object({
  university: z.string().nullable(),
  major: z.string().nullable(),
  found: z.boolean().describe("수능 최저 기준이 문서에 있으면 true"),
  pool: z.array(AREA_ENUM),
  pick: z.number().int().nullable(),
  maxSum: z.number().nullable(),
  required: z.array(AREA_ENUM),
  historyMax: z.number().int().nullable(),
  inquiry: z.enum(["best", "avg", "avgFloor"]),
  note: z.string().nullable(),
});
export type ExtractedRule = Omit<ParsedMinRule, "found"> & { university: string; major: string; note: string };

/** 모집요강 문구·캡처 → 최저 기준 한 개 (교사가 확인 후 저장). 학생 정보가 아닌 공개 문서라 그대로 보낸다 */
export async function extractMinRule(input: { text?: string; file?: { bytes: Uint8Array; mime: string } }): Promise<AiResult<ExtractedRule>> {
  const content = input.file
    ? [fileBlock(input.file.bytes, input.file.mime), { type: "text" as const, text: input.text ? `참고 문구:\n${input.text}` : "수능 최저 기준을 찾아 주세요." }]
    : `모집요강 문구:\n${input.text ?? ""}`;
  const r = await aiJson(RuleOut, {
    model: "fast",
    system: `첨부한 자료는 대학 모집요강의 수능 최저학력기준 부분이다. 기준 하나(처음 나오는 학과·전형)를 정해진 형식으로 옮긴다.
- pool: 반영 영역 (ko=국어, ma=수학, en=영어, tam=탐구). 제2외국어·직탐은 넣지 않는다
- pick: 몇 개 영역, maxSum: 등급 합 이내 (예: "3개 영역 등급 합 7 이내" → pick 3, maxSum 7)
- required: 꼭 포함해야 하는 영역 (예: "수학 포함"), 없으면 빈 배열
- historyMax: 한국사 n등급 이내, 없으면 null
- inquiry: ${(Object.keys(INQUIRY_LABEL) as InquiryMode[]).map((k) => `${k}=${INQUIRY_LABEL[k]}`).join(", ")}
- note: 위 칸에 못 담은 조건(과탐 필수, 수학 미적분·기하 지정 등)을 40자 이내로, 없으면 null
- 최저 기준이 없으면 found=false`,
    content,
  });
  if (!r.ok) return r;
  const d = r.data;
  if (!d.found || !d.pick || !d.maxSum) return { ok: false, error: "자료에서 수능 최저 기준을 찾지 못했어요. 직접 입력해 주세요" };
  const pool = AREAS.filter((a) => d.pool.includes(a));
  return {
    ok: true,
    data: {
      university: (d.university ?? "").slice(0, 40),
      major: (d.major ?? "").slice(0, 40),
      pool: pool.length ? pool : [...AREAS],
      pick: d.pick,
      maxSum: d.maxSum,
      required: AREAS.filter((a) => d.required.includes(a)),
      historyMax: d.historyMax && d.historyMax >= 1 && d.historyMax <= 9 ? d.historyMax : null,
      inquiry: d.inquiry,
      note: (d.note ?? "").slice(0, 100),
    },
  };
}

// ---------------------------------------------------------------- 봉사 받은함 한 줄

export async function serviceLine(rows: { pid: string; confirmed: number; waiting: number }[], fallback: string): Promise<Labeled<{ line: string }>> {
  if (!rows.length || !aiEnabled()) return { line: fallback, label: "자동" };
  const r = await aiJson(z.object({ line: z.string() }), {
    model: "fast",
    system: "고등학교 담임을 돕는다. 반 학생별 봉사활동 누적 시간(확인된 시간)과 확인 대기 건수를 보고, 담임이 챙길 점을 한 줄(60자 이내, 해요체)로 쓴다. 기록이 없거나 적은 학생 수, 확인 대기 처리를 우선으로 말한다. 가명ID는 쓰지 않는다.",
    content: `학생별 (가명ID: 확인 시간 / 대기 건수):\n${rows.map((x) => `${x.pid}: ${x.confirmed}시간 / ${x.waiting}건`).join("\n")}`,
  });
  return r.ok ? { line: r.data.line.trim().slice(0, 100), label: "AI" } : { line: fallback, label: "자동", error: r.error };
}
