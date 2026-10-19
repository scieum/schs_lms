import "server-only";
import { z } from "zod";
import { resolveLength, UNIT_LABEL } from "@/lib/domain/length";
import {
  afterAttempt, buildEvidence, checkDraft, fitToLength, maskIdentity, MAX_ATTEMPTS, sampleDraft, usesSurvey,
  isReadableByAi, type DraftJob, type DraftSource, type Material,
} from "@/lib/domain/program";
import type { Student } from "@/lib/domain/types";
import { repo } from "@/lib/server/repo";
import { forbiddenBlock } from "@/lib/domain/forbidden";
import { polishStyle } from "@/lib/domain/neis-style";
import { aiEnabled, aiJson } from "./claude";
import { readMaterial } from "./program-ai";
import { kindOfArea, recordSystemPrompt } from "./record-prompts";

// 생기부 초안 파이프라인 (PRD F3): PENDING → RUNNING → DONE / ERROR.
// - AI 입력: 가명ID + 설문 답 + 서류 글(이름·학번 가림) + 희망 진로 + 프로그램 개요. 이름·학번은 보내지 않는다.
// - 생성 뒤 자동 검사(domain/program.checkDraft). 분량 초과·실명/학번 포함·빈 글이면 다시 만든다 (최대 3회).
// - AI 키가 없으면 결정적 예시 초안(source = "sample")으로 흐름만 보여 준다.
// - 확정은 언제나 교사가 한다 (C10). 여기서는 draft 버전만 추가한다.

const Draft = z.object({ draft: z.string() });

// 문체·구성 규칙은 속초고 세특 프롬프트(노션)를 옮긴 record-prompts.ts 를 따른다. 여기서는 프로그램 초안에만 필요한 규칙을 붙인다
const APP_RULES = (min: number, max: number, unit: string) => `

앱 규칙 (가장 중요):
- 이 기록은 프로그램 소개가 아니라 이 학생 한 명의 기록이다. 근거 자료(설문 답, 제출 서류)에서 이 학생이 실제로 고른 주제, 한 일과 방법, 다룬 자료·개념, 알게 된 점, 어려움과 해결, 생각의 변화, 후속 계획을 찾아 구체적으로 쓴다.
- 문장마다 근거 자료의 특정 내용(주제 이름, 대상, 방법, 결과, 학생이 쓴 표현)에 기대야 한다. 근거 자료의 핵심 낱말을 살려 쓰되 설문 답 한 줄을 문장 하나로 옮겨 늘어놓지 않고, 같은 활동의 사실은 이어진 문장으로 새로 쓴다.
- "프로그램 정보"는 무슨 활동인지 이해하는 데만 쓴다. 활동 개요를 본문에 옮기거나 풀어 쓰지 않는다. 프로그램 이름은 첫 문장에 한 번만 짧게 쓴다.
- 다른 학생 기록에 그대로 붙여도 말이 되는 문장(프로그램 일반 설명, "성실히 참여함", "적극적인 태도를 보임" 같은 상투어)은 쓰지 않는다.
- 분량이 모자라면 근거 자료 속 과정·이유·의미를 더 풀어 쓴다. 일반론이나 꾸밈말로 채우지 않는다.
- 근거 자료 하나하나를 (활동) 블록으로 보고, 프로그램 이름을 (주제)로 본다. 없는 활동, 수치, 수상은 만들지 않는다.
- 가명ID를 본문에 쓰지 않는다.
- 분량: ${min}~${max}${unit} (NEIS 기준, 한글 1글자 = 3바이트).
- 결과는 draft 한 칸에 최종본만 넣는다.`;

/**
 * 연결됐지만 글을 아직 안 읽은 서류를 읽어 둔다. 내용 없이 초안을 만들면 프로그램 설명만 쓰게 되기 때문.
 * T6 "AI로 서류 읽기"와 같은 예외(docs/ai-features.md §2) 범위: 이름·학번을 가린 글만 저장하고 초안에 쓴다.
 */
async function readUnreadMaterials(list: Material[], people: { name: string; studentNo: string }[]): Promise<Material[]> {
  if (!aiEnabled()) return list;
  return Promise.all(list.map(async (m) => {
    if (m.status !== "matched" || m.text || !isReadableByAi(m.mime)) return m;
    const bytes = await repo.getMaterialFile(m);
    if (!bytes) return m;
    const r = await readMaterial(bytes, m.mime);
    if (!r.ok || !r.data.text) return m;
    const text = maskIdentity(r.data.text, people).slice(0, 4000);
    await repo.updateMaterial(m.id, { text });
    return { ...m, text };
  }));
}

