import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { maskIdentity } from "@/lib/domain/program";
import { GRADE_LIMITS, RUBRIC_LIMITS, SCALE_LABELS, defaultLevels, newCriterionId, type GradePick, type Rubric, type RubricScale } from "@/lib/domain/rubric";
import { aiJson, fileBlock, type AiResult } from "./claude";
import type { EvidenceFile } from "./read-evidence";

// 루브릭 채점 (Figma N72): ① 성취기준으로 루브릭 만들기 (①-2 교사가 만든 루브릭 파일 옮기기) ② 학생 답안을 읽고 기준마다 수준 제안 ③ 큰 PDF 쪽 하나를 글로 옮기기.
// 답안은 저장하지 않는다. 글로 된 답안은 이름 · 학번을 가린 뒤 보내고, AI가 돌려준 글도 다시 가린다. 결과는 교사가 확정해야 남는다.

type People = { name: string; studentNo: string }[];
type Std = { code: string; text: string };

const LEVEL_GUIDE = "수준 설명은 위에서부터 높은 수준. 2022 개정 성취수준 기술처럼 학생이 실제로 보여 주는 행동으로 쓴다(예: '근거 두 가지 이상을 출처와 함께 제시함'). '우수함' 같은 꾸밈말만 쓰지 않는다.";

const DraftOut = z.object({
  criteria: z.array(z.object({ name: z.string(), points: z.number(), levels: z.array(z.string()) })),
});

/** ① 성취기준 · 수행평가 내용 → 루브릭 초안 (등록 창 표에 채움, 저장 안 함). 학교 문서라 학생 정보가 없다 */
export async function draftRubric(o: { subject: string; title: string; description: string; standards: Std[]; scale: RubricScale; total: number }): Promise<AiResult<Rubric>> {
  const labels = SCALE_LABELS[o.scale];
  const system = `고등학교 "${o.subject}" 수행평가 「${o.title}」의 채점 기준(루브릭)을 만든다.
- criteria: 평가 기준 2~4개. name 은 12자 이내 명사형(예: "주장의 타당성"), points 는 배점 정수 — 모든 배점의 합이 ${o.total}점
- levels: 수준 ${labels.length}개(${labels.join(" · ")}) 설명을 차례대로, 하나에 60자 안팎 한 문장. ${LEVEL_GUIDE}
- 연결한 성취기준이 있으면 그 성취기준이 요구하는 지식 · 기능을 기준에 담는다. 성취기준 코드는 쓰지 않는다.
- 수행평가 내용에 평가 요소 · 배점이 적혀 있으면 그대로 따른다.`;
  const content = [
    `수행평가 내용 · 기준: ${o.description.trim() || "(적지 않음)"}`,
    o.standards.length ? `연결한 성취기준:\n${o.standards.map((s) => `- ${s.code} ${s.text}`).join("\n")}` : "연결한 성취기준: 없음",
  ].join("\n\n");
  const r = await aiJson(DraftOut, { model: "write", system, content, maxTokens: 3000 });
  if (!r.ok) return r;
  const criteria = r.data.criteria.slice(0, RUBRIC_LIMITS.criteria).map((c) => {
    const points = Math.min(RUBRIC_LIMITS.points, Math.max(1, Math.round(c.points) || 1));
    return { id: newCriterionId(), name: c.name.trim().slice(0, RUBRIC_LIMITS.name), points, levels: defaultLevels(o.scale, points, c.levels.map((d) => d.trim().slice(0, RUBRIC_LIMITS.desc))) };
  }).filter((c) => c.name);
  return criteria.length ? { ok: true, data: { scale: o.scale, criteria, standards: o.standards.map((s) => s.code) } } : { ok: false, error: "루브릭을 만들지 못했어요. 직접 적어 주세요" };
}

const ImportOut = z.object({
  levels: z.number(),
  criteria: z.array(z.object({ name: z.string(), points: z.number(), levels: z.array(z.object({ desc: z.string(), points: z.number().nullable() })) })),
  standards: z.array(z.string()),
});

/** ①-2 교사가 만든 루브릭 파일(PDF · HWPX · 사진, 큰 PDF는 쪽마다 옮긴 글) → 등록 창 표 (저장 안 함). 학교 문서라 학생 정보가 없다.
 *  파일의 단계 수가 3 이하면 상중하, 4 이상이면 A~E — 모자라는 아래 수준은 설명 · 점수를 비워 교사가 채우거나 지운다(지어내지 않는다). */
