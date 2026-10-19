"use server";
import { z } from "zod";
import { can } from "@/lib/domain/policy";
import { spellCheck, placeAiFixes, type SpellHit } from "@/lib/domain/spelling";
import { scrubIdentity } from "@/lib/domain/writing";
import { spellCheckAi } from "@/lib/server/ai/teacher-ai";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";

// 맞춤법 AI 검사 (Figma N38 (e)): 세특 · 기록 쓰기 · 초안 검토 공용. 저장하지 않는다 (화면 상태 — 본문이 바뀌면 화면이 지운다).
// AI에는 이름·학번을 가명ID로 바꾼 글만 보낸다. 돌아온 고칠 말은 원래 본문에 그대로 있는 것만 행으로.

const Input = z.object({ kind: z.enum(["setuk", "record", "draft"]), studentId: z.string().min(1), text: z.string().min(1, "본문이 비어 있어요").max(6000) });
const ACTION = { setuk: "setuk.write", record: "record.write", draft: "draft.review" } as const;

export async function checkSpellingAi(input: z.input<typeof Input>): Promise<{ ok: true; hits: SpellHit[] } | { ok: false; error: string }> {
  const p = Input.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const v = await requireViewer();
  if (!can(v, ACTION[p.data.kind])) return { ok: false, error: "권한이 없어요" };
  const student = await repo.getStudent(p.data.studentId);
  if (!student) return { ok: false, error: "학생을 찾지 못했어요" };
  const text = p.data.text;
  const masked = scrubIdentity(text, student, student.pseudonymId).text;
  const r = await spellCheckAi(masked);
  if (!r.ok) return r;
  // 가명ID 자리를 건드리지 않고, 원래 본문에 그대로 있는 말만 (규칙 사전 행과 겹치면 뺀다)
  const hits = placeAiFixes(text, r.fixes, spellCheck(text));
  await repo.audit(v.accountId, "spell.ai", `${p.data.kind} hits=${hits.length}`);
  return { ok: true, hits };
}
