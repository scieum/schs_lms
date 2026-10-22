import "server-only";
import { subjectStandards } from "../standards";
import { cleanActivity, leadWithActivity } from "@/lib/domain/activity-name";
import { UNIT_LABEL, type LengthRange } from "@/lib/domain/length";
import type { Student } from "@/lib/domain/types";
import { fitToMax, plainMemo, sampleDraft, scrubIdentity, type RecordArea } from "@/lib/domain/writing";
import { polishStyle } from "@/lib/domain/neis-style";
import type { Level } from "@/lib/domain/achievement";
import { evidenceAmount, praisePrompt } from "@/lib/domain/praise";
import { aiEnabled, aiJson } from "./claude";
import { recordSystemPrompt } from "./record-prompts";
import { joinSentences, SOURCED_RULES, SourcedOut, toKeys, type SourcedSentence } from "./sourced";
import type { GateResult } from "@/lib/domain/length-gate";

// 생기부 기록 초안: 교과 세특 · 창체 특기사항(자율·자치/동아리/진로) · 행발.
// - 교사가 "AI 초안"을 눌렀을 때만 부른다. 결과는 편집기에 채우기만 하고 저장은 교사가 한다.
// - AI에는 가명ID만 보낸다. 교사 메모·누가기록 속 이름·학번도 가명ID로 바꾼 뒤 보낸다.
// - 키가 없으면(데모) 메모·누가기록을 이어 붙인 결정적 예시 초안을 돌려준다(화면에 "예시").

export type WriteKind = "세특" | RecordArea;

export interface WriteInput {
  kind: WriteKind;
  student: Student;
  /** 세특 과목명, 동아리 이름 */
  context?: string;
  memo: string;
  /** key: 근거 표 key (N38 문장 근거 — 표지 ↔ key 는 서버에만) */
  logs: { date: string; content: string; key?: string }[];
  /** 관찰 메모의 근거 key (저장된 메모 조각) */
  memoKey?: string;
  range: LengthRange;
  /** 활동명 (N27): 초안을 "활동명에서 …"로 시작한다 */
  activity?: string;
  /** 성취수준 말투 한 줄 (N35 ③, achievement.levelPrompt) — 시스템 프롬프트 끝에 붙는다 */
  tone?: string;
  /** 고른 성취수준 (N41 과장 막기 — 안 골랐으면 null: 사실 그대로, 최상급 칭찬 금지) */
  level?: Level | null;
}

/** sentences: AI가 쓴 문장과 기댄 근거 key (N38). 예시 초안·실패면 없음 → 규칙으로 근거를 붙인다 */
/** gate (N49): 목표 ± 오차 게이트 결과 — 메모로 쓰기 · 맞추기 · 수정 요청 */
export type WriteResult = { text: string; sample: boolean; notice?: string; sentences?: SourcedSentence[]; gate?: GateResult };

// 문체·구성 규칙은 속초고 세특 프롬프트(노션)를 옮긴 record-prompts.ts 를 따른다
const APP_RULES = `
앱 규칙:
- 교사가 준 관찰 메모와 누가기록만 근거로 쓴다. 근거가 하나의 활동이면 (주제)와 (활동)으로, 여러 건이면 활동 블록 여러 개로 본다.
- 메모의 짧은 구절이나 누가기록 한 줄을 문장 하나로 옮기지 않는다. 같은 활동의 구절은 사실만 모아 이어진 문장으로 새로 쓴다.
- 관찰 메모가 (주제) (활동) (키워드) 형식이면 빈 줄로 나뉜 묶음 하나가 활동 하나다. (키워드)는 교사가 드러내고 싶은 역량이나 평가 강조점이므로 단어를 그대로 나열하지 말고 활동 장면 속 행동으로 풀어 쓴다.
- 교외 수상, 공인 어학 성적, 기관·대학·회사 이름, 부모 직업은 쓰지 않는다.
- 한 문단으로 쓴다.`;

function target(range: LengthRange): string {
  const unit = UNIT_LABEL[range.unit];
  const chars = range.unit === "bytes" ? ` (한글 약 ${Math.floor(range.min / 3)}~${Math.floor(range.max / 3)}자)` : "";
  return `${range.min.toLocaleString()}~${range.max.toLocaleString()}${unit}${chars}`;
}