export async function importRubric(o: { file?: EvidenceFile; text?: string; subject: string; title: string; known: Std[] }): Promise<AiResult<Rubric>> {
  const system = `첨부한 것은 고등학교 "${o.subject}" 교사가 직접 만든 수행평가 채점 기준(루브릭) 문서다. 표에 적힌 그대로 옮긴다.
- levels: 문서의 수준(단계) 수. 예: 상 · 중 · 하 → 3, A~E → 5, 매우 우수 · 우수 · 보통 · 미흡 → 4
- criteria: 평가 기준(평가 요소)마다 하나, 문서 순서대로. name = 기준 이름(30자 이내, 문서 표현), points = 그 기준 배점(만점) 정수
  - levels: 높은 수준부터 차례대로 { desc: 그 수준 설명(문서 문장 그대로, 200자 이내), points: 그 수준 점수(문서에 없으면 null) }
- 문서에 수행평가가 여러 개면 「${o.title || "(이름 없음)"}」와 가장 맞는 하나만. 이름이 없으면 첫 번째.
- standards: 문서에 적힌 성취기준 코드(예: [10통과1-03-03]) 그대로. 없으면 빈 목록.
- 문서에 없는 기준 · 수준 · 설명은 만들지 않는다. 학생 이름 · 학번은 옮기지 않는다.`;
  let content: Anthropic.ContentBlockParam[];
  if (o.text != null) content = [{ type: "text", text: `<루브릭>\n${o.text.slice(0, 20000)}\n</루브릭>` }];
  else if (o.file?.text) content = [{ type: "text", text: `<루브릭 이름="${o.file.name}">\n${o.file.text.slice(0, 20000)}\n</루브릭>` }];
  else if (o.file) content = [fileBlock(o.file.bytes, o.file.mime)];
  else return { ok: false, error: "루브릭 파일이 없어요" };
  content.push({ type: "text", text: "이 루브릭을 표로 옮겨 주세요." });
  const r = await aiJson(ImportOut, { model: "write", system, content, maxTokens: 4000 });
  if (!r.ok) return r;
  const scale: RubricScale = r.data.levels >= 4 ? "A-E" : "상중하";
  const n = SCALE_LABELS[scale].length;
  const criteria = r.data.criteria.slice(0, RUBRIC_LIMITS.criteria).map((c) => {
    const points = Math.min(RUBRIC_LIMITS.points, Math.max(1, Math.round(c.points) || 1));
    // 단계가 더 많으면(6단계 등) 넘치는 아래 수준은 마지막 칸에 잇는다
    const src = c.levels.length > n ? [...c.levels.slice(0, n - 1), { desc: c.levels.slice(n - 1).map((l) => l.desc.trim()).filter(Boolean).join(" / "), points: c.levels[c.levels.length - 1].points }] : c.levels;
    const levels = defaultLevels(scale, points, src.map((l) => l.desc.trim().slice(0, RUBRIC_LIMITS.desc))).map((l, i) => {
      if (i >= src.length) return { ...l, points: 0 };
      const p = src[i].points;
      return p == null ? l : { ...l, points: Math.min(points, Math.max(0, Math.round(p))) };
    });
    return { id: newCriterionId(), name: c.name.trim().slice(0, RUBRIC_LIMITS.name), points, levels };
  }).filter((c) => c.name);
  if (!criteria.length) return { ok: false, error: "파일에서 루브릭 표를 찾지 못했어요. 직접 적거나 AI 초안을 써 주세요" };
  const codes = r.data.standards.map((s) => s.replace(/[\s[\]]/g, ""));
  const standards = o.known.filter((s) => codes.includes(s.code.replace(/[\s[\]]/g, ""))).map((s) => s.code).slice(0, RUBRIC_LIMITS.standards);
  return { ok: true, data: { scale, criteria, standards } };
}

const GradeOut = z.object({
  reading: z.string(),
  picks: z.array(z.object({ criterion: z.number(), level: z.string(), reason: z.string() })),
  piece: z.string(),
});

const rubricText = (r: Rubric) => r.criteria.map((c, i) =>
  `${i + 1}. ${c.name} (${c.points}점)\n${c.levels.map((l) => `   - ${l.label} (${l.points}점): ${l.desc || "(설명 없음)"}`).join("\n")}`).join("\n");

export type GradeDraft = { reading: string; picks: GradePick[]; piece: string };

