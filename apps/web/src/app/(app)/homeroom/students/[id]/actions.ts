"use server";
import { scoresEnabled } from "@/lib/server/features";
import { z } from "zod";
import { canViewStudentRecord } from "@/lib/domain/counsel";
import { peakAbsenceDay } from "@/lib/domain/homeroom";
import { addDays, DAY_LABEL, seoulNow, weekday } from "@/lib/domain/night";
import { trendSummary } from "@/lib/domain/scores";
import { aiJson } from "@/lib/server/ai/claude";
import { nightLine, scoreTrendLine } from "@/lib/server/ai/homeroom-ai";
import { loadCounsel, loadStudentLogs, loadStudentSetuk } from "@/lib/server/counsel";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

const FlowSchema = z.object({
  keywords: z.array(z.string()).describe("기록에서 보이는 진로 키워드 흐름 2~5개, 시간 순"),
  gaps: z.array(z.string()).describe("보완하면 좋을 점 1~3개"),
  duplicates: z.array(z.string()).describe("여러 기록에 겹치는 소재. 없으면 빈 배열"),
});

export type FlowResult = { ok: true; summary: string; topics: string[] } | { ok: false; error: string };

/** AI 기록 흐름 요약 (H2): 세특·누가기록·상담 → 진로 키워드·보완점·중복. 가명ID만 보낸다. 저장하지 않는다 */
export async function summarizeFlow(studentId: string): Promise<FlowResult> {
  const v = await requireCan("homeroom.view");
  const student = await repo.getStudent(studentId);
  if (!student || !canViewStudentRecord(v, student)) return { ok: false, error: "우리 반 학생만 볼 수 있어요" };
  const [setuk, logs, counsel, past] = await Promise.all([
    loadStudentSetuk(student), loadStudentLogs(student.id), loadCounsel(v, [student]), repo.listPastRecords([student.id]),
  ]);
  const lines = [
    ...past.map((r) => `[${r.year} ${r.area}] ${r.title}: ${r.content}`),
    ...setuk.map(({ record, course }) => `[올해 교과세특 ${course.subject}] ${record.content}`),
    ...logs.map((l) => `[올해 ${l.area} ${l.date}] ${l.content}`),
    ...counsel.map((r) => `[상담 ${r.date} ${r.area}] ${r.content}`),
  ];
  if (!lines.length) return { ok: false, error: "요약할 기록이 없어요" };
  const r = await aiJson(FlowSchema, {
    model: "fast",
    system: "고등학교 담임이 학생의 1·2학년 기록 흐름을 빠르게 파악하도록 돕는다. 진로 키워드가 어떻게 이어지는지, 보완점, 겹치는 소재를 짧게 정리한다.",
    content: `학생: ${student.pseudonymId}\n희망 진로: ${student.careerGoal ?? "미정"}\n기록:\n${lines.join("\n")}`,
  });
  await repo.audit(v.accountId, "record.ai_flow", student.pseudonymId);
  if (!r.ok) return r;
  const { keywords, gaps, duplicates } = r.data;
  return {
    ok: true,
    summary: `진로 키워드: ${keywords.join(" → ")}${duplicates.length ? ` · 겹침: ${duplicates.join(", ")}` : ""}`,
    topics: gaps.slice(0, 3),
  };
}

export type InsightResult = { ok: true; line: string; source: "AI" | "자동"; error?: string } | { ok: false; error: string };

/** 탭별 한 줄 해석 (H2): 성적 탭 = 모의고사 추이, 야자 탭 = 4주 출결. 가명ID·등급·출결만 보낸다. 저장하지 않는다 */
export async function tabInsight(studentId: string, tab: "scores" | "night"): Promise<InsightResult> {
  if (tab === "scores" && !scoresEnabled()) return { ok: false, error: "잠긴 기능이에요" } as InsightResult;
  const v = await requireCan("homeroom.view");
  const student = await repo.getStudent(studentId);
  if (!student || !canViewStudentRecord(v, student)) return { ok: false, error: "우리 반 학생만 볼 수 있어요" };
  if (tab === "scores") {
    const [summary, exams, scores] = await Promise.all([repo.scoresStudentSummary(student.id), repo.listExams(), repo.listMockScores([student.id])]);
    const rule = trendSummary(exams, scores).text;
    const r = await scoreTrendLine(student.pseudonymId, { trend: summary.trend, latest: summary.latestGrades, targets: summary.targets }, rule);
    if (r.label === "AI") await repo.audit(v.accountId, "homeroom.ai.scores_trend", student.pseudonymId);
    return { ok: true, line: r.line, source: r.label, error: r.error };
  }
  const today = seoulNow().date;
  const att = (await repo.listNightAttendance(addDays(today, -27), today, [student.id])).sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);
  const bad = att.filter((a) => a.status !== "출석");
  const peak = peakAbsenceDay(bad);
  const rule = att.length
    ? `4주 출석 ${att.length - bad.length}회 · 결석·조퇴 ${bad.length}회${peak !== null ? ` (${DAY_LABEL[peak]}요일에 몰림)` : ""}`
    : "최근 4주 야자 기록이 없어요";
  const r = await nightLine(student.pseudonymId, att.map((a) => `${a.date.slice(5)}(${DAY_LABEL[weekday(a.date)]}) ${a.period}교시 ${a.status}`), rule);
  if (r.label === "AI") await repo.audit(v.accountId, "homeroom.ai.night_line", student.pseudonymId);
  return { ok: true, line: r.line, source: r.label, error: r.error };
}
