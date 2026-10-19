"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { matchStudent, parseHours, servicePeriod, SERVICE_FILE_TYPES, SERVICE_MAX_BYTES } from "@/lib/domain/activity";
import { can, isAdmin } from "@/lib/domain/policy";
import { readServiceDoc } from "@/lib/server/ai/read-service-doc";
import { repo } from "@/lib/server/repo";
import { requireCan, requireViewer } from "@/lib/server/viewer";
import { cutServiceActivity, serviceActivityCheck } from "@/lib/domain/length";
import { scrubIdentity } from "@/lib/domain/writing";
import { aiEnabled, aiJson } from "@/lib/server/ai/claude";

/** 한 번에 읽고 보낼 수 있는 확인서 수 */
const MAX_FILES = 20;

type Picked = { bytes: Uint8Array; name: string; mime: string };

function checkFile(f: FormDataEntryValue): Picked | string | Promise<Picked> {
  if (!(f instanceof File) || f.size === 0) return "확인서 파일을 골라 주세요";
  if (!(SERVICE_FILE_TYPES as readonly string[]).includes(f.type)) return `${f.name}: PDF, JPG, PNG 파일만 올릴 수 있어요`;
  if (f.size > SERVICE_MAX_BYTES) return `${f.name}: 8MB까지 올릴 수 있어요`;
  return f.arrayBuffer().then((b) => ({ bytes: new Uint8Array(b), name: f.name, mime: f.type }));
}

async function readFiles(form: FormData): Promise<Picked[] | string> {
  const all = form.getAll("file");
  if (all.length === 0) return "확인서 파일을 골라 주세요";
  if (all.length > MAX_FILES) return `한 번에 ${MAX_FILES}개까지 올릴 수 있어요`;
  const out: Picked[] = [];
  for (const f of all) {
    const r = await checkFile(f);
    if (typeof r === "string") return r;
    out.push(r);
  }
  return out;
}

/** 확인 표의 한 줄. 단체 확인서는 학생마다 한 줄씩 나온다 */
export type ServiceRowDraft = {
  key: string;
  fileIndex: number;
  fileName: string;
  studentId: string | null;
  /** 명단에서 못 찾았을 때 확인서에 적힌 학번·이름 */
  studentHint: string | null;
  date: string | null;
  endDate: string | null;
  hours: number | null;
  organization: string;
  activity: string;
  /** 못 읽은 파일 */
  error: string | null;
};

export type ScanState = { error?: string; rows?: ServiceRowDraft[]; n?: number };

/**
 * AI로 확인서 여러 장 읽기 + 학생 자동 매칭 (학번 우선, 같은 이름이 한 명일 때 이름).
 * 저장하지 않는다. 교사가 표를 확인한 뒤 "모두 보내기"를 눌러야 저장된다 (C2).
 */
export async function scanServiceDocs(prev: ScanState, form: FormData): Promise<ScanState> {
  const v = await requireCan("service.upload");
  const n = (prev.n ?? 0) + 1;
  const files = await readFiles(form);
  if (typeof files === "string") return { error: files, n };
  const students = await repo.listStudents();
  const results = await Promise.all(files.map((f) => readServiceDoc(f.bytes, f.mime)));
  const rows: ServiceRowDraft[] = [];
  results.forEach((r, i) => {
    const base = { fileIndex: i, fileName: files[i].name };
    if (!r.ok) {
      rows.push({ ...base, key: `${i}-x`, studentId: null, studentHint: null, date: null, endDate: null, hours: null, organization: "", activity: "", error: r.error });
      return;
    }
    const f = r.fields;
    const period = servicePeriod(f.startDate, f.endDate);
    const people = f.students.length ? f.students : [{ studentName: null, studentNo: null, hours: null }];
    people.forEach((p, j) => {
      const s = matchStudent(students, { studentNo: p.studentNo, name: p.studentName });
      rows.push({
        ...base, key: `${i}-${j}`,
        studentId: s?.id ?? null,
        studentHint: s ? null : [p.studentNo, p.studentName].filter(Boolean).join(" ") || null,
        date: period?.date ?? null, endDate: period?.endDate ?? null,
        hours: parseHours(p.hours ?? f.hours),
        organization: f.organization ?? "", activity: f.activity ?? "", error: null,
      });
    });
  });
  const matched = rows.filter((r) => r.studentId).length;
  await repo.audit(v.accountId, "service.scan", `${files.length}개 · 자동 매칭 ${matched}/${rows.length}`);
  return { rows, n };
}

