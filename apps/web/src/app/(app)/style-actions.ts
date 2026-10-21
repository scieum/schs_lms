"use server";
import { cleanStyle, isStyleArea, type WritingStyle } from "@/lib/domain/writing-style";
import { identityProblem } from "@/lib/server/identity-check";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

// 내 스타일 (Figma N58): 글 짓기 글 칸 [고치기 ›] 창이 읽고 저장한다. 교사 본인 것만.

export async function getMyStyle(area: string): Promise<WritingStyle | null> {
  const v = await requireCan("record.write");
  if (!isStyleArea(area)) return null;
  return repo.getWritingStyle(v.accountId, area);
}

export async function saveMyStyle(input: { area: string; prompt: string; refs: string[] }): Promise<{ ok: true; style: WritingStyle } | { ok: false; error: string }> {
  const v = await requireCan("record.write");
  if (!isStyleArea(input.area)) return { ok: false, error: "영역을 골라 주세요" };
  const c = cleanStyle({ prompt: String(input.prompt ?? ""), refs: Array.isArray(input.refs) ? input.refs.map(String) : [] });
  if ("error" in c) return { ok: false, error: c.error };
  const bad = await identityProblem([c.prompt, ...c.refs].join("\n"));
  if (bad) return { ok: false, error: bad };
  try {
    await repo.saveWritingStyle(v.accountId, input.area, c);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
  await repo.audit(v.accountId, "style.save", `${input.area} 프롬프트 ${c.prompt.length}자 · 레퍼런스 ${c.refs.length}`);
  return { ok: true, style: await repo.getWritingStyle(v.accountId, input.area) };
}
