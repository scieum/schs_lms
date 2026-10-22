import "server-only";
import { z } from "zod";
import { ASSESS_LIMITS } from "@/lib/domain/assessment";
import { isReadableByAi } from "@/lib/domain/program";
import type { ReadUpload } from "@/lib/server/hwpx";
import { aiJson, fileBlock, type AiResult } from "./claude";

// 수행평가 계획서 읽기 (2026-10-22 "수행평가 입력할 때 자료 업로드하면 AI 가 자동 분석"): 평가 계획서 · 안내문 → 수행평가 목록(이름 · 날짜 · 내용 · 기준).
// 학교 문서라 학생 정보가 없다. 가벼운 뽑기라 Haiku(fast). 결과는 등록 창에 채워 교사가 확인한 뒤에만 저장한다.

const Schema = z.object({ items: z.array(z.object({ title: z.string(), date: z.string().nullable(), description: z.string() })) });
export type PlanItem = { title: string; date: string | null; description: string };

const SYSTEM = (subject: string, year: number) => `첨부한 자료는 고등학교 "${subject}" 과목의 수행평가 계획서 · 안내문이다. 수행평가를 하나씩 뽑는다.
- title: 수행평가 이름 (${ASSESS_LIMITS.title}자 이내, 예: "빗면 실험 보고서")
- date: 실시일 YYYY-MM-DD (학년도 ${year}, 3~12월은 ${year}년 · 1~2월은 ${year + 1}년). 기간이면 시작일, 없으면 null
- description: 무엇을 하고 어떻게 평가하는지 — 과제 · 평가 요소 · 기준 · 배점을 ${ASSESS_LIMITS.description}자 이내로 줄여 쓴다. 줄바꿈 가능
- 지필평가 · 학기 일정표처럼 수행평가가 아닌 것은 뺀다. 수행평가가 없으면 items 를 빈 배열로.`;

export async function readAssessPlan(f: ReadUpload, ctx: { subject: string; year: number }): Promise<AiResult<PlanItem[]>> {
  const content = f.text
    ? `<자료 이름="${f.name}">\n${f.text.slice(0, 30000)}\n</자료>`
    : isReadableByAi(f.mime)
      ? [fileBlock(f.bytes, f.mime), { type: "text" as const, text: `자료 이름: ${f.name}` }]
      : null;
  if (!content) return { ok: false, error: "PDF · 이미지 · HWPX · PPTX · TXT 만 읽을 수 있어요" };
  const r = await aiJson(Schema, { model: "fast", system: SYSTEM(ctx.subject, ctx.year), content, maxTokens: 3000 });
  if (!r.ok) return r;
  const items = r.data.items
    .map((x) => ({ title: x.title.trim().slice(0, ASSESS_LIMITS.title), date: /^\d{4}-\d{2}-\d{2}$/.test(x.date ?? "") ? x.date : null, description: x.description.trim().slice(0, ASSESS_LIMITS.description) }))
    .filter((x) => x.title);
  return items.length ? { ok: true, data: items } : { ok: false, error: "자료에서 수행평가를 찾지 못했어요. 직접 입력해 주세요" };
}
