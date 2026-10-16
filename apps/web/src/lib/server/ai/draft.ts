import "server-only";
import { z } from "zod";
import { resolveLength, UNIT_LABEL } from "@/lib/domain/length";
import {
  afterAttempt, buildEvidence, checkDraft, fitToLength, maskIdentity, MAX_ATTEMPTS, sampleDraft, usesSurvey,
  type DraftJob, type DraftSource,
} from "@/lib/domain/program";
import type { Student } from "@/lib/domain/types";
import { repo } from "@/lib/server/repo";
import { polishStyle } from "@/lib/domain/neis-style";
import { aiEnabled, aiJson } from "./claude";
import { kindOfArea, recordSystemPrompt } from "./record-prompts";

// 생기부 초안 파이프라인 (PRD F3): PENDING → RUNNING → DONE / ERROR.
// - AI 입력: 가명ID + 설문 답 + 서류 글(이름·학번 가림) + 희망 진로 + 프로그램 개요. 이름·학번은 보내지 않는다.
// - 생성 뒤 자동 검사(domain/program.checkDraft). 분량 초과·실명/학번 포함·빈 글이면 다시 만든다 (최대 3회).
// - AI 키가 없으면 결정적 예시 초안(source = "sample")으로 흐름만 보여 준다.
// - 확정은 언제나 교사가 한다 (C10). 여기서는 draft 버전만 추가한다.

const Draft = z.object({ draft: z.string() });

// 문체·구성 규칙은 속초고 세특 프롬프트(노션)를 옮긴 record-prompts.ts 를 따른다. 여기서는 프로그램 초안에만 필요한 규칙을 붙인다
const APP_RULES = (min: number, max: number, unit: string) => `

앱 규칙:
- 근거 자료(설문 답, 제출 서류)에 있는 활동만 쓴다. 근거 자료 하나하나를 (활동) 블록으로 보고, 프로그램 이름을 (주제)로 본다. 없는 활동, 수치, 수상은 만들지 않는다.
- 가명ID를 본문에 쓰지 않는다.
- 분량: ${min}~${max}${unit} (NEIS 기준, 한글 1글자 = 3바이트).
- 결과는 draft 한 칸에 최종본만 넣는다.`;

/** 학생 한 명 초안을 한 번 만든다. 성공하면 draft 버전을 추가한다 */
async function attemptOnce(job: DraftJob, people: { name: string; studentNo: string }[], student: Student): Promise<{ ok: boolean; error?: string }> {
  const program = await repo.getProgram(job.programId);
  if (!program) return { ok: false, error: "프로그램 없음" };
  const [response, materials] = await Promise.all([
    repo.getResponse(program.id, student.id),
    repo.listMaterials(program.id).then((ms) => ms.filter((m) => m.studentId === student.id)),
  ]);
  const evidence = buildEvidence(program, response, materials).map((e) => ({ label: maskIdentity(e.label, people), text: maskIdentity(e.text, people) }));
  if (evidence.length === 0) return { ok: false, error: "근거 자료 없음" };
  const range = resolveLength(program.area, { unit: job.unit, max: job.max });

  let text: string;
  let source: DraftSource;
  if (aiEnabled()) {
    const content = [
      `학생: ${student.pseudonymId}`,
      `프로그램: ${program.title}${program.subject ? ` (${program.subject})` : ""}`,
      `활동 개요: ${maskIdentity(program.overview, people) || "없음"}`,
      `희망 진로: ${student.careerGoal ?? "없음"}`,
      "근거 자료:",
      ...evidence.map((e) => `[${e.label}] ${e.text || "(내용을 읽지 못한 서류)"}`),
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
