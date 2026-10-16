import "server-only";
import { notFound, redirect } from "next/navigation";
import { today } from "@/lib/domain/activity";
import { measure } from "@/lib/domain/length";
import { isAdmin, type Action } from "@/lib/domain/policy";
import {
  effectiveStatus, isProgramOwner, latestVersion, responseRate, reviewStatus, studentStage, usesDocs, usesSurvey,
  type DraftJob, type DraftVersion, type Material, type Program, type ProgramStatus, type ReviewStatus, type Stage, type SurveyResponse,
} from "@/lib/domain/program";
import type { Student, Viewer } from "@/lib/domain/types";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

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
  /** 근거가 하나라도 있나 (설문 제출 또는 연결된 서류) */
  hasEvidence: boolean;
  evidenceLabel: string;
  missingReason: string | null;
  length: number | null;
}

/** T2·A4 가 같이 쓰는 학생별 현황 */
export async function programRows(program: Program): Promise<{ rows: StudentRow[]; materials: Material[]; responses: SurveyResponse[] }> {
  const [students, responses, materials, jobs, versions, missing] = await Promise.all([
    repo.listStudents(),
    repo.listResponses(program.id),
    repo.listMaterials(program.id),
    repo.listDraftJobs({ programIds: [program.id] }),
    repo.listDraftVersions({ programIds: [program.id] }),
    repo.listMissingReasons(program.id),
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
      return {
        student, response, materials: mats, job, latest,
        review: reviewStatus(job, latest),
        stage: studentStage({ job, latest, closed }),
        hasEvidence: survey || docs,
        evidenceLabel: survey && docs ? "설문+서류" : survey ? "설문" : docs ? "서류" : "—",
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
}

/** 프로그램 목록(T 프로그램·자료)과 "이번 주 할 일"이 같이 쓰는 요약 */
export async function programSummaries(programs: Program[]): Promise<ProgramSummary[]> {
  const ids = programs.map((p) => p.id);
  const [jobs, versions, responses] = await Promise.all([
    repo.listDraftJobs({ programIds: ids }),
    repo.listDraftVersions({ programIds: ids }),
    Promise.all(programs.map((p) => repo.listResponses(p.id))),
  ]);
  const t = today();
  return programs.map((p, i) => {
    const submitted = responses[i].filter((r) => r.submittedAt && p.targetIds.includes(r.studentId)).length;
    const pj = jobs.filter((j) => j.programId === p.id);
    const st = pj.map((j) => reviewStatus(j, latestVersion(versions, j.id)));
    return {
      p, submitted, rate: responseRate(p.targetIds.length, submitted), status: effectiveStatus(p, t), drafts: pj.length,
      review: st.filter((s) => s === "검토 대기").length, done: st.filter((s) => s === "확정").length, failed: st.filter((s) => s === "생성 실패").length,
    };
  });
}