/** 학생 한 명 초안을 한 번 만든다. 성공하면 draft 버전을 추가한다 */
async function attemptOnce(job: DraftJob, people: { name: string; studentNo: string }[], student: Student): Promise<{ ok: boolean; error?: string }> {
  const program = await repo.getProgram(job.programId);
  if (!program) return { ok: false, error: "프로그램 없음" };
  const [response, listed] = await Promise.all([
    repo.getResponse(program.id, student.id),
    repo.listMaterials(program.id).then((ms) => ms.filter((m) => m.studentId === student.id)),
  ]);
  const materials = await readUnreadMaterials(listed, people);
  const evidence = buildEvidence(program, response, materials).map((e) => ({ label: maskIdentity(e.label, people), text: maskIdentity(e.text, people) }));
  if (evidence.length === 0) return { ok: false, error: "근거 자료 없음" };
  const range = resolveLength(program.area, { unit: job.unit, max: job.max });

  let text: string;
  let source: DraftSource;
  if (aiEnabled()) {
    const content = [
      `학생: ${student.pseudonymId}`,
      `희망 진로: ${student.careerGoal ?? "없음"}`,
      "",
      "근거 자료 (이 학생이 직접 쓰거나 낸 것 — 기록은 여기서 나온다):",
      ...evidence.map((e) => `[${e.label}] ${e.text || "(내용을 읽지 못한 서류)"}`),
      "",
      "프로그램 정보 (맥락 참고용 — 본문에 옮기지 않는다):",
      `이름: ${program.title}${program.subject ? ` (${program.subject})` : ""}`,
      `개요: ${maskIdentity(program.overview, people) || "없음"}`,
    ].join("\n");
    const system = recordSystemPrompt(kindOfArea(program.area), program.subject) + APP_RULES(range.min, range.max, UNIT_LABEL[range.unit]);
    const r = await aiJson(Draft, { system, content, model: "write", maxTokens: 3000 });
    if (!r.ok) return { ok: false, error: r.error };
    text = r.data.draft.trim();
    source = "ai";
  } else {
    const answers = usesSurvey(program.source) && response?.submittedAt ? program.questions.map((q) => maskIdentity(response.answers[q.id] ?? "", people)) : [];
    const docs = materials.filter((m) => m.status === "matched").map((m) => ({ kind: program.docKinds[0] ?? "서류", text: m.text ? maskIdentity(m.text, people) : null }));
    text = sampleDraft({ title: program.title, area: program.area, answers, docs, careerGoal: student.careerGoal, range });
    source = "sample";
  }

  text = fitToLength(polishStyle(text), range);
  const c = checkDraft(text, { range, people: [{ name: student.name, studentNo: student.studentNo }], evidence });
  if (c.hardFail) return { ok: false, error: c.hardFail };
  const banned = forbiddenBlock(text);
  if (source === "ai" && banned && job.attempts < MAX_ATTEMPTS - 1) return { ok: false, error: "기재 금지 표현 포함" };
  if (source === "ai" && c.weak && job.attempts < MAX_ATTEMPTS - 1) return { ok: false, error: "학생 근거와 연결 약함" };
  await repo.addDraftVersion({ jobId: job.id, programId: program.id, studentId: student.id, content: text, status: "draft", reason: null, source, authorId: null });
  return { ok: true };
}

/** 작업들을 차례로 돌린다. 실패하면 3회까지 다시 시도하고, 그래도 안 되면 ERROR("수동 작성 필요") */
export async function runDraftJobs(jobIds: string[]): Promise<{ done: number; failed: number }> {
  const students = await repo.listStudents();
  const byId = new Map(students.map((s) => [s.id, s]));
  let done = 0;
  let failed = 0;
  for (const id of jobIds) {
    const first = await repo.getDraftJob(id);
    if (!first || first.state === "DONE" || first.state === "ERROR") continue;
    let job: DraftJob = first;
    const student = byId.get(job.studentId);
    const program = await repo.getProgram(job.programId);
    if (!student || !program) {
      await repo.updateDraftJob(id, { state: "ERROR", error: "학생·프로그램을 찾지 못함" });
      failed++;
      continue;
    }
    // 가릴 이름: 대상 학생 전원 (모둠원 이름이 답에 들어갈 수 있다)
    const people = program.targetIds.flatMap((sid) => {
      const s = byId.get(sid);
      return s ? [{ name: s.name, studentNo: s.studentNo }] : [];
    });
    while (job.state !== "DONE" && job.state !== "ERROR") {
      await repo.updateDraftJob(id, { state: "RUNNING" });
      let r: { ok: boolean; error?: string };
      try {
        r = await attemptOnce(job, people, student);
      } catch {
        r = { ok: false, error: "처리 중 오류" };
      }
      // 근거가 없으면 다시 해도 같다 → 바로 실패로
      const next: Pick<DraftJob, "state" | "attempts" | "error"> = r.error === "근거 자료 없음" ? { state: "ERROR" as const, attempts: MAX_ATTEMPTS, error: "근거 자료 없음 · 수동 작성 필요" } : afterAttempt(job, r.ok, r.error);
      await repo.updateDraftJob(id, next);
      job = { ...job, ...next };
    }
    if (job.state === "DONE") done++;
    else failed++;
  }
  return { done, failed };
}

/** 다시 만들기: 상태를 처음으로 돌린다 (분량을 바꿀 수 있다). 앞 버전은 그대로 남는다 */
export async function resetDraftJob(jobId: string, len?: { unit: DraftJob["unit"]; max: number }) {
  await repo.updateDraftJob(jobId, { state: "PENDING", attempts: 0, error: null, ...(len ?? {}) });
}
