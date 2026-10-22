import "server-only";
import { z } from "zod";
import type { QnaPost } from "@/lib/domain/qna";
import { aiEnabled, aiJson } from "./claude";

// 문의 게시판 AI 답 초안 (2026-10-22): 사용 가이드(매뉴얼) 글 + 지난 문답만 보고 답 초안을 쓴다. Sonnet(write).
// 초안은 관리자만 보고(답 칸에 미리 채움) 관리자가 고쳐 저장해야 게시된다. 보내는 것 = 문의 글(이름 · 학번 검사 통과) · 매뉴얼 · 지난 문답.

const Schema = z.object({ answer: z.string(), sure: z.boolean() });

const SYSTEM = `너는 "속초고 쌤기부"(고등학교 생활기록부 작성 도우미 웹앱) 교육과정부 담당자를 대신해 선생님 문의에 답 초안을 쓴다.
- 아래 <사용 가이드> 와 <지난 문답> 에 있는 내용으로만 답한다. 없는 메뉴 · 버튼 · 기능을 지어내지 마라.
- 해요체, 첫 줄에 결론 한 문장. 그다음 "· " 로 시작하는 줄 2~5개로 어디서 무엇을 누르는지 적는다. 줄 사이에 빈 줄은 결론 다음 한 번만.
- 메뉴 이름은 화면에 보이는 그대로(예: 조각 모으기, 글 짓기, 도구 › 프롬프트 보관함).
- 가이드로 답할 수 없으면 answer 에 "확인하고 답드릴게요." 와 확인할 점 한 줄을 쓰고 sure=false.
- 학생 이름 · 학번 · 개인정보는 쓰지 않는다.`;

/** 매뉴얼 HTML → 글 (태그 · 스크립트 · 스타일 뺌) */
export function manualText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(br|\/p|\/li|\/h\d|\/tr|\/section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n+/g, "\n").trim();
}

export async function draftQnaAnswer(q: Pick<QnaPost, "category" | "title" | "question">, manual: string, past: QnaPost[]): Promise<{ answer: string; sure: boolean } | null> {
  if (!aiEnabled() || !manual) return null;
  const history = past.filter((p) => p.answer).slice(0, 20).map((p) => `Q. ${p.title}\n${p.question}\nA. ${p.answer}`).join("\n\n");
  const r = await aiJson(Schema, {
    model: "write",
    // 매뉴얼 · 지난 문답은 시스템에 두어 캐시된다 (문의가 이어지면 두 번째부터 싸다)
    system: `${SYSTEM}\n\n<사용 가이드>\n${manual.slice(0, 40000)}\n</사용 가이드>\n\n<지난 문답>\n${history || "(없음)"}\n</지난 문답>`,
    content: `분류: ${q.category}\n제목: ${q.title}\n질문:\n${q.question}`,
    maxTokens: 1500,
  });
  return r.ok && r.data.answer.trim() ? { answer: r.data.answer.trim().slice(0, 4000), sure: r.data.sure } : null;
}