const Row = z.object({
  fileIndex: z.number().int().min(0),
  studentId: z.string().min(1, "학생을 골라 주세요"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "시작일을 골라 주세요"),
  endDate: z.string().optional().default(""),
  hours: z.union([z.string(), z.number()]),
  organization: z.string().trim().min(2, "기관을 써 주세요").max(60),
  activity: z.string().trim().min(2, "활동 내용을 써 주세요").max(200),
});

export type SendState = { error?: string; sent?: string; n?: number };

/** 확인한 줄을 저장하고 학생별 담임에게 보낸다. 한 줄이라도 틀리면 아무것도 저장하지 않는다 */
export async function sendServices(prev: SendState, form: FormData): Promise<SendState> {
  const v = await requireCan("service.upload");
  const n = (prev.n ?? 0) + 1;
  const files = await readFiles(form);
  if (typeof files === "string") return { error: files, n };
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("rows") ?? "[]"));
  } catch {
    return { error: "보낼 내용을 읽지 못했어요", n };
  }
  const parsed = z.array(Row).min(1, "보낼 확인서가 없어요").safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요", n };

  const students = new Map((await repo.listStudents()).map((s) => [s.id, s]));
  const ready = [];
  for (const [i, r] of parsed.data.entries()) {
    const s = students.get(r.studentId);
    const file = files[r.fileIndex];
    const hours = parseHours(r.hours);
    const period = servicePeriod(r.date, r.endDate);
    if (!s) return { error: `${i + 1}번째 줄: 학생을 골라 주세요`, n };
    if (!file) return { error: `${i + 1}번째 줄: 파일을 찾지 못했어요`, n };
    if (hours === null) return { error: `${i + 1}번째 줄(${s.name}): 봉사 시간을 확인해 주세요`, n };
    if (!period) return { error: `${i + 1}번째 줄(${s.name}): 기간을 확인해 주세요`, n };
    ready.push({ s, file, hours, period, r });
  }
  try {
    for (const { s, file, hours, period, r } of ready) {
      await repo.addServiceRecord(
        { studentId: s.id, uploaderId: v.accountId, ...period, hours, organization: r.organization, activity: r.activity, fileName: file.name.slice(0, 120), mime: file.mime },
        file.bytes,
      );
      await repo.audit(v.accountId, "service.send", `${s.pseudonymId} ${hours}시간`);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "저장하지 못했어요", n };
  }
  revalidatePath("/teacher/service");
  revalidatePath("/homeroom/service");
  const classes = new Set(ready.map((x) => `${x.s.grade}-${x.s.classNo}`)).size;
  return { sent: `${ready.length}건을 ${classes}개 반 담임 선생님께 보냈어요`, n };
}

// ---------- 봉사 활동내용 50자 (Figma N42 ④) ----------

export type ShortenResult = { ok: true; text: string; label: "AI" | "자동"; chars: number; bytes: number; over: boolean; notice?: string } | { ok: false; error: string };

/**
 * "✦ 줄이기": 활동내용을 50자(나이스 150B) 안으로 (Haiku). 활동내용 글만 보낸다 — 학생 id · 기관 · 날짜는 보내지 않고,
 * 글 속 이름·학번은 지운 뒤 보낸다(studentId 는 지우는 데만). 저장하지 않는다(넣기 · 바꾸고 확인을 눌러야 저장).
 */
