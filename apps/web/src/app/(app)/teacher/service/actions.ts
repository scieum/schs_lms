"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { matchStudent, parseHours, servicePeriod, SERVICE_FILE_TYPES, SERVICE_MAX_BYTES } from "@/lib/domain/activity";
import { isAdmin } from "@/lib/domain/policy";
import { readServiceDoc } from "@/lib/server/ai/read-service-doc";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

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
