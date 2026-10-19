import "server-only";
import { z } from "zod";
import { SUBJECT_GROUPS, type Course, type SubjectGroup } from "@/lib/domain/curriculum";
import {
  briefingRule, cleanCourseSuggestion, counselQuestionsRule, parseStudentQuery, polishLogRule, suggestCoursesRule,
  type BriefingInput, type BriefingLine, type CourseSuggestion, type StudentFilter,
} from "@/lib/domain/teacher-assist";
import { aiEnabled, aiJson } from "./claude";

// 교사 화면의 버튼형 AI (docs/ai-features.md §3). 모두 결과만 돌려주고, 반영은 화면에서 교사가 누른다.
// 학생은 가명ID만 보낸다. 이름이 섞일 수 있는 글은 부르는 쪽에서 가린 뒤 넘긴다.
// 키가 없거나 실패하면 규칙 결과를 label "자동" 으로 돌려준다.

export type Assisted<T> = { data: T; label: "AI" | "자동"; error?: string };

/** T1 오늘 브리핑: 숫자·프로그램 제목만 보낸다 (학생 정보 없음) */
export async function todayBriefing(b: BriefingInput): Promise<Assisted<BriefingLine[]>> {
  const rule = briefingRule(b);
  if (!aiEnabled() || !rule.length) return { data: rule, label: "자동" };
  const r = await aiJson(z.object({ lines: z.array(z.object({ text: z.string(), ref: z.number().int() })) }), {
    model: "fast",
    system: `너는 고등학교 교사의 업무 비서다. 아래 할 일 후보를 보고 오늘 먼저 할 일 3개를 우선순위대로 고른다.
- 마감이 가깝고 학생에게 영향이 큰 일을 먼저 둔다
- text: 40자 이내, "~해요" 체, 숫자를 살린다
- ref: 고른 후보 번호(0부터)`,
    content:
      rule.map((l, i) => `${i}. ${l.text}`).join("\n") +
      `\n\n참고: 생성 실패 ${b.failed}건, 검토 대기 ${b.waiting}건, 마감 임박 설문 ${b.dueSoon.length}개, 상담 기록 없는 학생 ${b.noCounsel}명`,
  });
  if (!r.ok) return { data: rule, label: "자동", error: r.error };
  // 후보 번호로만 링크를 붙인다 (AI가 만든 주소는 쓰지 않는다)
  const seen = new Set<number>();
  const lines: BriefingLine[] = [];
  for (const l of r.data.lines) {
    if (!rule[l.ref] || seen.has(l.ref) || !l.text.trim()) continue;
    seen.add(l.ref);
    lines.push({ text: l.text.trim().slice(0, 80), href: rule[l.ref].href });
  }
  return lines.length ? { data: lines.slice(0, 3), label: "AI" } : { data: rule, label: "자동" };
}

/** 누가기록 다듬기: 이미 가린 메모 → 누가기록 문체 1~2문장 */
export async function polishLog(masked: string, area: string): Promise<Assisted<string>> {
  const rule = polishLogRule(masked);
  if (!aiEnabled()) return { data: rule, label: "자동" };
  const r = await aiJson(z.object({ text: z.string() }), {
    model: "fast",
    system: `너는 고등학교 교사의 누가기록(${area}) 정리 도우미다. 교사의 짧은 메모나 음성 받아쓰기를 누가기록 문장으로 다듬는다.
- 1~2문장, 200자 이내. 종결은 "~함." "~임." 같은 명사형
- 메모에 있는 사실만 쓴다. 평가·칭찬·추측을 보태지 않는다
- 군말("어", "음", "그러니까")·반복은 지운다
- 여러 학생에게 같이 들어가는 기록이므로 특정 학생 이름이나 "○○" 같은 자리를 만들지 않는다`,
    content: `메모:\n${masked}`,
  });
  if (!r.ok) return { data: rule, label: "자동", error: r.error };
  const t = r.data.text.replace(/\s+/g, " ").trim();
  return t ? { data: t.slice(0, 1000), label: "AI" } : { data: rule, label: "자동" };
}

/**
 * 순화하기 (Figma N34 ③): 이미 가린 메모 → 생기부에 쓸 수 있는 말투 1~2문장 (Haiku).
 * AI가 꺼져 있으면 순화하지 않는다 (화면은 순화 버튼을 숨긴다).
 */
