import "server-only";
import { latestVersion, type Program } from "@/lib/domain/program";
import { dueDate, isDue, needsVisitRun, purgeAuditLine, termOf, type RetentionSettings, type TermEnds } from "@/lib/domain/retention";
import { repo } from "./repo";
import type { RetentionItem, RetentionRun, RetentionTrigger } from "./repo/modules/retention";

// 자료 보존 · 자동 파기 (Figma N39 ③). 규칙(지울 날)은 lib/domain/retention.ts, 여기는 모으고 지우기만.
// 지우는 것: 원본 파일(program-docs · service-docs) · 파일에서 읽은 글(program_materials.text).
// 확정 초안(draft_versions) · 세특·창체·행발 기록 · 봉사 기록(기관·시간) · 감사 로그는 건드리지 않는다.
// 기록·감사 로그에는 건수와 프로그램 이름만 — 학생 이름·학번·파일 이름은 남기지 않는다.

/** 자료 묶음: 프로그램 하나 또는 봉사 확인서 한 학기 */
export interface RetentionBundle {
  target: string;
  kind: "program" | "service";
  label: string;
  teacherId: string | null;
  refDate: string;
  /** 아직 남은 원본 파일 · 읽은 글 */
  files: number;
  texts: number;
  fileIds: string[];
  textIds: string[];
  rawDue: string | null;
  textDue: string | null;
  holdUntil: string | null;
  /** 이미 지운 원본 · 지운 때 */
  purgedFiles: number;
  purgedAt: string | null;
}

const semLabel = (refDate: string) => `${termOf(refDate).semester}학기`;

/** base=confirm 일 때: 초안이 모두 확정된 날 (아니면 null) */
async function confirmedAt(programId: string): Promise<string | null> {
  const [jobs, versions] = await Promise.all([repo.listDraftJobs({ programIds: [programId] }), repo.listDraftVersions({ programIds: [programId] })]);
  if (!jobs.length) return null;
  let last = "";
  for (const j of jobs) {
    const v = latestVersion(versions, j.id);
    if (!v || v.status !== "finalized") return null;
    if (v.createdAt > last) last = v.createdAt;
  }
  return last || null;
}

export async function loadRetentionBundles(): Promise<{ settings: RetentionSettings; termEnds: TermEnds; bundles: RetentionBundle[] }> {
  const [settings, termEnds, holds, programs, service] = await Promise.all([
    repo.getRetentionSettings(), repo.getTermEnds(), repo.listRetentionHolds(), repo.listPrograms(), repo.listServiceRecords({}),
  ]);
  const holdOf = new Map(holds.map((h) => [h.target, h.until]));
  const bundles: RetentionBundle[] = [];

  const mats = await Promise.all(programs.map((p) => repo.listMaterials(p.id)));
  for (const [i, p] of programs.entries()) {
    const list = mats[i];
    if (!list.length) continue;
    const ref = p.endDate;
    const holdUntil = holdOf.get(p.id) ?? null;
    const conf = settings.raw_files.base === "confirm" || settings.extracted_text.base === "confirm" ? await confirmedAt(p.id) : null;
    const files = list.filter((m) => !m.purgedAt && m.filePath);
    const texts = list.filter((m) => !m.textPurgedAt && m.text != null);
    const purged = list.filter((m) => m.purgedAt);
    bundles.push({
      target: p.id, kind: "program", label: `${p.title} · ${semLabel(ref)}`, teacherId: p.ownerId, refDate: ref,
      files: files.length, texts: texts.length, fileIds: files.map((m) => m.id), textIds: texts.map((m) => m.id),
      rawDue: dueDate({ refDate: ref, setting: settings.raw_files, termEnds, confirmedAt: conf, holdUntil }),
      textDue: dueDate({ refDate: ref, setting: settings.extracted_text, termEnds, confirmedAt: conf, holdUntil }),
      holdUntil, purgedFiles: purged.length, purgedAt: purged.reduce<string | null>((m, x) => (x.purgedAt && (!m || x.purgedAt > m) ? x.purgedAt : m), null),
    });
  }

  // 봉사 확인서: 봉사 날짜의 학기로 묶는다 (기준이 '초안 확정'이면 학기 마감 후 날 수로 본다)
  const byTerm = new Map<string, typeof service>();
  for (const r of service) {
    const t = termOf(r.date);
    const k = `service:${t.year}-${t.semester}`;
    if (!byTerm.has(k)) byTerm.set(k, []);
    byTerm.get(k)!.push(r);
  }
  for (const [target, list] of byTerm) {
    const ref = list[0].date;
    const holdUntil = holdOf.get(target) ?? null;
    const setting = settings.raw_files.base === "confirm" ? { base: "term_end" as const, days: settings.raw_files.days } : settings.raw_files;
    const files = list.filter((r) => !r.purgedAt && r.filePath);
    const purged = list.filter((r) => r.purgedAt);
    bundles.push({
      target, kind: "service", label: `봉사 확인서 · ${semLabel(ref)}`, teacherId: null, refDate: ref,
      files: files.length, texts: 0, fileIds: files.map((r) => r.id), textIds: [],
      rawDue: dueDate({ refDate: ref, setting, termEnds, holdUntil }), textDue: null,
      holdUntil, purgedFiles: purged.length, purgedAt: purged.reduce<string | null>((m, x) => (x.purgedAt && (!m || x.purgedAt > m) ? x.purgedAt : m), null),
    });
  }
  return { settings, termEnds, bundles };
}

