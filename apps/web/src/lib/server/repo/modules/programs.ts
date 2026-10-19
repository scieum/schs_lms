import "server-only";
import type { LengthUnit } from "@/lib/domain/length";
import {
  daysLeft, effectiveStatus, isProgramOwner, latestVersion, reviewStatus, usesDocs, usesSurvey, FIXED_QUESTIONS,
  type DraftJob, type DraftState, type DraftVersion, type Material, type Program, type StudentTodo, type SurveyResponse,
} from "@/lib/domain/program";
import { store } from "../demo";
import { check, db, isUuid, selectIn } from "../supabase";

// 프로그램·설문·제출 서류·생기부 초안(AI)·초안 파이프라인.
// 인터페이스 + 데모(메모리) 구현 + Supabase 구현을 이 파일 한 곳에 둔다. index.ts 가 합친다.

export type NewProgram = Omit<Program, "id" | "createdAt">;
export type ProgramPatch = Partial<Omit<Program, "id" | "ownerId" | "createdAt">>;
export type NewMaterial = Omit<Material, "id" | "createdAt" | "filePath">;
export type MaterialPatch = Partial<Pick<Material, "studentId" | "status" | "matchedBy" | "text" | "pages">>;
export type DraftJobPatch = Partial<Pick<DraftJob, "state" | "attempts" | "error" | "unit" | "max" | "manualRequestedAt">>;

/** 미응답 독촉 등 학생 앱 알림 기록 (실제 발송 채널은 아직 없다) */
export interface Reminder {
  id: string;
  programId: string;
  studentIds: string[];
  message: string;
  senderId: string;
  createdAt: string;
}

/** 담임이 보는 확정 초안 */
export interface FinalDraft {
  studentId: string;
  programId: string;
  programTitle: string;
  area: Program["area"];
  subject: string | null;
  content: string;
  finalizedAt: string;
  authorId: string | null;
}

interface BaseRepo {
  /** ownerId 를 주면 그 교사가 담당(등록·공동)인 것만 (임시 저장 포함), 없으면 전체 */
  listPrograms(filter?: { ownerId?: string }): Promise<Program[]>;
  getProgram(id: string): Promise<Program | null>;
  createProgram(p: NewProgram): Promise<Program>;
  updateProgram(id: string, patch: ProgramPatch): Promise<void>;
  /** 프로그램과 딸린 응답·서류(파일)·초안 작업·버전·알림·미제출 사유를 모두 지운다. 확정본 확인은 호출하는 쪽에서 */
  deleteProgram(id: string): Promise<void>;

  listResponses(programId: string): Promise<SurveyResponse[]>;
  getResponse(programId: string, studentId: string): Promise<SurveyResponse | null>;
  /** 학생 설문 응답 저장 (임시 저장 또는 제출). 학생당 한 개를 고쳐 쓴다 — 생기부 기록이 아니라 근거 입력이다 */
  saveResponse(programId: string, studentId: string, answers: Record<string, string>, submit: boolean): Promise<SurveyResponse>;

  listMaterials(programId: string): Promise<Material[]>;
  listMaterialsByStudent(studentId: string): Promise<Material[]>;
  getMaterial(id: string): Promise<Material | null>;
  addMaterial(m: NewMaterial, bytes: Uint8Array): Promise<Material>;
  updateMaterial(id: string, patch: MaterialPatch): Promise<void>;
  getMaterialFile(m: Material): Promise<Uint8Array | null>;
  /** 자료 한 개를 지운다 (행 → 저장소 파일 순). 지운 행을 돌려준다. 이미 만든 초안은 건드리지 않는다 (N33) */
  deleteMaterial(id: string): Promise<Material | null>;

  /** 미제출 사유 (학생 id → 사유) */
  listMissingReasons(programId: string): Promise<Record<string, string>>;
  setMissingReason(programId: string, studentId: string, reason: string, by: string): Promise<void>;

  listDraftJobs(filter: { programIds?: string[]; states?: DraftState[]; studentIds?: string[] }): Promise<DraftJob[]>;
  getDraftJob(id: string): Promise<DraftJob | null>;
  /** 없는 학생만 PENDING 으로 만든다. 이 학생들의 작업을 모두 돌려준다 */
  ensureDraftJobs(programId: string, studentIds: string[], len: { unit: LengthUnit; max: number }): Promise<DraftJob[]>;
  updateDraftJob(id: string, patch: DraftJobPatch): Promise<void>;
  /** 초안 버전: 추가만 한다 (C4) */
  listDraftVersions(filter: { programIds?: string[]; jobIds?: string[]; studentIds?: string[] }): Promise<DraftVersion[]>;
  addDraftVersion(v: Omit<DraftVersion, "id" | "createdAt">): Promise<DraftVersion>;

  addReminder(r: Omit<Reminder, "id" | "createdAt">): Promise<Reminder>;
  listReminders(filter: { programId?: string; studentId?: string }): Promise<Reminder[]>;
}

export interface ProgramsRepo extends BaseRepo {
  /** 학생이 대상인 발행된 프로그램 (임시 저장 제외) */
  listProgramsForStudent(studentId: string): Promise<Program[]>;
  /** 학생 홈 "내 할 일": 마감 전, 아직 안 낸 설문·서류 */
  listStudentTodos(studentId: string, today: string): Promise<StudentTodo[]>;
  /** 교사 홈: 내 프로그램의 검토 대기 초안 수 */
  countDraftReviewQueue(teacherId: string): Promise<number>;
  /** 담임: 학생들의 확정 초안 (프로그램마다 마지막 확정본) */
  listDraftsForStudents(studentIds: string[]): Promise<FinalDraft[]>;
}