export async function softenMemo(masked: string, area: string): Promise<Assisted<string> | null> {
  if (!aiEnabled()) return null;
  const r = await aiJson(z.object({ text: z.string() }), {
    model: "fast",
    system: `너는 고등학교 교사의 ${area} 기록 도우미다. 교사의 퉁명스러운 관찰 메모를 학교생활기록부에 쓸 수 있는 말투로 바꾼다.
- 적힌 사실은 그대로 둔다. 평가·비난하는 말(졸다, 안 냄, 떠듦, 산만 등)만 관찰한 사실을 담담히 적는 문장으로 바꾼다
- 없는 노력·변화·원인·다짐을 지어내지 않는다. 칭찬을 보태지 않는다
- 1~2문장, 200자 이내. 종결은 "~함." "~임." "~있음." 같은 명사형
- 학생 이름이나 "○○" 같은 자리를 만들지 않는다`,
    content: `메모:\n${masked}`,
  });
  if (!r.ok) return { data: "", label: "AI", error: r.error };
  const t = r.data.text.replace(/\s+/g, " ").trim().slice(0, 300);
  return { data: t, label: "AI" };
}

/**
 * 누가기록 한꺼번에 쓰기 (N28) 카드별 "다듬기": 학생 한 명의 글(이미 가림, [활동명] 뗌)을 자연스럽게 잇는다.
 * 사실을 빼거나 보태지 않고 문장만 다듬는다. 키가 없으면 공백·겹친 문장만 정리한다.
 */
export async function polishStudentLog(masked: string, area: string): Promise<Assisted<string>> {
  const parts: string[] = [];
  for (const s of masked.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)) if (s && !parts.includes(s)) parts.push(s);
  const rule = parts.join(" ");
  if (!aiEnabled() || !rule) return { data: rule, label: "자동" };
  const r = await aiJson(z.object({ text: z.string() }), {
    model: "fast",
    system: `너는 고등학교 교사의 누가기록(${area}) 정리 도우미다. 학생 한 명의 누가기록 초안을 자연스럽게 다듬는다.
- 초안에 있는 사실은 모두 살리고, 없는 사실·평가·칭찬·추측을 보태지 않는다
- 원래 낱말을 최대한 살리고 꾸밈말("직접", "매우" 등)을 새로 넣지 않는다
- 겹치거나 어색하게 이어진 문장을 매끄럽게 잇는다. 2~4문장, 원래 길이와 비슷하게
- 종결은 "~함." "~임." 같은 명사형
- 학생 이름이나 "○○" 같은 자리를 만들지 않는다. 대괄호 머리말을 붙이지 않는다`,
    content: `초안:\n${rule}`,
  });
  if (!r.ok) return { data: rule, label: "자동", error: r.error };
  const t = r.data.text.replace(/\s+/g, " ").trim().replace(/^\[[^\]]*\]\s*/, "");
  return t ? { data: t.slice(0, 1000), label: "AI" } : { data: rule, label: "자동" };
}

/** 상담: 다음에 물어볼 질문 3개. 기록은 가린 뒤 넘긴다 */
export async function nextCounselQuestions(pid: string, records: { date: string; area: string; content: string }[]): Promise<Assisted<{ line: string; questions: string[] }>> {
  const rule = { line: records.length ? `최근 상담(${records[0].date}, ${records[0].area})에 이어 물어볼 질문이에요` : "첫 상담에서 물어볼 질문이에요", questions: counselQuestionsRule(records) };
  if (!aiEnabled() || !records.length) return { data: rule, label: "자동" };
  const r = await aiJson(z.object({ line: z.string(), questions: z.array(z.string()) }), {
    model: "fast",
    system: `너는 고등학교 교사의 상담 준비를 돕는다. 지난 상담 기록을 읽고 다음 상담에서 학생에게 물어볼 질문 3개를 만든다.
- 지난번에 나온 고민·계획이 어떻게 됐는지 확인하는 질문을 먼저
- 열린 질문, 존댓말 의문문, 각 50자 이내
- line: 지난 상담 흐름 한 줄 요약(40자 이내, "~함" 체)`,
    content: `학생: ${pid}\n상담 기록(최근 순):\n${records.slice(0, 8).map((x) => `- ${x.date} [${x.area}] ${x.content}`).join("\n")}`,
  });
  if (!r.ok) return { data: rule, label: "자동", error: r.error };
  const qs = r.data.questions.map((q) => q.trim()).filter(Boolean).slice(0, 3);
  return qs.length ? { data: { line: r.data.line.trim() || rule.line, questions: qs }, label: "AI" } : { data: rule, label: "자동" };
}

