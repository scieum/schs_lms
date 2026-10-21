"use server";
import { z } from "zod";
import { parseItems, parseTerm, reportAiLines } from "@/lib/domain/report";
import { semesterOf } from "@/lib/domain/writing";
import { aiJson } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { loadReports, reportScopes } from "@/lib/server/report";
import { requireCan } from "@/lib/server/viewer";

const Schema = z.object({
  strength: z.string().describe("기록에서 보이는 강점 한 줄 (40자 안, ~함 체)"),
  growth: z.string().describe("이번 기간에 자란 점 한 줄 (40자 안, ~함 체)"),
  next: z.string().describe("다음에 해 보면 좋을 것 한 줄 (40자 안, ~하기 체)"),
});

export type ReportAi = { ok: true; strength: string; growth: string; next: string } | { ok: false; error: string };

/** AI 한눈에 보기 (N55): 그 학생 리포트에 든 기록만 → 강점 · 자란 점 · 다음에. 가명ID만 보내고 저장하지 않는다 (C2) */
export async function reportAiAction(input: { scope: string; term: string; items: string; studentId: string }): Promise<ReportAi> {
  const v = await requireCan("record.write");
  const scope = (await reportScopes(v)).find((s) => s.key === input.scope);
  if (!scope) return { ok: false, error: "볼 수 있는 범위가 아니에요" };
  const reports = await loadReports(v, scope, parseTerm(input.term, semesterOf()));
  const r = reports?.find((x) => x.id === input.studentId);
  const student = r ? await repo.getStudent(r.id) : null;
  if (!r || !student) return { ok: false, error: "이 범위의 학생이 아니에요" };
  const lines = reportAiLines(r, parseItems(input.items, scope.kind));
  if (!lines.length) return { ok: false, error: "정리할 기록이 아직 없어요" };
  const res = await aiJson(Schema, {
    model: "fast",
    system: "고등학교 교사가 학생에게 건넬 리포트의 '한눈에 보기'를 쓴다. 주어진 기록에 있는 사실만 쓰고, 없는 활동 · 수치 · 수상은 만들지 않는다. 이름 · 학번은 쓰지 않는다. 짧고 따뜻하게.",
    content: `학생: ${student.pseudonymId}\n기록:\n${lines.join("\n").slice(0, 6000)}`,
  });
  await repo.audit(v.accountId, "report.ai", `${student.pseudonymId} ${scope.kind}`);
  if (!res.ok) return res;
  return { ok: true, ...res.data };
}
