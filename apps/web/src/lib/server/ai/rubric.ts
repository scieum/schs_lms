import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { maskIdentity } from "@/lib/domain/program";
import { GRADE_LIMITS, RUBRIC_LIMITS, SCALE_LABELS, defaultLevels, newCriterionId, type GradePick, type Rubric, type RubricScale } from "@/lib/domain/rubric";
import { aiJson, fileBlock, type AiResult } from "./claude";
import type { EvidenceFile } from "./read-evidence";

// 루브릭 채점 (Figma N72): ① 성취기준으로 루브릭 만들기 ② 학생 답안을 읽고 기준마다 수준 제안 ③ 큰 PDF 쪽 하나를 글로 옮기기.
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
}): Promise<AiResult<GradeDraft>> {
  const labels = SCALE_LABELS[o.rubric.scale];
  const system = `첨부한 것은 고등학생이 "${o.subject}" 수행평가 「${o.title}」에 낸 답안이다. 아래 루브릭으로 1차 채점을 한다(교사가 확인 · 수정한다).
<루브릭>
${rubricText(o.rubric)}
</루브릭>
${o.description.trim() ? `수행평가 내용: ${o.description.trim()}\n` : ""}${o.standards.length ? `연결한 성취기준: ${o.standards.map((s) => `${s.code} ${s.text}`).join(" / ")}\n` : ""}
- picks: 기준마다 하나. criterion = 기준 번호(1부터), level = ${labels.join(" · ")} 가운데 하나, reason = 그 수준으로 본 근거 한 문장(80자 안팎, 답안 표현을 짧게 인용해도 됨)
- 답안에 드러난 것만으로 판단한다. 답안에 없으면 낮은 수준으로 보고 reason 에 "답안에서 찾지 못함"이라고 쓴다.
- reading: 답안이 무엇을 주장 · 설명했는지 2~3문장 요약
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
export async function transcribeAnswer(file: EvidenceFile, people: People): Promise<AiResult<string>> {
  if (file.text) return { ok: true, data: maskIdentity(file.text, people).slice(0, 8000) };
  const r = await aiJson(TextOut, {
    model: "fast", maxTokens: 4000,
    system: "첨부한 것은 고등학생 답안의 일부다. 답안에 쓰인 글을 빠짐없이 그대로 옮겨 적는다(text). 표 · 그림은 [표: 내용 요약]처럼 한 줄로. 학생 이름 · 학번은 옮기지 않는다.",
    content: [fileBlock(file.bytes, file.mime), { type: "text", text: "이 쪽의 답안 글을 옮겨 적어 주세요." }],
  });
  return r.ok ? { ok: true, data: maskIdentity(r.data.text, people).slice(0, 8000) } : r;
}
