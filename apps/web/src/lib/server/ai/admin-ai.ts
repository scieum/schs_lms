import "server-only";
import { z } from "zod";
import { dailyCheck, type DailyCheckInput, type DailyCheckItem } from "@/lib/domain/accounts";
import type { DemandForecast } from "@/lib/domain/offering";
import { aiEnabled, aiJson, fileBlock, type AiResult } from "./claude";

// 관리자 화면의 버튼형 AI (docs/ai-features.md A1·A2·A5·A6·편제표).
// 결과는 화면에서 관리자가 확인한 뒤에만 반영한다. 학생 정보는 가명ID만 (교사 이름·과목 이름은 학생 정보가 아니다).
// 키가 없거나 실패하면 규칙 결과를 "자동" 라벨로 돌려준다.

export type Label = "AI" | "자동";

/** A1 오늘 점검: 오류·계정 대기·이상 접근·정원 초과 → 요약 한 줄 + 순서 */
export async function dailyBrief(x: DailyCheckInput & { errorReasons: string[] }): Promise<{ line: string; items: DailyCheckItem[]; label: Label; error?: string }> {
  const items = dailyCheck(x);
  const rule = items.length ? `${items.length}가지 — ${items[0].text}` : "오늘 처리할 것이 없어요";
  if (!aiEnabled() || !items.length) return { line: rule, items, label: "자동" };
  const r = await aiJson(z.object({ line: z.string(), order: z.array(z.string()) }), {
    model: "fast",
    system: `학교 학생관리시스템 관리자(교사)의 오늘 점검을 정리한다. 항목마다 원인과 조치를 생각해 급한 순서를 정한다.
line 은 관리자에게 보여 줄 한 줄 요약(60자 이내, 해요체, 가장 먼저 할 일과 이유). order 는 항목 key 를 급한 순서로.`,
    content: [
      ...items.map((it) => `- key=${it.key}: ${it.text}`),
      x.errorReasons.length ? `초안 실패 원인(가명ID만): ${x.errorReasons.slice(0, 10).join(" / ")}` : "",
    ].filter(Boolean).join("\n"),
  });
  if (!r.ok) return { line: rule, items, label: "자동", error: r.error };
  const ordered = [...new Set(r.data.order)].map((k) => items.find((i) => i.key === k)).filter((i): i is DailyCheckItem => !!i);
  return { line: r.data.line.slice(0, 90), items: [...ordered, ...items.filter((i) => !ordered.includes(i))], label: "AI" };
}

/** A2 교사 명부 열 해석: 붙여넣은 표 → 이름·부서·담임 반 (교사 이름은 학생 정보가 아니라 보내도 된다) */
export async function readRoster(text: string): Promise<AiResult<{ line: number; name: string; dept: string | null; grade: number | null; classNo: number | null }[]>> {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").slice(0, 120);
  const r = await aiJson(
    z.object({ rows: z.array(z.object({ line: z.number().int(), name: z.string(), dept: z.string().nullable(), grade: z.number().int().nullable(), classNo: z.number().int().nullable() })) }),
    {
      model: "fast",
      maxTokens: 6000,
      system: `붙여넣은 글은 고등학교 교사 명부(엑셀·한글 표를 복사한 것)다. 줄마다 교사 한 명이다. 열 순서·머리글은 학교마다 다르다.
- line: 줄 번호(아래에 붙인 번호 그대로), name: 교사 이름, dept: 부서 또는 교과(없으면 null)
- grade·classNo: 담임 반의 학년(1~3)·반. 담임이 아니면 둘 다 null
- 머리글 줄·빈 줄·합계 줄은 빼고, 이름이 없는 줄도 뺀다`,
      content: lines.map((l, i) => `${i + 1}: ${l}`).join("\n"),
    },
  );
  return r.ok ? { ok: true, data: r.data.rows } : r;
}