export async function shortenServiceActivity(input: { text: string; studentId?: string | null }): Promise<ShortenResult> {
  const v = await requireViewer();
  if (!can(v, "service.upload") && !can(v, "service.receive")) return { ok: false, error: "권한이 없어요" };
  const raw = String(input?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (raw.length < 2) return { ok: false, error: "활동내용을 먼저 적어 주세요" };
  const s = input?.studentId ? await repo.getStudent(String(input.studentId)) : null;
  const clean = (s ? scrubIdentity(raw, s).text : raw).replace(/\b\d{5}\b/g, "").replace(/\s+/g, " ").trim();
  const before = serviceActivityCheck(raw).bytes;
  let text = "";
  let label: "AI" | "자동" = "자동";
  let notice: string | undefined;
  if (aiEnabled()) {
    const r = await aiJson(z.object({ text: z.string().max(120) }), {
      model: "fast", maxTokens: 300,
      system: "봉사활동 실적 활동내용을 50자(나이스 150바이트, 한글 3바이트 · 영문·숫자·공백 1바이트) 안으로 줄인다 · 받은 글에 있는 말과 사실만 쓴다 · 기관명·학생 이름·날짜·시간은 넣지 않는다 · ‘~함’으로 끝낸다 · 한 문장",
      content: `<활동내용>\n${clean}\n</활동내용>`,
    });
    if (r.ok) { text = r.data.text.replace(/\s+/g, " ").trim(); label = "AI"; } else notice = r.error;
  }
  if (!text) text = cutServiceActivity(clean);
  if (s) text = scrubIdentity(text, s).text;
  const c = serviceActivityCheck(text);
  if (c.over) notice = "아직 50자를 넘어요 · 더 줄여 주세요";
  if (label === "AI") await repo.audit(v.accountId, "service.ai.shorten", `bytes=${before}→${c.bytes}`);
  return { ok: true, text, label, ...c, notice };
}

/** 담임 반 학생의 확인 대기 확인서인지 (관리자는 모두) */
async function myWaitingService(v: Awaited<ReturnType<typeof requireCan>>, id: string) {
  const r = await repo.getServiceRecord(id);
  if (!r || r.status !== "sent") return null;
  const s = await repo.getStudent(r.studentId);
  const h = v.kind === "teacher" ? v.teacher.homeroom : null;
  const mine = !!s && !!h && h.grade === s.grade && h.classNo === s.classNo;
  return mine || isAdmin(v) ? { r, s } : null;
}

/** 받은함 "바꾸고 확인": 활동내용만 바꾸고(확인서 원문 파일은 그대로) 확인까지 한 번에 */
export async function updateServiceActivity(input: { id: string; activity: string; confirm?: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = await requireCan("service.receive");
  const activity = String(input?.activity ?? "").replace(/\s+/g, " ").trim();
  if (activity.length < 2 || activity.length > 200) return { ok: false, error: "활동내용을 2~200자로 써 주세요" };
  const t = await myWaitingService(v, String(input?.id ?? ""));
  if (!t) return { ok: false, error: "우리 반 확인 대기 확인서만 고칠 수 있어요" };
  if (!(await repo.updateServiceActivity(t.r.id, activity))) return { ok: false, error: "고치지 못했어요" };
  await repo.audit(v.accountId, "service.activity_edit", t.r.id);
  if (input.confirm !== false) {
    await repo.confirmService(t.r.id, v.accountId);
    await repo.audit(v.accountId, "service.confirm", t.s?.pseudonymId ?? null);
  }
  revalidatePath("/homeroom/service");
  revalidatePath("/teacher/service");
  return { ok: true };
}

/** 담임 확인 */
export async function confirmService(form: FormData) {
  const v = await requireCan("service.receive");
  const r = await repo.getServiceRecord(String(form.get("id") ?? ""));
  if (!r) return;
  const s = await repo.getStudent(r.studentId);
  const h = v.kind === "teacher" ? v.teacher.homeroom : null;
  const mine = !!s && !!h && h.grade === s.grade && h.classNo === s.classNo;
  if (!mine && !isAdmin(v)) return;
  await repo.confirmService(r.id, v.accountId);
  await repo.audit(v.accountId, "service.confirm", s?.pseudonymId ?? null);
  revalidatePath("/homeroom/service");
  revalidatePath("/teacher/service");
}