/** 내 교과·과목 추천: 부서 이름 + 편제표 과목(학생 정보 없음) */
export async function suggestMyCourses(dept: string | null, current: SubjectGroup[], courses: Course[]): Promise<Assisted<CourseSuggestion & { reason: string }>> {
  const base = suggestCoursesRule(dept, current, courses);
  const rule = { ...base, reason: base.groups.length ? `${dept ?? "고른 교과"} 기준으로 ${base.groups.join("·")} 과목을 담았어요` : "부서 정보가 없어 추천하지 못했어요. 교과를 먼저 골라 주세요" };
  if (!aiEnabled() || !courses.length || (!dept && !current.length)) return { data: rule, label: "자동" };
  const r = await aiJson(z.object({ groups: z.array(z.string()), courseIds: z.array(z.string()), reason: z.string() }), {
    model: "fast",
    system: `너는 고등학교 교사의 담당 과목 지정을 돕는다. 교사의 부서(교과)와 이미 고른 교과를 보고 학교 편제표에서 이 교사가 맡을 만한 과목을 고른다.
- groups 는 다음 중에서만: ${SUBJECT_GROUPS.join(", ")}
- courseIds 는 편제표 목록의 id 만
- reason: 왜 골랐는지 한 줄(50자 이내, "~했어요" 체)`,
    content: `부서: ${dept ?? "(없음)"}\n이미 고른 교과: ${current.join(", ") || "(없음)"}\n\n편제표:\n${courses.map((c) => `${c.id} | ${c.group} | ${c.subject} | ${c.grade}학년 ${c.semester}학기 | ${c.type ?? "학교 지정"}`).join("\n")}`,
  });
  if (!r.ok) return { data: rule, label: "자동", error: r.error };
  const clean = cleanCourseSuggestion(r.data, courses);
  return clean.groups.length ? { data: { ...clean, reason: r.data.reason.trim() }, label: "AI" } : { data: rule, label: "자동" };
}

/** 학생 목록 말로 찾기. 이름이 들어 있으면 부르는 쪽에서 규칙만 쓴다 */
export async function parseStudentSearch(q: string): Promise<Assisted<StudentFilter>> {
  const rule = parseStudentQuery(q).filter;
  if (!aiEnabled()) return { data: rule, label: "자동" };
  const r = await aiJson(
    z.object({ grade: z.number().int().nullable(), classNo: z.number().int().nullable(), number: z.number().int().nullable(), gender: z.enum(["남", "여"]).nullable() }),
    {
      model: "fast",
      system: "너는 학생 목록 검색어를 필터로 바꾼다. 학년(1~3)·반·번호·성별(남/여)만 뽑고 없으면 null. 이름은 다루지 않는다.",
      content: `검색어: ${q}`,
    },
  );
  if (!r.ok) return { data: rule, label: "자동", error: r.error };
  const f: StudentFilter = {};
  if (r.data.grade && r.data.grade >= 1 && r.data.grade <= 3) f.grade = r.data.grade;
  if (r.data.classNo && r.data.classNo >= 1 && r.data.classNo <= 20) f.classNo = r.data.classNo;
  if (r.data.number && r.data.number >= 1 && r.data.number <= 60) f.number = r.data.number;
  if (r.data.gender) f.gender = r.data.gender;
  return { data: { ...rule, ...f }, label: "AI" };
}

/**
 * 맞춤법 AI 검사 (Figma N38 (e), Haiku): 이미 가린 글(이름·학번 → 가명ID) → 틀린 말과 고칠 말.
 * 바깥 맞춤법 API 는 쓰지 않는다. 저장하지 않는다 — 화면이 본문에 그대로 있는 것만 행으로 보여 준다.
 */
export async function spellCheckAi(masked: string): Promise<{ ok: true; fixes: { from: string; to: string; why: string }[] } | { ok: false; error: string }> {
  if (!aiEnabled()) return { ok: false, error: "AI가 꺼져 있어요. 규칙 사전 결과만 보여 줘요" };
  const r = await aiJson(z.object({ fixes: z.array(z.object({ from: z.string(), to: z.string(), why: z.string() })).max(20) }), {
    model: "fast",
    maxTokens: 1200,
    system: `너는 학교생활기록부 문장의 맞춤법·띄어쓰기 검사기다. 국립국어원 한글 맞춤법·표준어 규정에 어긋난 곳만 찾는다.
- from: 본문에 있는 그대로의 틀린 말(어절 하나나 두 어절, 본문에서 그대로 찾을 수 있게), to: 고친 말, why: 30자 이내 까닭 ("~예요" 체)
- 문체·어미('~함.')·내용·표현 다듬기는 고치지 않는다. 확실히 틀린 것만, 없으면 빈 배열
- S로 시작하는 가명ID(예: S012)·○○·#####은 건드리지 않는다`,
    content: `<본문>
${masked.slice(0, 5000)}
</본문>`,
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, fixes: r.data.fixes };
}
