import "server-only";
import { repo } from "./repo";

/** 여러 교사가 보거나 AI에 보내는 글(생기부 팁 · 내 스타일 레퍼런스)에 학생 이름 · 학번이 있으면 문구, 없으면 null */
export async function identityProblem(text: string): Promise<string | null> {
  if (/(^|[^\d])[1-3]\d{4}([^\d]|$)/.test(text)) return "학번처럼 보이는 숫자가 있어요. 빼고 넣어 주세요";
  const names = (await repo.listStudents({ external: true })).map((s) => s.name.trim()).filter((n) => n.length >= 2);
  const hit = names.find((n) => text.includes(n));
  return hit ? `학생 이름(${hit})이 들어 있어요. '학생A'처럼 바꿔 주세요` : null;
}