/** A5 이상 접근 설명: 규칙이 고른 기록 → 사람이 읽을 문장. 행위자는 별칭(사람1…)으로 보내고 돌려받은 뒤 바꾼다 */
export async function explainFlags(rows: { actor: string; label: string; target: string | null; at: string; flag: string }[]): Promise<{ lines: string[]; label: Label; error?: string }> {
  const alias = new Map<string, string>();
  for (const r of rows) if (!alias.has(r.actor)) alias.set(r.actor, `사람${alias.size + 1}`);
  const byFlag = new Map<string, number>();
  for (const r of rows) byFlag.set(r.flag, (byFlag.get(r.flag) ?? 0) + 1);
  const top = [...alias.keys()].map((a) => ({ a, n: rows.filter((r) => r.actor === a).length })).sort((x, y) => y.n - x.n)[0];
  const rule = [
    [...byFlag.entries()].map(([f, n]) => `${f} ${n}건`).join(" · "),
    top ? `가장 많은 사람: ${top.a} (${top.n}건)` : "",
  ].filter(Boolean);
  if (!aiEnabled() || !rows.length) return { lines: rule, label: "자동" };
  const r = await aiJson(z.object({ lines: z.array(z.string()) }), {
    model: "fast",
    system: `학교 학생관리시스템 감사 로그에서 규칙이 '평소와 다르다'고 표시한 기록이다(대량 열람: 한 번에 30건 이상 또는 10분 안에 30번, 야간 열람: 22시~6시).
관리자가 읽을 설명 2~3문장(각 60자 이내, 해요체)을 쓴다: 누가(사람N) 언제 무엇을 했는지 묶고, 업무상 그럴 만한 경우와 확인할 점을 짧게. 단정하지 않는다.`,
    content: rows.slice(0, 60).map((x) => `${x.at} ${alias.get(x.actor)} ${x.label}${x.target ? ` (${x.target})` : ""} [${x.flag}]`).join("\n"),
  });
  if (!r.ok) return { lines: rule, label: "자동", error: r.error };
  // 사람10 을 사람1 보다 먼저 바꾼다
  const pairs = [...alias.entries()].sort((a, b) => b[1].length - a[1].length);
  const back = (s: string) => pairs.reduce((t, [name, a]) => t.replaceAll(a, name), s);
  return { lines: r.data.lines.slice(0, 3).map((l) => back(l.slice(0, 100))), label: "AI" };
}

/** A6 신청 예측 설명: 지금 신청 수·어림 마감 신청 수 → 반 증설 제안 문장 */
export async function explainDemand(args: { grade: number; daysLeft: number; rate: number; forecast: DemandForecast[] }): Promise<{ line: string; label: Label; error?: string }> {
  const { forecast } = args;
  const rule = forecast.length
    ? `마감 때 ${forecast.slice(0, 2).map((f) => `${f.offering.subject} 약 ${f.projected}명(정원 ${f.seats})`).join(", ")} 예상 — 반을 늘릴지 검토해요`
    : "지금 비율로는 정원을 넘을 과목이 없어요";
  if (!aiEnabled() || !forecast.length) return { line: rule, label: "자동" };
  const r = await aiJson(z.object({ line: z.string() }), {
    model: "fast",
    system: "고등학교 선택 과목 신청 현황으로 마감 때 정원 초과를 예측해 관리자에게 한 줄(70자 이내, 해요체)로 설명한다. 과목·예상 인원·필요한 반 수를 넣는다. 숫자를 바꾸지 않는다.",
    content: `${args.grade}학년, 마감까지 ${args.daysLeft}일, 신청률 ${args.rate}%\n${forecast.map((f) => `${f.offering.subject}: 지금 ${f.count}명, 어림 ${f.projected}명, 정원 ${f.seats}(한 반 ${f.offering.capacity}명 × ${f.offering.sections}반)`).join("\n")}`,
  });
  return r.ok ? { line: r.data.line.slice(0, 100), label: "AI" } : { line: rule, label: "자동", error: r.error };
}

/** 편제표 이미지·PDF → 과목 목록 (학교 문서라 학생 정보가 없다) */
export async function readCurriculum(bytes: Uint8Array, mime: string): Promise<AiResult<{ grade: number; semester: number; subject: string; credits: number; group: string | null }[]>> {
  const r = await aiJson(
    z.object({ rows: z.array(z.object({ grade: z.number().int(), semester: z.number().int(), subject: z.string(), credits: z.number().int(), group: z.string().nullable() })) }),
    {
      model: "fast",
      maxTokens: 8000,
      system: `첨부한 문서는 고등학교 교육과정 편제표다. 학년·학기별로 개설한 과목을 모두 뽑는다.
- grade: 학년(1~3), semester: 학기(1~2), subject: 과목 이름(표에 적힌 그대로), credits: 그 학기 학점(단위 수)
- group: 교과(군) — 국어, 수학, 영어, 사회, 과학, 체육, 예술, 기술·가정/정보, 제2외국어/한문, 교양 중 하나. 모르면 null
- 한 칸에 1·2학기가 합쳐 있으면(예: 학년 합계만) 학기별로 나눌 수 있을 때만 나누고, 나눌 수 없으면 뺀다
- 창의적 체험활동·합계·이수 단위 소계 줄은 뺀다`,
      content: [fileBlock(bytes, mime), { type: "text", text: "편제표의 과목 목록을 뽑아 주세요." }],
    },
  );
  return r.ok ? { ok: true, data: r.data.rows } : r;
}