export async function writeRecord(input: WriteInput): Promise<WriteResult> {
  const { student, range } = input;
  const pid = student.pseudonymId;
  // 교사가 이름을 적었어도 AI에는 가명ID만 간다
  const memo = scrubIdentity(input.memo.trim(), student, pid).text;
  const logs = input.logs.map((l) => ({ date: l.date, content: scrubIdentity(l.content, student, pid).text, key: l.key }));

  const fallback = (notice?: string): WriteResult => ({
    // 예시 초안은 서버 안에서만 만들므로 이름·학번을 지운 원문으로 만든다
    text: leadWithActivity(input.activity, polishStyle(sampleDraft({
      memo: plainMemo(scrubIdentity(input.memo, student).text),
      logs: input.logs.map((l) => scrubIdentity(l.content, student).text),
      careerGoal: input.kind === "진로" || input.kind === "세특" ? student.careerGoal : null,
      range,
    }))),
    sample: true,
    notice,
  });

  if (!memo && !logs.length) return { text: "", sample: false, notice: "관찰 메모나 누가기록이 있어야 초안을 만들 수 있어요" };
  if (!aiEnabled()) return fallback("AI 키가 없어 메모·누가기록을 이어 붙인 예시 초안이에요");

  // 근거 표지 (N38): 메모 [S1] · 누가기록 [S2] … — 표지 ↔ key 는 여기(서버)에만
  const keys: string[] = [];
  const tagOf = (key: string | undefined) => { keys.push(key ?? ""); return `[S${keys.length}]`; };
  const memoTag = memo ? tagOf(input.memoKey) : "";
  const logTags = logs.map((l) => tagOf(l.key));
  const labels = new Map(keys.map((k, i) => [`S${i + 1}`, k] as const).filter(([, k]) => !!k));
  const content = [
    `학생: ${pid}`,
    input.context ? `${input.kind === "세특" ? "과목" : "동아리"}: ${input.context}` : null,
    student.careerGoal ? `희망 진로: ${student.careerGoal}` : null,
    `분량: ${target(range)} 안에서 쓴다.`,
    cleanActivity(input.activity) ? `활동명: ${cleanActivity(input.activity)} — 초안 첫 문장을 "${cleanActivity(input.activity)}에서"로 시작하고 이어지는 문장에는 활동명을 다시 쓰지 않는다.` : null,
    "",
    "<교사 관찰 메모>",
    memo ? `${memoTag} ${memo}` : "(없음)",
    "</교사 관찰 메모>",
    "",
    "<누가기록>",
    logs.length ? logs.map((l, i) => `${i + 1}. ${logTags[i]} [${l.date}] ${l.content}`).join("\n") : "(없음)",
    "</누가기록>",
    // 세특: 그 과목 성취기준 가운데 활동과 이어지는 것 (lib/data, 교육부 고시)
    input.kind === "세특" ? subjectStandards(input.context, [memo, ...logs.map((l) => l.content)].join(" ")) || null : null,
  ]
    .filter((x) => x !== null)
    .join("\n");

  const system = recordSystemPrompt(input.kind, input.kind === "세특" ? input.context : null) + APP_RULES + SOURCED_RULES + (input.tone ?? "")
    + praisePrompt(input.level, evidenceAmount([memo, ...logs.map((l) => l.content)]));
  const r = await aiJson(SourcedOut, { system, content, model: "record", maxTokens: 3500 });
  if (!r.ok) return fallback(`${r.error} — 예시 초안을 대신 채웠어요`);

  // 결과에 이름·학번·가명ID가 섞이면 지운다
  const clean = leadWithActivity(input.activity, polishStyle(scrubIdentity(joinSentences(r.data.sentences), student).text.replaceAll(pid, "")));
  const fitted = fitToMax(clean, range);
  return { text: fitted, sample: false, notice: fitted !== clean ? "분량을 넘어 마지막 문장을 뺐어요" : undefined, sentences: toKeys(r.data.sentences, labels) };
}
