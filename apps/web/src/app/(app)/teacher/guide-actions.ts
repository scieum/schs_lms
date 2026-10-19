"use server";
import { z } from "zod";
import { guideEntry, scrubQuestion, type GuideSentence } from "@/lib/domain/guide-bank";
import { guideAnswer } from "@/lib/server/ai/guide-answer";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";

// 기재요령 찾아보기 (Figma N43 ①): 규칙 검색은 브라우저에서(인용 모음 JSON), AI 정리만 서버에서.
// 후보 id 는 인용 모음에 있는 것만 받는다. 질문에 학교 학생 이름 · 학번이 있으면 가려서 보낸다.

const Schema = z.object({ q: z.string().min(1).max(200), ids: z.array(z.string().max(60)).min(1).max(4) });

export async function askGuideAi(input: z.input<typeof Schema>): Promise<{ sentences: GuideSentence[] } | null> {
  const v = await requireViewer();
  if (v.kind !== "teacher") return null;
  const p = Schema.safeParse(input);
  if (!p.success) return null;
  const list = p.data.ids.map((id) => guideEntry(id)).filter((e) => !!e);
  if (list.length < 2) return null;
  const names = (await repo.listStudents()).map((s) => s.name);
  const r = await guideAnswer(scrubQuestion(p.data.q, names), list);
  if (!r.ok) return null;
  if (!r.cached) await repo.audit(v.accountId, "guide.ai", `기재요령 정리 · 원문 ${list.length}개 · 문장 ${r.sentences.length}개`);
  return { sentences: r.sentences };
}