/** 이 묶음의 다음 파기: 원본이 남았으면 원본 날, 아니면 읽은 글 날 */
export function nextDue(b: RetentionBundle): { due: string | null; textOnly: boolean } | null {
  if (b.files) return { due: b.rawDue, textOnly: false };
  if (b.texts) return { due: b.textDue, textOnly: true };
  return null;
}

/** 지울 날이 지난 원본·읽은 글을 지운다. 실행 기록(retention_runs) 1줄 + 지운 게 있으면 감사 로그(건수만) */
export async function runRetentionSweep(trigger: RetentionTrigger, actorId: string | null, today: string): Promise<RetentionRun> {
  const { bundles } = await loadRetentionBundles();
  const items: RetentionItem[] = [];
  for (const b of bundles) {
    let files = 0;
    let texts = 0;
    if (b.files && isDue(b.rawDue, today)) files = b.kind === "program" ? await repo.purgeMaterialFiles(b.fileIds) : await repo.purgeServiceFiles(b.fileIds);
    if (b.texts && isDue(b.textDue, today)) texts = await repo.purgeMaterialTexts(b.textIds);
    if (files || texts) items.push({ label: b.label, files, texts });
  }
  const sum = { programs: items.length, files: items.reduce((n, x) => n + x.files, 0), texts: items.reduce((n, x) => n + x.texts, 0) };
  const run = await repo.addRetentionRun({ trigger, actorId, items, ...sum });
  if (items.length) await repo.audit(actorId, "retention.purge", `${purgeAuditLine(sum)} (${trigger === "cron" ? "자동" : trigger === "visit" ? "자동·화면" : "관리자"})`);
  return run;
}

/** 관리자가 /admin/retention 을 열 때: 마지막 실행이 24시간 넘었으면 한 번 돌린다 (크론이 빠져도) */
export async function sweepIfStale(actorId: string, today: string, now = new Date()): Promise<RetentionRun | null> {
  const [last] = await repo.listRetentionRuns(1);
  if (!needsVisitRun(last?.ranAt ?? null, now)) return null;
  try {
    return await runRetentionSweep("visit", actorId, today);
  } catch (e) {
    console.error("자료 보존 확인을 못 했어요", e instanceof Error ? e.message : e);
    return null;
  }
}

/** 교사 화면 안내용: 이 프로그램 자료가 지워지는 날 */
export async function programRetention(p: Pick<Program, "id" | "endDate">): Promise<{ rawDue: string | null; textDue: string | null; settings: RetentionSettings; termEnds: TermEnds }> {
  const [settings, termEnds, holds] = await Promise.all([repo.getRetentionSettings(), repo.getTermEnds(), repo.listRetentionHolds()]);
  const holdUntil = holds.find((h) => h.target === p.id)?.until ?? null;
  const conf = settings.raw_files.base === "confirm" || settings.extracted_text.base === "confirm" ? await confirmedAt(p.id) : null;
  return {
    rawDue: dueDate({ refDate: p.endDate, setting: settings.raw_files, termEnds, confirmedAt: conf, holdUntil }),
    textDue: dueDate({ refDate: p.endDate, setting: settings.extracted_text, termEnds, confirmedAt: conf, holdUntil }),
    settings, termEnds,
  };
}
