import "server-only";
import { z } from "zod";
import { isHwp, isHwpx } from "@/lib/domain/hwpx";
import { lessonsFromAi, lessonsFromText, scrubPeople, type LessonDraft } from "@/lib/domain/lesson-plan";
import { readUpload } from "@/lib/server/hwpx";
import { aiEnabled, aiJson } from "./claude";

// 운영계획서 → 차시 목록 (Figma N43 (e)): HWPX · PDF 의 글을 뽑아, 학교 학생 이름 · 학번을 가린 뒤 Sonnet(write)이 차시 표로 읽는다.
// 파일 자체(PDF 문서 블록)는 보내지 않는다 — 글만, 가린 뒤에. 날짜를 못 찾은 행은 null(확인 필요). 저장은 교사가 확인 화면에서.
// AI 키가 없으면 표 줄을 규칙으로 읽는다(lessonsFromText, "자동").

export const PLAN_MAX_BYTES = 10 * 1024 * 1024;
const TEXT_MAX = 30000;

const Schema = z.object({
  items: z.array(z.object({ no: z.number().nullable(), date: z.string().nullable(), title: z.string(), detail: z.string() })),
});

const SYSTEM = `너는 학교 수업·동아리 운영계획서에서 차시별 활동 표를 뽑는 도우미다.
- 계획서 글에서 차시(회차 · 주차)마다 하나씩 { no, date, title, detail } 를 만든다.
- no: 차시 번호(정수). 표에 번호가 없으면 순서대로.
- date: 그 차시 날짜를 글에 적힌 그대로 "2026-03-04" 꼴로. 월·일만 있으면 "3.4"처럼. 날짜를 찾지 못하면 null (지어내지 마라).
- title: 활동명 20자 안쪽 명사구 (예: "빗면 실험", "운동 법칙 탐구").
- detail: 그 차시 활동 내용 한 줄(60자 안쪽). 없으면 빈 글.
- 평가 계획 · 준비물 · 학생 명단 같은 차시가 아닌 표는 빼라. 학생 이름은 쓰지 마라.
- 차시를 하나도 찾지 못하면 items 를 빈 배열로.`;

export type PlanReadResult = { ok: true; items: LessonDraft[]; removed: number; chars: number; label: "AI" | "자동" } | { ok: false; error: string };

/** PDF 글 뽑기 (서버) — 스캔본처럼 글이 없으면 빈 글 */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text ?? "");
}

export async function readLessonPlanDoc(f: File, ctx: { year: number; people: { name: string; studentNo?: string }[]; label: string }): Promise<PlanReadResult> {
  if (f.size === 0) return { ok: false, error: "파일을 골라 주세요" };
  if (f.size > PLAN_MAX_BYTES) return { ok: false, error: "10MB까지 올릴 수 있어요" };
  const isPdf = /\.pdf$/i.test(f.name) || f.type === "application/pdf";
  if (!isPdf && !isHwpx(f.name) && !isHwp(f.name)) return { ok: false, error: "운영계획서는 HWPX · PDF 로 올려 주세요 (엑셀은 '계획 올리기')" };

  let raw = "";
  if (isPdf) {
    try { raw = await pdfText(new Uint8Array(await f.arrayBuffer())); } catch { return { ok: false, error: "PDF를 열지 못했어요. 한글에서 HWPX로 저장해 올려 주세요" }; }
  } else {
    const u = await readUpload(f);
    if (typeof u === "string") return { ok: false, error: u };
    raw = u.text ?? "";
  }
  const clean = raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length < 20) return { ok: false, error: "파일에서 글을 찾지 못했어요 (스캔한 PDF는 읽지 못해요). 엑셀 양식으로 올려 주세요" };
  const { text, removed } = scrubPeople(clean.slice(0, TEXT_MAX), ctx.people);
  // AI 키가 없으면 규칙으로 표 줄만 읽는다 ("자동")
  if (!aiEnabled()) {
    const items = lessonsFromText(text, ctx.year);
    return items.length ? { ok: true, items, removed, chars: text.length, label: "자동" } : { ok: false, error: "계획서에서 차시 표를 찾지 못했어요. 엑셀 양식으로 올려 주세요" };
  }

  const r = await aiJson(Schema, { model: "write", system: SYSTEM, content: `수업: ${ctx.label}\n학년도: ${ctx.year}\n\n<운영계획서>\n${text}\n</운영계획서>`, maxTokens: 6000 });
  if (!r.ok) return { ok: false, error: r.error };
  const items = lessonsFromAi(r.data.items, ctx.year);
  if (!items.length) return { ok: false, error: "계획서에서 차시를 찾지 못했어요. 엑셀 양식으로 올려 주세요" };
  return { ok: true, items, removed, chars: text.length, label: "AI" };
}
