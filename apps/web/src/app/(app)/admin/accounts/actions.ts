"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  checkRoleChange, checkRoster, checkTeacherName, homeroomTakenBy, isStale, MANUAL_LOCK_UNTIL, normalizeRoles, normalizeTeacherName, teacherRows,
  type RosterRow,
} from "@/lib/domain/accounts";
import type { TeacherRole } from "@/lib/domain/types";
import { env } from "@/lib/server/env";
import { readTemplateFile } from "@/lib/server/excel";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export type AccountFormState = { error?: string; done?: string };

/** 감사 로그 대상: 학생은 가명ID, 교사는 계정 id (이름 X) */
async function auditTarget(id: string): Promise<string> {
  const s = await repo.getStudent(id);
  return s ? s.pseudonymId : id;
}

/** 비밀번호 초기화: 인증코드로 되돌리고, 다음 로그인 때 바꾸게 하고, 잠금도 푼다 */
export async function resetPassword(form: FormData) {
  const v = await requireCan("account.manage");
  const id = String(form.get("id") ?? "");
  const a = await repo.getAccount(id);
  if (!a) return;
  await repo.updateAccount(id, { passwordHash: await bcrypt.hash(env.initialAuthCode, 10), mustChangePassword: true, failedCount: 0, lockedUntil: null });
  await repo.audit(v.accountId, "account.reset", await auditTarget(id));
  revalidatePath("/admin/accounts");
}

export async function unlockAccount(form: FormData) {
  const v = await requireCan("account.manage");
  const id = String(form.get("id") ?? "");
  const a = await repo.getAccount(id);
  if (!a) return;
  await repo.updateAccount(id, { failedCount: 0, lockedUntil: null });
  await repo.audit(v.accountId, "account.unlock", await auditTarget(id));
  revalidatePath("/admin/accounts");
}

/** 오래 쓰지 않은 계정 잠그기: 화면에서 목록을 확인한 뒤 누른다. 서버에서 다시 골라서 잠근다 (나 자신 제외) */
export async function lockStaleAccounts() {
  const v = await requireCan("account.manage");
  const now = new Date();
  const list = (await repo.adminListAccounts()).filter(
    (a) => a.id !== v.accountId && isStale(a.lastLoginAt, now) && !(a.lockedUntil && new Date(a.lockedUntil) > now),
  );
  for (const a of list) await repo.updateAccount(a.id, { lockedUntil: MANUAL_LOCK_UNTIL });
  await repo.audit(v.accountId, "account.lock", `오래 쓰지 않은 계정 ${list.length}개`);
  revalidatePath("/admin/accounts");
  redirect("/admin/accounts?f=locked");
}

const ROLES = ["admin", "subject", "program"] as const;

const TeacherSchema = z.object({
  dept: z.string().trim().max(20, "부서는 20자까지"),
  hg: z.coerce.number().int().min(0).max(3),
  hc: z.coerce.number().int().min(0).max(20),
});

function readTeacherForm(form: FormData) {
  const p = TeacherSchema.safeParse({ dept: form.get("dept") ?? "", hg: form.get("hg") ?? 0, hc: form.get("hc") ?? 0 });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" } as const;
  const { dept, hg, hc } = p.data;
  if ((hg === 0) !== (hc === 0)) return { error: "담임 반은 학년과 반을 함께 골라 주세요" } as const;
  const homeroom = hg && hc ? { grade: hg, classNo: hc } : null;
  const picked = form.getAll("roles").map(String).filter((r): r is (typeof ROLES)[number] => (ROLES as readonly string[]).includes(r));
  return { dept: dept || null, homeroom, roles: normalizeRoles(picked as TeacherRole[], homeroom) } as const;
}

/** 교사 한 명 추가: 인증코드로 첫 로그인 → 비밀번호 변경 */
export async function createTeacher(_: AccountFormState, form: FormData): Promise<AccountFormState> {
  const v = await requireCan("account.manage");
  const name = normalizeTeacherName(String(form.get("name") ?? ""));
  const nameErr = checkTeacherName(name);
  if (nameErr) return { error: nameErr };
  const t = readTeacherForm(form);
  if ("error" in t) return { error: t.error };
  const taken = homeroomTakenBy(await repo.listTeachers(), "", t.homeroom);
  if (taken) return { error: `${t.homeroom!.grade}학년 ${t.homeroom!.classNo}반은 ${taken} 선생님이 담임이에요` };

  let id: string;
  try {
    id = await repo.adminCreateTeacher({ name, passwordHash: await bcrypt.hash(env.initialAuthCode, 10), ...t });
  } catch (e) {
    return { error: e instanceof Error && e.message === "duplicate_name" ? "이미 있는 이름이에요" : "추가하지 못했어요" };
  }
  await repo.audit(v.accountId, "account.create", id);
  revalidatePath("/admin/accounts");
  return { done: `${name} 선생님을 추가했어요 · 첫 로그인은 학교 인증코드로` };
}

