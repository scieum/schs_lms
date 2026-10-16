"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { matchStudent, parseHours, SERVICE_FILE_TYPES, SERVICE_MAX_BYTES } from "@/lib/domain/activity";
import { isAdmin } from "@/lib/domain/policy";
import { readServiceDoc } from "@/lib/server/ai/read-service-doc";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

async function readFile(form: FormData): Promise<{ bytes: Uint8Array; name: string; mime: string } | string> {
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) return "확인서 파일을 골라 주세요";
  if (!(SERVICE_FILE_TYPES as readonly string[]).includes(f.type)) return "PDF, JPG, PNG 파일만 올릴 수 있어요";
  if (f.size > SERVICE_MAX_BYTES) return "8MB까지 올릴 수 있어요";
  return { bytes: new Uint8Array(await f.arrayBuffer()), name: f.name, mime: f.type };
}

export type ScanState = {
  error?: string;
  /** 읽은 값. 학생은 학번·이름으로 찾아 id 로 넘긴다 */
  fields?: { studentId: string | null; studentHint: string | null; date: string | null; hours: number | null; organization: string | null; activity: string | null };
  n?: number;
};

/** AI로 확인서 읽기: 저장하지 않고 입력칸만 채운다 */
export async function scanServiceDoc(prev: ScanState, form: FormData): Promise<ScanState> {
  const v = await requireCan("service.upload");
  const file = await readFile(form);
  if (typeof file === "string") return { error: file };
  const r = await readServiceDoc(file.bytes, file.mime);
  await repo.audit(v.accountId, "service.scan", r.ok ? "읽음" : "실패");
  if (!r.ok) return { error: r.error };
  const s = matchStudent(await repo.listStudents(), { studentNo: r.fields.studentNo, name: r.fields.studentName });
  const date = r.fields.date && /^\d{4}-\d{2}-\d{2}$/.test(r.fields.date) ? r.fields.date : null;
  return {
    n: (prev.n ?? 0) + 1,
    fields: {
      studentId: s?.id ?? null,
      studentHint: s ? null : [r.fields.studentNo, r.fields.studentName].filter(Boolean).join(" ") || null,
      date,
      hours: parseHours(r.fields.hours),
      organization: r.fields.organization,
      activity: r.fields.activity,
    },
  };
}

const Schema = z.object({
  studentId: z.string().min(1, "학생을 골라 주세요"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 골라 주세요"),
  hours: z.string(),
  organization: z.string().trim().min(2, "기관을 써 주세요").max(60),
  activity: z.string().trim().min(2, "활동 내용을 써 주세요").max(200),
});

export type SendState = { error?: string; sent?: string; n?: number };

/** 확인서 저장 + 담임에게 보내기 */
export async function sendService(prev: SendState, form: FormData): Promise<SendState> {
  const v = await requireCan("service.upload");
  const p = Schema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const hours = parseHours(p.data.hours);
  if (hours === null) return { error: "봉사 시간은 0.5~24시간이에요" };
  const file = await readFile(form);
  if (typeof file === "string") return { error: file };
  const student = await repo.getStudent(p.data.studentId);
  if (!student) return { error: "학생을 찾지 못했어요" };

  try {
    await repo.addServiceRecord(
      { studentId: student.id, uploaderId: v.accountId, date: p.data.date, hours, organization: p.data.organization, activity: p.data.activity, fileName: file.name.slice(0, 120), mime: file.mime },
      file.bytes,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
  await repo.audit(v.accountId, "service.send", `${student.pseudonymId} ${hours}시간`);
  revalidatePath("/teacher/service");
  revalidatePath("/homeroom/service");
  return { sent: `${student.grade}학년 ${student.classNo}반 담임 선생님께 보냈어요`, n: (prev.n ?? 0) + 1 };
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
