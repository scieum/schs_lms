import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { maskIdentity } from "@/lib/domain/program";
import { composeKeywordMemo } from "@/lib/domain/writing";
import { aiEnabled, aiJson, fileBlock } from "./claude";

// 자료로 쓰기 (Figma N10): 교사가 올린 학생 자료(보고서·활동지·소감문 PDF·이미지·HWPX·TXT)를 읽어
// - record: 생기부 초안의 근거 (주제)(활동)(키워드) 묶음으로 → AI 초안 입력에 붙는다 (교사가 보고 고칠 수 있다)
// - log: 누가기록 한두 문장으로 → 교사가 확인 후 넣는다
// 저장하지 않는다. 글로 된 자료는 이름·학번을 가린 뒤 보내고, AI가 돌려준 글도 다시 가린다.

export type EvidenceMode = "record" | "log";
export type EvidenceFile = { bytes: Uint8Array; mime: string; name: string; text: string | null };
export type EvidenceResult = { ok: true; text: string; label: "AI" | "자동" } | { ok: false; error: string };
type People = { name: string; studentNo: string }[];

const TEXT_MAX = 12000;

const RecordOut = z.object({
  activities: z.array(z.object({ topic: z.string(), activity: z.string(), keywords: z.string() })).max(3),
});
const LogOut = z.object({ log: z.string() });

const RECORD_SYSTEM = (kind: string, context?: string | null) => `첨부한 자료는 고등학생이 낸 활동 자료(보고서·활동지·소감문 등)다.
교사가 이 자료로 학교생활기록부 ${kind}${context ? ` (${context})` : ""} 를 쓰려 한다. 초안의 근거가 될 활동을 뽑는다.
- activities: 자료 속 활동을 1~3개. 각 활동은
  - topic: 학생이 고른 주제·탐구 질문 (한 줄)
  - activity: 학생이 실제로 한 과정·방법·자료·결과·깨달은 점을 자료 표현을 살려 2~4문장. 수치·도구·개념 이름은 그대로
  - keywords: 이 활동에서 드러난 역량 2~4개 (예: 탐구 설계, 자료 해석, 협업, 진로 연계)
- 자료에 없는 활동·수치·수상은 만들지 않는다. 학생 이름·학번은 쓰지 않는다.
- 교외 수상, 공인 어학 성적, 기관·대학·회사 이름은 옮기지 않는다.`;

const LOG_SYSTEM = (area: string) => `첨부한 자료는 고등학생 활동 자료(활동지·보고서·사진 등)다. 교사가 ${area} 누가기록(관찰 기록)을 남기려 한다.
- log: 자료로 알 수 있는 활동을 누가기록 문체 1~2문장(150자 안팎)으로. "~함", "~임"으로 끝내고 주어(학생 이름)는 쓰지 않는다
- 언제·무엇을·어떻게 했는지 구체적으로. 자료에 없는 내용, 평가하는 꾸밈말("우수함", "성실함")은 넣지 않는다.`;

/** 키 없이도(데모) 글 자료는 앞부분으로 근거를 만든다. PDF·이미지는 AI가 있어야 읽는다 */
function fallback(file: EvidenceFile, mode: EvidenceMode, people: People): EvidenceResult {
  if (!file.text) return { ok: false, error: "AI가 꺼져 있어 PDF·이미지는 읽지 못해요. 메모로 써 주세요" };
  const body = maskIdentity(file.text, people).replace(/\s+/g, " ").trim();
  if (!body) return { ok: false, error: "자료에서 글을 찾지 못했어요" };
  if (mode === "log") return { ok: true, label: "자동", text: body.slice(0, 150) };
  const topic = file.name.replace(/\.[^.]+$/, "");
  return { ok: true, label: "자동", text: composeKeywordMemo([{ topic, activity: body.slice(0, 500), keywords: "" }]) };
}

export async function readEvidence(file: EvidenceFile, opts: { mode: EvidenceMode; kind: string; context?: string | null; people: People }): Promise<EvidenceResult> {
  const { mode, people } = opts;
  if (!aiEnabled()) return fallback(file, mode, people);

  const content: Anthropic.ContentBlockParam[] = file.text
    ? [{ type: "text", text: `<자료 이름="${maskIdentity(file.name, people)}">\n${maskIdentity(file.text, people).slice(0, TEXT_MAX)}\n</자료>` }]
    : [fileBlock(file.bytes, file.mime)];
  content.push({ type: "text", text: mode === "log" ? "이 자료로 누가기록을 써 주세요." : "이 자료에서 활동을 뽑아 주세요." });

  if (mode === "log") {
    const r = await aiJson(LogOut, { system: LOG_SYSTEM(opts.kind), content, model: "fast", maxTokens: 800 });
    if (!r.ok) return { ok: false, error: r.error };
    const text = maskIdentity(r.data.log.trim(), people);
    return text ? { ok: true, label: "AI", text } : { ok: false, error: "자료에서 활동을 찾지 못했어요" };
  }
  const r = await aiJson(RecordOut, { system: RECORD_SYSTEM(opts.kind, opts.context), content, model: "fast", maxTokens: 2500 });
  if (!r.ok) return { ok: false, error: r.error };
  const text = maskIdentity(composeKeywordMemo(r.data.activities), people);
  return text ? { ok: true, label: "AI", text } : { ok: false, error: "자료에서 활동을 찾지 못했어요" };
}