/** 여러 구현이 같이 쓰는 조합 메서드 */
function withDerived(base: BaseRepo): ProgramsRepo {
  const forStudent = async (studentId: string) =>
    (await base.listPrograms()).filter((p) => p.status !== "draft" && p.targetIds.includes(studentId)).sort((a, b) => a.endDate.localeCompare(b.endDate));
  return {
    ...base,
    listProgramsForStudent: forStudent,
    async listStudentTodos(studentId, today) {
      const programs = (await forStudent(studentId)).filter((p) => effectiveStatus(p, today) === "open" && daysLeft(p.endDate, today) >= 0);
      const mats = await base.listMaterialsByStudent(studentId);
      const out: StudentTodo[] = [];
      for (const p of programs) {
        if (usesSurvey(p.source)) {
          const r = await base.getResponse(p.id, studentId);
          if (!r?.submittedAt) {
            const done = p.questions.filter((q) => (r?.answers[q.id] ?? "").trim().length >= q.minChars).length;
            out.push({ programId: p.id, title: p.title, kind: "survey", endDate: p.endDate, progress: `${done}/${p.questions.length}문항` });
          }
        }
        if (usesDocs(p.source) && p.requestDocs && !mats.some((m) => m.programId === p.id)) {
          out.push({ programId: p.id, title: p.docKinds[0] ?? "서류", kind: "docs", endDate: p.endDate, progress: "0개 올림" });
        }
      }
      return out;
    },
    async countDraftReviewQueue(teacherId) {
      const ids = (await base.listPrograms({ ownerId: teacherId })).map((p) => p.id);
      if (!ids.length) return 0;
      const [jobs, versions] = await Promise.all([base.listDraftJobs({ programIds: ids }), base.listDraftVersions({ programIds: ids })]);
      return jobs.filter((j) => reviewStatus(j, latestVersion(versions, j.id)) === "검토 대기").length;
    },
    async listDraftsForStudents(studentIds) {
      if (!studentIds.length) return [];
      const versions = await base.listDraftVersions({ studentIds });
      const byJob = new Map<string, DraftVersion>();
      for (const v of versions) {
        const prev = byJob.get(v.jobId);
        if (!prev || prev.createdAt <= v.createdAt) byJob.set(v.jobId, v);
      }
      const finals = [...byJob.values()].filter((v) => v.status === "finalized");
      const programs = new Map((await base.listPrograms()).map((p) => [p.id, p]));
      return finals
        .flatMap((v) => {
          const p = programs.get(v.programId);
          return p ? [{ studentId: v.studentId, programId: p.id, programTitle: p.title, area: p.area, subject: p.subject, content: v.content, finalizedAt: v.createdAt, authorId: v.authorId }] : [];
        })
        .sort((a, b) => b.finalizedAt.localeCompare(a.finalizedAt));
    },
  };
}

// ======================================================================
// 데모 (메모리)
// ======================================================================

interface ProgramStore {
  programs: Program[];
  responses: SurveyResponse[];
  materials: Material[];
  files: Map<string, Uint8Array>;
  missing: { programId: string; studentId: string; reason: string }[];
  jobs: DraftJob[];
  versions: DraftVersion[];
  reminders: Reminder[];
}

const g = globalThis as unknown as { __schsprograms?: ProgramStore };