/** ② 답안(파일 한 개 또는 쪽마다 옮겨 적은 글) → 기준마다 수준 · 근거, 읽은 것, 조각 글 */
export async function gradeAnswer(o: {
  file?: EvidenceFile; text?: string; rubric: Rubric; subject: string; title: string; description: string; standards: Std[]; people: People;
  /** 교사가 넣은 예시 답안 (N80) — 있으면 학생 답안과 맞춰 본다 */
  modelAnswer?: string;
}): Promise<AiResult<GradeDraft>> {
  const model = (o.modelAnswer ?? "").trim();
  const labels = SCALE_LABELS[o.rubric.scale];
  const system = `첨부한 것은 고등학생이 "${o.subject}" 수행평가 「${o.title}」에 낸 답안이다. 아래 루브릭으로 1차 채점을 한다(교사가 확인 · 수정한다).
<루브릭>
${rubricText(o.rubric)}
</루브릭>
${o.description.trim() ? `수행평가 내용: ${o.description.trim()}\n` : ""}${o.standards.length ? `연결한 성취기준: ${o.standards.map((s) => `${s.code} ${s.text}`).join(" / ")}\n` : ""}
- picks: 기준마다 하나. criterion = 기준 번호(1부터), level = ${labels.join(" · ")} 가운데 하나, reason = 그 수준으로 본 근거 한 문장(80자 안팎, 답안 표현을 짧게 인용해도 됨)
- 답안에 드러난 것만으로 판단한다. 답안에 없으면 낮은 수준으로 보고 reason 에 "답안에서 찾지 못함"이라고 쓴다.
- reading: 답안이 무엇을 주장 · 설명했는지 2~3문장 요약${model ? ". 끝에 예시 답안과 견주어 맞은 점 · 빠진 점을 한 문장으로 덧붙인다" : ""}
- piece: 학교생활기록부 세특 조각으로 쓸 관찰 기록 1~2문장(150자 안팎). 학생이 한 활동 · 생각을 "~함"으로 끝내고, 주어(학생 이름) · 점수 · 수준 · "우수함" 같은 평가 말은 쓰지 않는다.
- 학생 이름 · 학번은 어디에도 쓰지 않는다.`;
  let content: Anthropic.ContentBlockParam[];
  if (o.text != null) content = [{ type: "text", text: `<답안>\n${maskIdentity(o.text, o.people).slice(0, 20000)}\n</답안>` }];
  else if (o.file?.text) content = [{ type: "text", text: `<답안 이름="${maskIdentity(o.file.name, o.people)}">\n${maskIdentity(o.file.text, o.people).slice(0, 20000)}\n</답안>` }];
  else if (o.file) content = [fileBlock(o.file.bytes, o.file.mime)];
  else return { ok: false, error: "답안이 없어요" };
  content.push({ type: "text", text: "이 답안을 루브릭으로 채점해 주세요." });
  const r = await aiJson(GradeOut, { model: "write", system, content, maxTokens: 3000 });
  if (!r.ok) return r;
  const mid = Math.floor(labels.length / 2);
  const picks: GradePick[] = o.rubric.criteria.map((c, i) => {
    const p = r.data.picks.find((x) => x.criterion === i + 1);
    const at = p ? labels.indexOf(p.level.trim()) : -1;
    return { criterionId: c.id, level: at >= 0 ? at : mid, reason: maskIdentity((p?.reason ?? "AI가 판단하지 못함 — 직접 골라 주세요").trim(), o.people).slice(0, GRADE_LIMITS.reason) };
  });
  return {
    ok: true,
    data: {
      picks,
      reading: maskIdentity(r.data.reading.trim(), o.people).slice(0, GRADE_LIMITS.reading),
      piece: maskIdentity(r.data.piece.trim(), o.people).slice(0, GRADE_LIMITS.piece),
    },
  };
}

const TextOut = z.object({ text: z.string() });

/** ③ 큰 PDF는 브라우저가 쪽을 나눠 보낸다 — 쪽 하나에 쓰인 답안 글을 옮겨 적는다 (이어 붙여 ②에 넣음) */
export async function transcribeAnswer(file: EvidenceFile, people: People, what: "답안" | "루브릭" | "예시 답안" = "답안"): Promise<AiResult<string>> {
  if (file.text) return { ok: true, data: maskIdentity(file.text, people).slice(0, 8000) };
  const r = await aiJson(TextOut, {
    model: "fast", maxTokens: 4000,
    system: what === "답안"
      ? "첨부한 것은 고등학생 답안의 일부다. 답안에 쓰인 글을 빠짐없이 그대로 옮겨 적는다(text). 표 · 그림은 [표: 내용 요약]처럼 한 줄로. 학생 이름 · 학번은 옮기지 않는다."
      : what === "예시 답안"
        ? "첨부한 것은 교사가 만든 수행평가 예시 답안(모범 답안 · 정답) 문서의 일부다. 답안 글 · 식 · 계산 과정을 빠짐없이 그대로 옮겨 적는다(text). 식은 한 줄 글로(예: v = s / t), 그림 · 그래프는 [그림: 내용 요약]처럼 한 줄로."
        : "첨부한 것은 수행평가 채점 기준(루브릭) 문서의 일부다. 쓰인 글을 빠짐없이 그대로 옮겨 적는다(text). 표는 줄마다 칸을 \" | \"로 이어 옮긴다.",
    content: [fileBlock(file.bytes, file.mime), { type: "text", text: `이 쪽의 ${what} 글을 옮겨 적어 주세요.` }],
  });
  return r.ok ? { ok: true, data: maskIdentity(r.data.text, people).slice(0, 8000) } : r;
}
