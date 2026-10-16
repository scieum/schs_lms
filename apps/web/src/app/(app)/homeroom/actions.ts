"use server";
import { briefSignals, pickBriefing } from "@/lib/domain/homeroom";
import { homeroomStudents } from "@/lib/domain/activity";
import { briefClass } from "@/lib/server/ai/homeroom-ai";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { briefingInputs } from "./briefing-data";

export type BriefItem = { studentId: string; reason: string; tags: string[] };
export type BriefResult = { ok: true; line: string; items: BriefItem[]; source: "AI" | "자동"; error?: string } | { ok: false; error: string };

/** 우리 반 브리핑 (H1): 규칙으로 후보 6명 → AI 가 3명과 이유를 고른다. 가명ID·신호만 보낸다. 저장하지 않는다 */
export async function classBriefing(): Promise<BriefResult> {
  const v = await requireCan("homeroom.view");
  const mine = homeroomStudents(v, await repo.listStudents());
  if (!mine.length) return { ok: false, error: "담임 반 학생이 없어요" };
  const { inputs, picks, line } = await briefingInputs(mine);
  const pidOf = new Map(mine.map((s) => [s.id, s.pseudonymId]));
  const idOf = new Map(mine.map((s) => [s.pseudonymId, s.id]));
  const tagsOf = new Map(inputs.map((x) => [x.studentId, briefSignals(x).map((g) => g.kind)]));
  const cands = pickBriefing(inputs, 6).map((p) => ({ pid: pidOf.get(p.studentId)!, signals: p.signals.map((g) => g.text) }));
  const fallback = { line, picks: picks.map((p) => ({ pid: pidOf.get(p.studentId)!, reason: p.signals.map((g) => g.text).slice(0, 2).join(" · ") })) };
  const r = await briefClass(cands, fallback);
  if (r.label === "AI") await repo.audit(v.accountId, "homeroom.ai.briefing", r.picks.map((p) => p.pid).join(","));
  const items = r.picks
    .filter((p) => idOf.has(p.pid))
    .map((p) => {
      const id = idOf.get(p.pid)!;
      return { studentId: id, reason: p.reason, tags: [...new Set(tagsOf.get(id) ?? [])] };
    });
  return { ok: true, line: r.line, items, source: r.label, error: r.error };
}