/** 데모용 아주 작은 PDF (영문 글자만). pdf-lib 로 열고 나눌 수 있다 */
export function tinyPdf(pageTexts: string[]): Uint8Array {
  const objs: string[] = [];
  const n = pageTexts.length;
  const pageIds = pageTexts.map((_, i) => 4 + i * 2);
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${n} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pageTexts.forEach((t, i) => {
    const safe = t.replace(/[()\\]/g, "").replace(/[^\x20-\x7e]/g, "?");
    const stream = `BT /F1 20 Tf 60 760 Td (${safe}) Tj ET`;
    objs[pageIds[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objs[pageIds[i] + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

function ymd(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const ago = (h: number) => new Date(Date.now() - h * 3600000).toISOString();

export const DEMO_PROGRAM_IDS = {
  science: "5c1e0a9e-1a2b-4c3d-8e4f-000000000001",
  career: "5c1e0a9e-1a2b-4c3d-8e4f-000000000002",
  reading: "5c1e0a9e-1a2b-4c3d-8e4f-000000000003",
  eco: "5c1e0a9e-1a2b-4c3d-8e4f-000000000004",
};

function seed(): ProgramStore {
  const s: ProgramStore = { programs: [], responses: [], materials: [], files: new Map(), missing: [], jobs: [], versions: [], reminders: [] };
  const P = DEMO_PROGRAM_IDS;
  const all = ["s-1", "s-2", "s-3", "s-4", "s-5", "s-6", "s-7", "s-8", "s-9", "s-10", "s-11", "s-12", "s-13", "s-14", "s-15"];
  const class3 = all.filter((id) => !["s-4", "s-5"].includes(id));
  const extra = { id: "q5", title: "추가 1", prompt: "발표에서 가장 어려웠던 점은?", fixed: false, minChars: 30 };

  s.programs.push(
    {
      id: P.science, ownerId: "t-subject", coOwnerIds: [], title: "과학 탐구 발표", subject: "물리학", area: "세특", unit: "bytes", max: 1500,
      startDate: ymd(-3), endDate: ymd(4), source: "both", requestDocs: true, docKinds: ["탐구 보고서", "활동지"],
      questions: [...FIXED_QUESTIONS, extra], targetIds: all, status: "open", createdAt: ago(24 * 5),
      overview: "모둠별로 생활 속 과학 현상을 하나 골라 가설을 세우고 실험·관찰한 뒤 결과를 발표한다.",
    },
    {
      id: P.career, ownerId: "t-subject", coOwnerIds: [], title: "진로 탐색 주간", subject: null, area: "창체-진로", unit: "bytes", max: 1500,
      startDate: ymd(-10), endDate: ymd(9), source: "survey", requestDocs: false, docKinds: [],
      questions: [...FIXED_QUESTIONS], targetIds: class3, status: "open", createdAt: ago(24 * 12),
      overview: "희망 진로 분야 직업인 인터뷰 영상을 보고 관련 학과·필요 역량을 조사해 진로 계획서를 쓴다.",
    },
    {
      id: P.reading, ownerId: "t-subject", coOwnerIds: [], title: "독서 토론 동아리", subject: null, area: "창체-동아리", unit: "bytes", max: 1500,
      startDate: ymd(-1), endDate: ymd(2), source: "survey", requestDocs: false, docKinds: [],
      questions: [...FIXED_QUESTIONS], targetIds: ["s-2", "s-3", "s-4"], status: "open", createdAt: ago(30),
      overview: "한 달에 한 권 같은 책을 읽고 쟁점을 나눠 찬반 토론을 한다.",
    },
    {
      id: P.eco, ownerId: "t-homeroom", coOwnerIds: [], title: "환경 동아리", subject: null, area: "창체-동아리", unit: "bytes", max: 1500,
      startDate: ymd(-40), endDate: ymd(-20), source: "survey", requestDocs: false, docKinds: [],
      questions: [...FIXED_QUESTIONS], targetIds: ["s-8", "s-9"], status: "closed", createdAt: ago(24 * 45),
      overview: "교내 분리배출 실태를 조사하고 개선 캠페인을 연다.",
    },
  );

  // 과학 탐구 발표 응답: s-2 ~ s-11 제출, s-1 임시 저장(2문항), 나머지 미응답
  const topics = ["미세플라스틱이 해양 생물에 미치는 영향", "빗면에서 마찰력과 기울기의 관계", "소리의 공명과 관 길이", "식물 생장과 빛의 색", "자석 주변 자기장의 모양", "물의 표면장력과 세제", "진자의 주기와 줄 길이", "열전도와 재질의 차이", "전지의 전압과 과일 종류", "빛의 굴절과 물의 깊이"];
  topics.forEach((t, i) => {
    const sid = `s-${i + 2}`;
    s.responses.push({
      id: crypto.randomUUID(), programId: P.science, studentId: sid, submittedAt: ago(48 - i), updatedAt: ago(48 - i),
      answers: {
        q1: `'${t}'을 주제로 모둠원과 가설을 세우고 실험을 세 번 반복해 측정값을 표로 정리했어요.`,
        q2: "같은 조건을 유지하는 변인 통제가 결과를 믿을 수 있게 만든다는 걸 배웠어요. 측정 오차를 줄이는 방법도 알게 됐어요.",
        q3: "처음 예상과 결과가 달라서 당황했지만 원인을 찾아가는 과정이 재미있었고 과학자처럼 생각해 본 것 같아요.",
        q4: "표본 수를 늘려 다시 실험하고, 관련 논문을 찾아 읽어서 결과를 비교해 보고 싶어요.",
        q5: "질의응답에서 실험 오차를 묻는 질문에 바로 답하기 어려워서 데이터를 다시 정리해야 했어요.",
      },
    });
  });
  s.responses.push({
    id: crypto.randomUUID(), programId: P.science, studentId: "s-1", submittedAt: null, updatedAt: ago(3),
    answers: { q1: "미세플라스틱이 해양 생물에 미치는 영향을 주제로 해변 3곳의 모래를 채취해 현미경으로 관찰했어요.", q2: "지점마다 입자 수가 달라서 표본을 어떻게 고르는지가 결과를 바꾼다는 걸 알게 됐어요." },
  });
  // 진로 탐색 주간: s-6, s-7 제출
  for (const sid of ["s-6", "s-7"]) {
    s.responses.push({
      id: crypto.randomUUID(), programId: P.career, studentId: sid, submittedAt: ago(20), updatedAt: ago(20),
      answers: {
        q1: "산업디자이너 인터뷰 영상을 보고 제품 디자인 과정과 필요한 역량을 조사해 진로 계획서를 썼어요.",
        q2: "디자인은 예쁘게 만드는 일만이 아니라 사용자의 불편을 찾아 해결하는 일이라는 걸 배웠어요.",
        q3: "막연했던 꿈이 구체적인 직업으로 보이기 시작해서 공부할 이유가 생긴 것 같아 뿌듯했어요.",
        q4: "디자인 관련 학과의 교육과정을 찾아보고 생활 속 불편한 물건을 하나 골라 개선안을 그려 보고 싶어요.",
      },
    });
  }
  for (const sid of ["s-8", "s-9"]) {
    s.responses.push({
      id: crypto.randomUUID(), programId: P.eco, studentId: sid, submittedAt: ago(24 * 25), updatedAt: ago(24 * 25),
      answers: { q1: "교내 분리배출 실태를 일주일 동안 조사했어요.", q2: "작은 습관이 모이면 큰 차이를 만든다는 걸 배웠어요.", q3: "친구들이 캠페인에 함께해 줘서 뿌듯했어요.", q4: "학교 전체로 캠페인을 넓혀 보고 싶어요." },
    });
  }

  // 제출 서류: 자동 매칭 2, 확인 필요 1, 합본 1
  const addFile = (m: Omit<Material, "filePath" | "createdAt" | "id">, bytes: Uint8Array, h: number) => {
    const id = crypto.randomUUID();
    const filePath = `${m.programId}/${id}`;
    s.files.set(filePath, bytes);
    s.materials.push({ ...m, id, filePath, createdAt: ago(h) });
  };
  const base = { programId: P.science, mime: "application/pdf", uploaderId: "t-subject" };
  const one = tinyPdf(["Science report - page 1", "Science report - page 2"]);
  addFile({ ...base, studentId: "s-2", fileName: "20301_강예린_탐구보고서.pdf", size: one.length, pages: 2, status: "matched", matchedBy: "studentNo", text: "빗면 실험에서 기울기를 5도씩 바꾸며 마찰력을 측정하고 이론값과 비교한 그래프를 그림." }, one, 30);
  addFile({ ...base, studentId: "s-3", fileName: "20307_박서준_탐구보고서.pdf", size: one.length, pages: 2, status: "matched", matchedBy: "studentNo", text: "관 길이를 바꾸며 공명 진동수를 측정하고 온도에 따른 오차를 분석함." }, one, 29);
  addFile({ ...base, studentId: null, fileName: "scan_0012.pdf", size: one.length, pages: 2, status: "needs_review", matchedBy: null, text: null }, one, 20);
  const bundle = tinyPdf(Array.from({ length: 9 }, (_, i) => `Class 2-3 reports - page ${i + 1}`));
  addFile({ ...base, studentId: null, fileName: "2반_보고서_합본.pdf", size: bundle.length, pages: 9, status: "bundle", matchedBy: null, text: null }, bundle, 10);
  s.missing.push({ programId: P.science, studentId: "s-15", reason: "전학 예정 (담임 확인)" });

  // 초안: s-2·s-4·s-6 검토 대기, s-3 확정, s-5 생성 실패, s-7 반려
  const job = (programId: string, studentId: string, state: DraftState, attempts: number, error: string | null = null): DraftJob => {
    const j: DraftJob = { id: crypto.randomUUID(), programId, studentId, state, attempts, error, unit: "bytes", max: 1500, manualRequestedAt: null, createdAt: ago(26), updatedAt: ago(25) };
    s.jobs.push(j);
    return j;
  };
  const ver = (j: DraftJob, content: string, status: DraftVersion["status"], h: number, extra: Partial<DraftVersion> = {}) =>
    s.versions.push({ id: crypto.randomUUID(), jobId: j.id, programId: j.programId, studentId: j.studentId, content, status, reason: null, source: "sample", authorId: null, createdAt: ago(h), ...extra });

  const sci = (topic: string) =>
    `과학 탐구 발표 활동에서 '${topic}'을 주제로 모둠원과 가설을 세우고 실험을 세 번 반복하여 측정값을 표로 정리함. 같은 조건을 유지하는 변인 통제가 결과의 신뢰도를 높인다는 점을 이해하고 측정 오차를 줄이는 방법을 스스로 찾아 적용함. 예상과 다른 결과가 나오자 원인을 차례로 점검하며 끈기 있게 탐구하는 태도를 보임. 질의응답에서 받은 오차 관련 질문을 계기로 데이터를 다시 정리하여 보고서를 보완함. 표본 수를 늘린 재실험과 관련 논문 비교를 후속 계획으로 제시하며 탐구를 이어가려는 의지를 보임.`;
  ver(job(P.science, "s-2", "DONE", 1), sci(topics[0]), "draft", 24);
  const j3 = job(P.science, "s-3", "DONE", 1);
  ver(j3, sci(topics[1]), "draft", 24);
  ver(j3, sci(topics[1]), "finalized", 6, { source: "manual", authorId: "t-subject" });
  ver(job(P.science, "s-4", "DONE", 1), sci(topics[2]), "draft", 23);
  job(P.science, "s-5", "ERROR", 3, "3회 재시도 실패 · 수동 작성 필요 (분량 초과)");
  const j7 = job(P.science, "s-7", "DONE", 1);
  ver(j7, sci(topics[5]), "draft", 22);
  ver(j7, sci(topics[5]), "rejected", 5, { source: "manual", authorId: "t-subject", reason: "발표 내용이 빠졌어요. 서류를 받은 뒤 다시 만들어 주세요" });
  const c6 = job(P.career, "s-6", "DONE", 1);
  ver(c6, "진로 탐색 주간에 산업디자이너 인터뷰 영상을 보고 제품 디자인 과정과 필요한 역량을 조사하여 진로 계획서를 작성함. 디자인을 사용자의 불편을 찾아 해결하는 일로 이해하며 직업에 대한 관점을 넓힘. 디자인 관련 학과의 교육과정을 찾아보고 생활 속 불편한 물건의 개선안을 그려 보겠다는 구체적인 계획을 세움.", "draft", 12);
  for (const sid of ["s-8", "s-9"]) {
    const j = job(P.eco, sid, "DONE", 1);
    ver(j, "교내 분리배출 실태를 일주일 동안 조사하고 결과를 바탕으로 개선 캠페인을 기획하여 친구들의 참여를 이끌어 냄. 작은 습관이 모여 큰 차이를 만든다는 점을 깨닫고 학교 전체로 캠페인을 넓히려는 계획을 세움.", "finalized", 24 * 18, { authorId: "t-homeroom", source: "manual" });
  }
  return s;
}

function ps(): ProgramStore {
  if (!g.__schsprograms) {
    store(); // 공용 데모 데이터(학생·교사)를 먼저 만든다
    g.__schsprograms = seed();
  }
  return g.__schsprograms;
}

const copy = <T>(x: T): T => structuredClone(x);
const inList = (list: string[] | undefined, v: string) => !list || list.includes(v);

const demoBase: BaseRepo = {
  async listPrograms(filter) {
    return ps().programs.filter((p) => !filter?.ownerId || isProgramOwner(p, filter.ownerId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(copy);
  },
  async getProgram(id) {
    const p = ps().programs.find((x) => x.id === id);
    return p ? copy(p) : null;
  },
  async createProgram(p) {
    const row: Program = { ...copy(p), id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    ps().programs.push(row);
    return copy(row);
  },
  async updateProgram(id, patch) {
    const p = ps().programs.find((x) => x.id === id);
    if (p) Object.assign(p, copy(patch));
  },
  async deleteProgram(id) {
    const s = ps();
    for (const m of s.materials) if (m.programId === id) s.files.delete(m.filePath);
    s.programs = s.programs.filter((x) => x.id !== id);
    s.responses = s.responses.filter((x) => x.programId !== id);
    s.materials = s.materials.filter((x) => x.programId !== id);
    s.missing = s.missing.filter((x) => x.programId !== id);
    s.jobs = s.jobs.filter((x) => x.programId !== id);
    s.versions = s.versions.filter((x) => x.programId !== id);
    s.reminders = s.reminders.filter((x) => x.programId !== id);
  },
  async listResponses(programId) {
    return ps().responses.filter((r) => r.programId === programId).map(copy);
  },
  async getResponse(programId, studentId) {
    const r = ps().responses.find((x) => x.programId === programId && x.studentId === studentId);
    return r ? copy(r) : null;
  },
  async saveResponse(programId, studentId, answers, submit) {
    const s = ps();
    const now = new Date().toISOString();
    let r = s.responses.find((x) => x.programId === programId && x.studentId === studentId);
    if (!r) {
      r = { id: crypto.randomUUID(), programId, studentId, answers: {}, submittedAt: null, updatedAt: now };
      s.responses.push(r);
    }
    r.answers = { ...answers };
    r.updatedAt = now;
    if (submit) r.submittedAt = now;
    return copy(r);
  },
  async listMaterials(programId) {
    return ps().materials.filter((m) => m.programId === programId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(copy);
  },
  async listMaterialsByStudent(studentId) {
    return ps().materials.filter((m) => m.studentId === studentId).map(copy);
  },
  async getMaterial(id) {
    const m = ps().materials.find((x) => x.id === id);
    return m ? copy(m) : null;
  },
  async addMaterial(m, bytes) {
    const id = crypto.randomUUID();
    const row: Material = { ...m, id, filePath: `${m.programId}/${id}`, createdAt: new Date().toISOString() };
    ps().files.set(row.filePath, bytes);
    ps().materials.push(row);
    return copy(row);
  },
  async updateMaterial(id, patch) {
    const m = ps().materials.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
  },
  async getMaterialFile(m) {
    return ps().files.get(m.filePath) ?? null;
  },
  async deleteMaterial(id) {
    const s = ps();
    const m = s.materials.find((x) => x.id === id);
    if (!m) return null;
    s.materials = s.materials.filter((x) => x.id !== id);
    s.files.delete(m.filePath);
    return copy(m);
  },
  async listMissingReasons(programId) {
    return Object.fromEntries(ps().missing.filter((x) => x.programId === programId).map((x) => [x.studentId, x.reason]));
  },
  async setMissingReason(programId, studentId, reason) {
    const s = ps();
    s.missing = s.missing.filter((x) => !(x.programId === programId && x.studentId === studentId));
    if (reason.trim()) s.missing.push({ programId, studentId, reason: reason.trim() });
  },
  async listDraftJobs(f) {
    return ps().jobs.filter((j) => inList(f.programIds, j.programId) && inList(f.states, j.state) && inList(f.studentIds, j.studentId)).map(copy);
  },
  async getDraftJob(id) {
    const j = ps().jobs.find((x) => x.id === id);
    return j ? copy(j) : null;
  },
  async ensureDraftJobs(programId, studentIds, len) {
    const s = ps();
    const now = new Date().toISOString();
    for (const sid of studentIds) {
      if (!s.jobs.some((j) => j.programId === programId && j.studentId === sid)) {
        s.jobs.push({ id: crypto.randomUUID(), programId, studentId: sid, state: "PENDING", attempts: 0, error: null, unit: len.unit, max: len.max, manualRequestedAt: null, createdAt: now, updatedAt: now });
      }
    }
    return s.jobs.filter((j) => j.programId === programId && studentIds.includes(j.studentId)).map(copy);
  },
  async updateDraftJob(id, patch) {
    const j = ps().jobs.find((x) => x.id === id);
    if (j) Object.assign(j, patch, { updatedAt: new Date().toISOString() });
  },
  async listDraftVersions(f) {
    return ps().versions.filter((v) => inList(f.programIds, v.programId) && inList(f.jobIds, v.jobId) && inList(f.studentIds, v.studentId)).map(copy);
  },
  async addDraftVersion(v) {
    const row: DraftVersion = { ...v, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    ps().versions.push(row);
    return copy(row);
  },
  async addReminder(r) {
    const row: Reminder = { ...copy(r), id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    ps().reminders.push(row);
    return copy(row);
  },
  async listReminders(f) {
    return ps().reminders
      .filter((r) => (!f.programId || r.programId === f.programId) && (!f.studentId || r.studentIds.includes(f.studentId)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(copy);
  },
};

export const demoPrograms: ProgramsRepo = withDerived(demoBase);

// ======================================================================
// Supabase (supabase/migrations/0006_programs_drafts.sql)
// ======================================================================

const BUCKET = "program-docs";

type ProgramRow = {
  id: string; owner_id: string; co_owner_ids: string[] | null; title: string; subject: string | null; area: Program["area"]; unit: LengthUnit; max_len: number;
  start_date: string; end_date: string; source: Program["source"]; request_docs: boolean; doc_kinds: string[];
  questions: Program["questions"]; target_ids: string[]; overview: string; status: Program["status"]; created_at: string;
};
type ResponseRow = { id: string; program_id: string; student_id: string; answers: Record<string, string>; submitted_at: string | null; updated_at: string };
type MaterialRow = {
  id: string; program_id: string; student_id: string | null; file_name: string; mime: string; size: number; pages: number | null;
  file_path: string; status: Material["status"]; matched_by: Material["matchedBy"]; text: string | null; uploader_id: string; created_at: string;
};
type JobRow = {
  id: string; program_id: string; student_id: string; state: DraftState; attempts: number; error: string | null; unit: LengthUnit; max_len: number;
  manual_requested_at: string | null; created_at: string; updated_at: string;
};
type VersionRow = {
  id: string; job_id: string; program_id: string; student_id: string; content: string; status: DraftVersion["status"]; reason: string | null;
  source: DraftVersion["source"]; author_id: string | null; created_at: string;
};
type ReminderRow = { id: string; program_id: string; student_ids: string[]; message: string; sender_id: string; created_at: string };

const toProgram = (r: ProgramRow): Program => ({
  id: r.id, ownerId: r.owner_id, coOwnerIds: r.co_owner_ids ?? [], title: r.title, subject: r.subject, area: r.area, unit: r.unit, max: r.max_len, startDate: r.start_date, endDate: r.end_date,
  source: r.source, requestDocs: r.request_docs, docKinds: r.doc_kinds ?? [], questions: r.questions ?? [], targetIds: r.target_ids ?? [],
  overview: r.overview ?? "", status: r.status, createdAt: r.created_at,
});
const toResponse = (r: ResponseRow): SurveyResponse => ({ id: r.id, programId: r.program_id, studentId: r.student_id, answers: r.answers ?? {}, submittedAt: r.submitted_at, updatedAt: r.updated_at });
const toMaterial = (r: MaterialRow): Material => ({
  id: r.id, programId: r.program_id, studentId: r.student_id, fileName: r.file_name, mime: r.mime, size: Number(r.size), pages: r.pages,
  filePath: r.file_path, status: r.status, matchedBy: r.matched_by, text: r.text, uploaderId: r.uploader_id, createdAt: r.created_at,
});
const toJob = (r: JobRow): DraftJob => ({
  id: r.id, programId: r.program_id, studentId: r.student_id, state: r.state, attempts: r.attempts, error: r.error, unit: r.unit, max: r.max_len,
  manualRequestedAt: r.manual_requested_at, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toVersion = (r: VersionRow): DraftVersion => ({
  id: r.id, jobId: r.job_id, programId: r.program_id, studentId: r.student_id, content: r.content, status: r.status, reason: r.reason,
  source: r.source, authorId: r.author_id, createdAt: r.created_at,
});
const toReminder = (r: ReminderRow): Reminder => ({ id: r.id, programId: r.program_id, studentIds: r.student_ids ?? [], message: r.message, senderId: r.sender_id, createdAt: r.created_at });

const uuids = (list: string[] | undefined) => list?.filter(isUuid);

/** 0011(co_owner_ids) 적용 전 DB면 그 열 없이 다시 시도한다 */
const noCoOwnerColumn = (e: { message: string } | null) => !!e && /co_owner_ids/.test(e.message);

const supabaseBase: BaseRepo = {
  async listPrograms(filter) {
    const base = () => db().from("programs").select("*").order("created_at", { ascending: false });
    if (!filter?.ownerId) return (check(await base()) as ProgramRow[]).map(toProgram);
    if (!isUuid(filter.ownerId)) return [];
    let res = await base().or(`owner_id.eq.${filter.ownerId},co_owner_ids.cs.{${filter.ownerId}}`);
    if (noCoOwnerColumn(res.error)) res = await base().eq("owner_id", filter.ownerId);
    return (check(res) as ProgramRow[]).map(toProgram);
  },
  async getProgram(id) {
    if (!isUuid(id)) return null;
    const r = check(await db().from("programs").select("*").eq("id", id).maybeSingle());
    return r ? toProgram(r as ProgramRow) : null;
  },
  async createProgram(p) {
    const row = {
      owner_id: p.ownerId, co_owner_ids: p.coOwnerIds.filter(isUuid), title: p.title, subject: p.subject, area: p.area, unit: p.unit, max_len: p.max, start_date: p.startDate, end_date: p.endDate,
      source: p.source, request_docs: p.requestDocs, doc_kinds: p.docKinds, questions: p.questions, target_ids: p.targetIds.filter(isUuid),
      overview: p.overview, status: p.status,
    };
    let res = await db().from("programs").insert(row).select("*").single();
    if (noCoOwnerColumn(res.error) && row.co_owner_ids.length === 0) {
      const { co_owner_ids: _skip, ...rest } = row;
      void _skip;
      res = await db().from("programs").insert(rest).select("*").single();
    }
    return toProgram(check(res) as ProgramRow);
  },
  async updateProgram(id, p) {
    if (!isUuid(id)) return;
    const row: Partial<ProgramRow> = {};
    if (p.status !== undefined) row.status = p.status;
    if (p.source !== undefined) row.source = p.source;
    if (p.requestDocs !== undefined) row.request_docs = p.requestDocs;
    if (p.docKinds !== undefined) row.doc_kinds = p.docKinds;
    if (p.coOwnerIds !== undefined) row.co_owner_ids = p.coOwnerIds.filter(isUuid);
    if (p.title !== undefined) row.title = p.title;
    if (p.subject !== undefined) row.subject = p.subject;
    if (p.area !== undefined) row.area = p.area;
    if (p.unit !== undefined) row.unit = p.unit;
    if (p.max !== undefined) row.max_len = p.max;
    if (p.startDate !== undefined) row.start_date = p.startDate;
    if (p.endDate !== undefined) row.end_date = p.endDate;
    if (p.questions !== undefined) row.questions = p.questions;
    if (p.targetIds !== undefined) row.target_ids = p.targetIds.filter(isUuid);
    if (p.overview !== undefined) row.overview = p.overview;
    let res = await db().from("programs").update(row).eq("id", id);
    if (noCoOwnerColumn(res.error) && !row.co_owner_ids?.length) {
      delete row.co_owner_ids;
      res = await db().from("programs").update(row).eq("id", id);
    }
    check(res);
  },
  async deleteProgram(id) {
    if (!isUuid(id)) return;
    const paths = (check(await db().from("program_materials").select("file_path").eq("program_id", id)) as { file_path: string }[]).map((r) => r.file_path);
    // 자식 표부터 (외래 키에 cascade 가 없다)
    for (const t of ["draft_versions", "draft_jobs", "program_missing", "program_reminders", "survey_responses", "program_materials"]) {
      check(await db().from(t).delete().eq("program_id", id));
    }
    check(await db().from("programs").delete().eq("id", id));
    if (paths.length) await db().storage.from(BUCKET).remove(paths);
  },
  async listResponses(programId) {
    if (!isUuid(programId)) return [];
    return (check(await db().from("survey_responses").select("*").eq("program_id", programId)) as ResponseRow[]).map(toResponse);
  },
  async getResponse(programId, studentId) {
    if (!isUuid(programId) || !isUuid(studentId)) return null;
    const r = check(await db().from("survey_responses").select("*").eq("program_id", programId).eq("student_id", studentId).maybeSingle());
    return r ? toResponse(r as ResponseRow) : null;
  },
  async saveResponse(programId, studentId, answers, submit) {
    const now = new Date().toISOString();
    const row: Record<string, unknown> = { program_id: programId, student_id: studentId, answers, updated_at: now };
    if (submit) row.submitted_at = now;
    const r = check(await db().from("survey_responses").upsert(row, { onConflict: "program_id,student_id" }).select("*").single());
    return toResponse(r as ResponseRow);
  },
  async listMaterials(programId) {
    if (!isUuid(programId)) return [];
    return (check(await db().from("program_materials").select("*").eq("program_id", programId).order("created_at", { ascending: false })) as MaterialRow[]).map(toMaterial);
  },
  async listMaterialsByStudent(studentId) {
    if (!isUuid(studentId)) return [];
    return (check(await db().from("program_materials").select("*").eq("student_id", studentId)) as MaterialRow[]).map(toMaterial);
  },
  async getMaterial(id) {
    if (!isUuid(id)) return null;
    const r = check(await db().from("program_materials").select("*").eq("id", id).maybeSingle());
    return r ? toMaterial(r as MaterialRow) : null;
  },
  async addMaterial(m, bytes) {
    const id = crypto.randomUUID();
    const filePath = `${m.programId}/${id}`;
    const up = await db().storage.from(BUCKET).upload(filePath, bytes, { contentType: m.mime, upsert: false });
    if (up.error) throw new Error(`파일을 저장하지 못했어요 (${up.error.message})`);
    const r = check(await db().from("program_materials").insert({
      id, program_id: m.programId, student_id: m.studentId, file_name: m.fileName, mime: m.mime, size: m.size, pages: m.pages, file_path: filePath,
      status: m.status, matched_by: m.matchedBy, text: m.text, uploader_id: m.uploaderId,
    }).select("*").single());
    return toMaterial(r as MaterialRow);
  },
  async updateMaterial(id, p) {
    if (!isUuid(id)) return;
    const row: Partial<MaterialRow> = {};
    if (p.studentId !== undefined) row.student_id = p.studentId;
    if (p.status !== undefined) row.status = p.status;
    if (p.matchedBy !== undefined) row.matched_by = p.matchedBy;
    if (p.text !== undefined) row.text = p.text;
    if (p.pages !== undefined) row.pages = p.pages;
    check(await db().from("program_materials").update(row).eq("id", id));
  },
  async getMaterialFile(m) {
    const r = await db().storage.from(BUCKET).download(m.filePath);
    if (r.error || !r.data) return null;
    return new Uint8Array(await r.data.arrayBuffer());
  },
  async deleteMaterial(id) {
    if (!isUuid(id)) return null;
    const r = check(await db().from("program_materials").delete().eq("id", id).select("*").maybeSingle());
    if (!r) return null;
    const m = toMaterial(r as MaterialRow);
    // 행을 먼저 지운다 → 파일 보기는 바로 404. 저장소 실패는 로그만 (deleteProgram 과 같은 순서)
    const rm = await db().storage.from(BUCKET).remove([m.filePath]);
    if (rm.error) console.error("자료 파일을 저장소에서 지우지 못했어요", rm.error.message);
    return m;
  },
  async listMissingReasons(programId) {
    if (!isUuid(programId)) return {};
    const r = check(await db().from("program_missing").select("student_id, reason").eq("program_id", programId)) as { student_id: string; reason: string }[];
    return Object.fromEntries(r.map((x) => [x.student_id, x.reason]));
  },
  async setMissingReason(programId, studentId, reason, by) {
    if (!reason.trim()) {
      check(await db().from("program_missing").delete().eq("program_id", programId).eq("student_id", studentId));
      return;
    }
    check(await db().from("program_missing").upsert({ program_id: programId, student_id: studentId, reason: reason.trim(), set_by: by, set_at: new Date().toISOString() }));
  },
  async listDraftJobs(f) {
    const p = uuids(f.programIds);
    const s = uuids(f.studentIds);
    if ((p && !p.length) || (s && !s.length)) return [];
    const base = () => {
      let q = db().from("draft_jobs").select("*");
      if (p) q = q.in("program_id", p);
      if (f.states) q = q.in("state", f.states);
      return q;
    };
    if (s) return (await selectIn<JobRow>(s, (part) => base().in("student_id", part))).map(toJob);
    return (check(await base()) as JobRow[]).map(toJob);
  },
  async getDraftJob(id) {
    if (!isUuid(id)) return null;
    const r = check(await db().from("draft_jobs").select("*").eq("id", id).maybeSingle());
    return r ? toJob(r as JobRow) : null;
  },
  async ensureDraftJobs(programId, studentIds, len) {
    const ids = studentIds.filter(isUuid);
    if (!ids.length) return [];
    const rows = ids.map((sid) => ({ program_id: programId, student_id: sid, state: "PENDING", attempts: 0, unit: len.unit, max_len: len.max }));
    check(await db().from("draft_jobs").upsert(rows, { onConflict: "program_id,student_id", ignoreDuplicates: true }));
    return (await selectIn<JobRow>(ids, (part) => db().from("draft_jobs").select("*").eq("program_id", programId).in("student_id", part))).map(toJob);
  },
  async updateDraftJob(id, p) {
    if (!isUuid(id)) return;
    const row: Partial<JobRow> = { updated_at: new Date().toISOString() };
    if (p.state !== undefined) row.state = p.state;
    if (p.attempts !== undefined) row.attempts = p.attempts;
    if (p.error !== undefined) row.error = p.error;
    if (p.unit !== undefined) row.unit = p.unit;
    if (p.max !== undefined) row.max_len = p.max;
    if (p.manualRequestedAt !== undefined) row.manual_requested_at = p.manualRequestedAt;
    check(await db().from("draft_jobs").update(row).eq("id", id));
  },
  async listDraftVersions(f) {
    const p = uuids(f.programIds);
    const j = uuids(f.jobIds);
    const s = uuids(f.studentIds);
    if ((p && !p.length) || (j && !j.length) || (s && !s.length)) return [];
    const base = () => {
      let q = db().from("draft_versions").select("*").order("created_at");
      if (p) q = q.in("program_id", p);
      if (j && s) q = q.in("job_id", j);
      return q;
    };
    const byTime = (a: VersionRow, b: VersionRow) => a.created_at.localeCompare(b.created_at);
    if (s) return (await selectIn<VersionRow>(s, (part) => base().in("student_id", part), byTime)).map(toVersion);
    if (j) return (await selectIn<VersionRow>(j, (part) => base().in("job_id", part), byTime)).map(toVersion);
    return (check(await base()) as VersionRow[]).map(toVersion);
  },
  async addDraftVersion(v) {
    const r = check(await db().from("draft_versions").insert({
      job_id: v.jobId, program_id: v.programId, student_id: v.studentId, content: v.content, status: v.status, reason: v.reason, source: v.source, author_id: v.authorId,
    }).select("*").single());
    return toVersion(r as VersionRow);
  },
  async addReminder(r) {
    const row = check(await db().from("program_reminders").insert({
      program_id: r.programId, student_ids: r.studentIds.filter(isUuid), message: r.message, sender_id: r.senderId,
    }).select("*").single());
    return toReminder(row as ReminderRow);
  },
  async listReminders(f) {
    let q = db().from("program_reminders").select("*").order("created_at", { ascending: false });
    if (f.programId) { if (!isUuid(f.programId)) return []; q = q.eq("program_id", f.programId); }
    if (f.studentId) { if (!isUuid(f.studentId)) return []; q = q.contains("student_ids", [f.studentId]); }
    return (check(await q) as ReminderRow[]).map(toReminder);
  },
};

export const supabasePrograms: ProgramsRepo = withDerived(supabaseBase);
