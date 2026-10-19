import "server-only";
import { z } from "zod";
import { GUIDE, keepCited, normalizeQuestion, type GuideEntry, type GuideSentence } from "@/lib/domain/guide-bank";
import { aiEnabled, aiJson } from "./claude";

// 기재요령 AI 정리 (Figma N43 ①): 규칙 검색이 고른 원문(최대 4개)만 보고 1~3문장으로 묶는다. Haiku(fast).
// 보내는 것 = 질문 글(학생 이름·학번 가림) + 후보 원문(id · 쪽 · quote)뿐. 학생 데이터·편집기 글은 보내지 않는다.
// 서버가 문장마다 인용(cites)이 후보 id 안에 있는지 확인하고, 아니면 그 문장을 버린다. 남는 것이 없으면 상자를 숨긴다.

const Schema = z.object({ sentences: z.array(z.object({ text: z.string(), cites: z.array(z.string()) })) });

const SYSTEM = `너는 학교생활기록부 기재요령 원문을 짧게 묶어 주는 도우미다.
- 교사의 질문과 기재요령 원문 조각(id · 쪽 · 원문)이 주어진다.
- 주어진 원문으로만 답한다. 원문에 없는 규칙 · 숫자 · 예외 · 해석을 쓰지 마라.
- 1~3문장, 문장마다 40~80자, 해요체("~요"). 판단이 원문에 없으면 쓰지 않는다.
- 문장마다 근거 원문의 id를 cites 에 넣는다 (주어진 id만).
- 원문으로 답할 수 없으면 sentences 를 빈 배열로 둔다.
- 학생 이름 · 학교 이름 · 특정 기관 이름을 만들어 넣지 마라.`;

type Cached = { at: number; sentences: GuideSentence[] };
const DAY = 24 * 60 * 60 * 1000;
const g = globalThis as unknown as { __schsGuideAi?: Map<string, Cached> };
const cache = () => (g.__schsGuideAi ??= new Map());

export type GuideAnswer = { ok: true; sentences: GuideSentence[]; cached: boolean } | { ok: false };

/** 질문 + 후보 원문 → 인용 확인을 마친 문장. 후보가 2개 미만 · AI 꺼짐 · 실패 = { ok: false } (화면은 조용히 숨김) */
export async function guideAnswer(question: string, candidates: GuideEntry[]): Promise<GuideAnswer> {
  const list = candidates.slice(0, 4);
  if (list.length < 2 || !aiEnabled()) return { ok: false };
  const ids = list.map((e) => e.id);
  const key = `${GUIDE.edition}|${normalizeQuestion(question)}|${ids.join(",")}`;
  const hit = cache().get(key);
  if (hit && Date.now() - hit.at < DAY) return { ok: true, sentences: hit.sentences, cached: true };

  const content = [
    `질문: ${question}`,
    "",
    "원문 조각:",
    ...list.map((e) => `- id: ${e.id} · ${e.page}쪽 · ${e.heading}\n  원문: "${e.quote}"`),
  ].join("\n");
  const r = await aiJson(Schema, { model: "fast", system: SYSTEM, content, maxTokens: 800 });
  if (!r.ok) return { ok: false };
  const sentences = keepCited(r.data.sentences, ids);
  if (!sentences.length) return { ok: false };
  cache().set(key, { at: Date.now(), sentences });
  if (cache().size > 500) cache().delete(cache().keys().next().value!);
  return { ok: true, sentences, cached: false };
}