/** 교사 역할·담임 반·부서 바꾸기. 마지막 관리자는 관리자 역할을 뺄 수 없다 */
export async function updateTeacher(_: AccountFormState, form: FormData): Promise<AccountFormState> {
  const v = await requireCan("account.manage");
  const id = String(form.get("id") ?? "");
  const teachers = await repo.listTeachers();
  const t = readTeacherForm(form);
  if ("error" in t) return { error: t.error };
  const roleErr = checkRoleChange(teachers, id, t.roles);
  if (roleErr) return { error: roleErr };
  const taken = homeroomTakenBy(teachers, id, t.homeroom);
  if (taken) return { error: `${t.homeroom!.grade}학년 ${t.homeroom!.classNo}반은 ${taken} 선생님이 담임이에요` };

  await repo.adminUpdateTeacher(id, t);
  await repo.audit(v.accountId, "account.roles", `${id} ${t.roles.join(",")}`);
  revalidatePath("/admin/accounts");
  revalidatePath(`/admin/accounts/${id}`);
  return { done: "저장했어요" };
}

// ---------------------------------------------------------------- 교사 명부 양식 → 일괄 추가 (Figma N25, AI 없음)

export type RosterPreview = { ok: true; fileName: string; rows: RosterRow[] } | { ok: false; error: string; fileName?: string };

/** 명부 읽기: 교사명부_양식.xlsx 만 읽는다. 저장하지 않는다 */
export async function previewRoster(form: FormData): Promise<RosterPreview> {
  await requireCan("account.manage");
  const f = form.get("file");
  const fileName = f instanceof File ? f.name : undefined;
  const r = await readTemplateFile(f, "teacher");
  if ("error" in r) return { ok: false, error: r.error, fileName };
  const rows = teacherRows(r.body, await repo.listTeachers());
  return rows.length ? { ok: true, fileName: fileName ?? "", rows } : { ok: false, error: "교사 줄이 없어요. 2행부터 적어 주세요", fileName };
}

const BulkSchema = z.array(z.object({
  line: z.number().int(),
  name: z.string().max(40),
  dept: z.string().max(40).nullable(),
  homeroom: z.object({ grade: z.number().int().min(1).max(3), classNo: z.number().int().min(1).max(20) }).nullable(),
})).max(100);

export type BulkState = { error?: string; done?: string; failed?: string[] };

/** 확인 후 추가: 미리보기에서 고른 줄을 서버에서 다시 검사하고 만든다. 첫 로그인은 학교 인증코드 */
export async function createTeachersBulk(_: BulkState, form: FormData): Promise<BulkState> {
  const v = await requireCan("account.manage");
  let input: z.infer<typeof BulkSchema>;
  try {
    input = BulkSchema.parse(JSON.parse(String(form.get("rows") ?? "[]")));
  } catch {
    return { error: "명부를 다시 읽어 주세요" };
  }
  if (!input.length) return { error: "추가할 교사를 골라 주세요" };
  const rows = checkRoster(input, await repo.listTeachers());
  const hash = await bcrypt.hash(env.initialAuthCode, 10);
  let made = 0;
  const failed: string[] = rows.filter((r) => r.error).map((r) => `${r.name || `${r.line}줄`}: ${r.error}`);
  for (const r of rows.filter((x) => !x.error)) {
    try {
      const id = await repo.adminCreateTeacher({ name: r.name, passwordHash: hash, dept: r.dept, homeroom: r.homeroom, roles: normalizeRoles(["subject"], r.homeroom) });
      await repo.audit(v.accountId, "account.create", id);
      made++;
    } catch (e) {
      failed.push(`${r.name}: ${e instanceof Error && e.message === "duplicate_name" ? "이미 있는 이름이에요" : "추가하지 못했어요"}`);
    }
  }
  revalidatePath("/admin/accounts");
  return { done: made ? `${made}명을 추가했어요 · 첫 로그인은 학교 인증코드로` : undefined, failed, error: made ? undefined : "추가한 교사가 없어요" };
}
