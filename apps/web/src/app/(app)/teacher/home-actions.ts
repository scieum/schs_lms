"use server";
import type { BriefingLine } from "@/lib/domain/teacher-assist";
import { todayBriefing } from "@/lib/server/ai/teacher-ai";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";
import { loadBriefingInput } from "./briefing-data";

export type BriefingResult = { lines: BriefingLine[]; label: "AI" | "자동"; error?: string };

/** T1 오늘 브리핑: 버튼을 눌렀을 때만. 저장하지 않는다 */
export async function makeBriefing(): Promise<BriefingResult> {
  const v = await requireViewer();
  if (v.kind !== "teacher" || v.mustChangePassword) return { lines: [], label: "자동", error: "교사만 볼 수 있어요" };
  const r = await todayBriefing(await loadBriefingInput(v));
  if (r.label === "AI") await repo.audit(v.accountId, "home.ai.briefing", null);
  return { lines: r.data, label: r.label, error: r.error };
}
