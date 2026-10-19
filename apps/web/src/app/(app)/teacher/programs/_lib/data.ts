import "server-only";
import { notFound, redirect } from "next/navigation";
import { today } from "@/lib/domain/activity";
import { measure } from "@/lib/domain/length";
import { isAdmin, type Action } from "@/lib/domain/policy";
import {
  effectiveStatus, isProgramOwner, latestVersion, responseRate, reviewStatus, studentStage, usesDocs, usesMemos, usesSurvey,
  type DraftJob, type DraftVersion, type Material, type Program, type ProgramStatus, type ReviewStatus, type Stage, type SurveyResponse,
} from "@/lib/domain/program";
import type { Student, Viewer } from "@/lib/domain/types";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import type { StageCounts } from "@/lib/domain/program-stage";
import type { RecordMemo } from "@/lib/domain/writing";
import { programMemos } from "@/lib/server/program-memo";

/** 내 프로그램만 (관리자는 전부). 없으면 404, 남의 것이면 403 */
export async function requireProgram(id: string, action: Action = "program.manage"): Promise<{ v: Viewer; program: Program }> {
  const v = await requireCan(action);
  const program = await repo.getProgram(id);
  if (!program) notFound();
  if (!canOwn(v, program)) redirect("/forbidden");
  return { v, program };
}

export function canOwn(v: Viewer, p: Program): boolean {
  return v.kind === "teacher" && (isProgramOwner(p, v.accountId) || isAdmin(v));
}

export interface StudentRow {
  student: Student;
  response: SurveyResponse | null;
  materials: Material[];
  job: DraftJob | undefined;
  latest: DraftVersion | undefined;
  review: ReviewStatus;
  stage: Stage;
  /** 근거가 하나라도 있나 (설문 제출 · 연결된 서류 · 교사 메모 N41) */
  hasEvidence: boolean;
  /** 교사 관찰 메모 (N41, 메모를 쓰는 프로그램만) */
  memo: RecordMemo | null;
  evidenceLabel: string;
  missingReason: string | null;
  length: number | null;
}

/** T2·A4 가 같이 쓰는 학생별 현황 */
export async function programRows(program: Program): Promise<{ rows: StudentRow[]; materials: Material[]; responses: SurveyResponse[] }> {
  const [students, responses, materials, jobs, versions, missing, memos] = await Promise.all([
    repo.listStudents(),
    repo.listResponses(program.id),
    repo.listMaterials(program.id),
    repo.listDraftJobs({ programIds: [program.id] }),
    repo.listDraftVersions({ programIds: [program.id] }),
    repo.listMissingReasons(program.id),
    usesMemos(program) ? programMemos(program.id, program.targetIds) : Promise.resolve(new Map<string, RecordMemo>()),
  ]);
  const closed = effectiveStatus(program, today()) === "closed";
  const targets = new Set(program.targetIds);
  const rows = students
    .filter((s) => targets.has(s.id))
    .sort((a, b) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number)
    .map((student): StudentRow => {
      const response = responses.find((r) => r.studentId === student.id) ?? null;
      const mats = materials.filter((m) => m.studentId === student.id && m.status === "matched");
      const job = jobs.find((j) => j.studentId === student.id);
      const latest = job ? latestVersion(versions, job.id) : undefined;
      const survey = usesSurvey(program.source) && !!response?.submittedAt;
      const docs = usesDocs(program.source) && mats.length > 0;
      const memo = memos.get(student.id) ?? null;
      const label = [survey ? "설문" : "", docs ? "서류" : "", memo ? "메모" : ""].filter(Boolean).join("+");
      return {
        student, response, materials: mats, job, latest, memo,
        review: reviewStatus(job, latest),
        stage: studentStage({ job, latest, closed }),
        hasEvidence: survey || docs || !!memo,
        evidenceLabel: label || "—",
        missingReason: missing[student.id] ?? null,
        length: latest && latest.status !== "rejected" ? measure(latest.content, job?.unit ?? program.unit) : null,
      };
    });
  return { rows, materials, responses };
}

export interface ProgramSummary {
  p: Program;
  submitted: number;
  rate: number;
  status: ProgramStatus;
  review: number;
  done: number;
  failed: number;
  drafts: number;
  /** 프로그램 흐름 단계 계산용 (program-stage.ts) */
  counts: StageCounts;
}

/**
 * 프로그램 목록이 쓰는 요약. 초안 작업·버전은 한 번에, 응답·서류는 프로그램마다 동시에(Promise.all) 읽는다.
 * 학생별 집계 규칙은 상세(programRows)와 같다: 근거 = 설문 제출 또는 연결된 서류, 준비 = 근거 있고 초안 작업이 없거나 대기.
 */
export async function programSummaries(programs: Program[]): Promise<ProgramSummary[]> {
  const ids = programs.map((p) => p.id);
  const [jobs, versions, responses, materials, memos] = await Promise.all([
    ids.length ? repo.listDraftJobs({ programIds: ids }) : Promise.resolve([]),
    ids.length ? repo.listDraftVersions({ programIds: ids }) : Promise.resolve([]),
    Promise.all(programs.map((p) => (usesSurvey(p.source) ? repo.listResponses(p.id) : Promise.resolve([])))),
    Promise.all(programs.map((p) => (usesDocs(p.source) ? repo.listMaterials(p.id) : Promise.resolve([])))),
    Promise.all(programs.map((p) => (usesMemos(p) ? programMemos(p.id, p.targetIds) : Promise.resolve(new Map<string, RecordMemo>())))),
  ]);
  const t = today();
  return programs.map((p, i) => {
    const targets = new Set(p.targetIds);
    const surveyed = new Set(responses[i].filter((r) => r.submittedAt && targets.has(r.studentId)).map((r) => r.studentId));
    const docs = new Set(materials[i].filter((m) => m.status === "matched" && m.studentId && targets.has(m.studentId)).map((m) => m.studentId!));
    const pj = jobs.filter((j) => j.programId === p.id && targets.has(j.studentId));
    const jobOf = new Map(pj.map((j) => [j.studentId, j]));
    const st = pj.map((j) => reviewStatus(j, latestVersion(versions, j.id)));
    const n = (s: ReviewStatus) => st.filter((x) => x === s).length;
    let evidence = 0;
    let ready = 0;
    for (const id of targets) {
      if (!surveyed.has(id) && !docs.has(id) && !memos[i].has(id)) continue;
      evidence++;
      const j = jobOf.get(id);
      if (!j || j.state === "PENDING") ready++;
    }
    const status = effectiveStatus(p, t);
    const review = n("검토 대기") + n("반려");
    const counts: StageCounts = { status, targets: targets.size, evidence, ready, running: n("생성 중"), failed: n("생성 실패"), review, confirmed: n("확정") };
    return {
      p, submitted: surveyed.size, rate: responseRate(targets.size, usesSurvey(p.source) ? surveyed.size : evidence), status, drafts: pj.length,
      review, done: counts.confirmed, failed: counts.failed, counts,
    };
  });
}
