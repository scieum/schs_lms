// 교사 가입·계정 관리·감사 로그 이상 표시 — 순수 규칙
import { checkNewPassword, PASSWORD_MESSAGES } from "./password";
import type { TeacherRole } from "./types";

/** 첫 가입자는 관리자. 이후 가입자는 일반 교사 (관리자가 계정 관리에서 역할을 바꾼다) */
export function signupRoles(teacherCount: number): { roles: TeacherRole[]; dept: string | null } {
  return teacherCount === 0 ? { roles: ["admin", "subject"], dept: "교육과정부" } : { roles: ["subject"], dept: null };
}

export const NAME_MIN = 2;
export const NAME_MAX = 20;

/** 교사 이름 = 로그인 ID. 한글·영문·공백만, 2~20자 */
export function normalizeTeacherName(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, " ");
}

export function checkTeacherName(name: string): string | null {
  if (name.length < NAME_MIN || name.length > NAME_MAX) return `이름은 ${NAME_MIN}~${NAME_MAX}자로 써 주세요`;
  if (!/^[가-힣a-zA-Z][가-힣a-zA-Z0-9 ]*$/.test(name)) return "이름은 한글·영문(동명이인은 숫자)만 써 주세요";
  return null;
}

export interface SignupInput {
  name: string;
  password: string;
  confirm: string;
  code: string;
}

/** 가입 입력 검사. 문제가 없으면 null */
export function checkSignup(input: SignupInput, initialCode: string): string | null {
  const nameErr = checkTeacherName(normalizeTeacherName(input.name));
  if (nameErr) return nameErr;
  if (input.code.trim() !== initialCode) return "학교 인증코드가 맞지 않아요";
  const p = checkNewPassword(input.password, input.confirm, initialCode);
  return p ? PASSWORD_MESSAGES[p] : null;
}

// ── 계정 상태 ──────────────────────────────────────────

export type AccountStatus = "활성" | "대기" | "잠김";

export function accountStatus(a: { mustChangePassword: boolean; lockedUntil: string | null }, now: Date): AccountStatus {
  if (a.lockedUntil && new Date(a.lockedUntil).getTime() > now.getTime()) return "잠김";
  if (a.mustChangePassword) return "대기";
  return "활성";
}

/** 관리자가 직접 잠글 때 쓰는 잠금 시각 (사실상 무기한, 잠금 해제로 푼다) */
export const MANUAL_LOCK_UNTIL = "9999-12-31T00:00:00.000Z";

export const STALE_DAYS = 90;

/** 오래 쓰지 않은 계정: 마지막 접속이 90일 이상 지났다 (접속 기록이 없으면 판단하지 않는다) */
export function isStale(lastLoginAt: string | null, now: Date, days = STALE_DAYS): boolean {
  if (!lastLoginAt) return false;
  return now.getTime() - new Date(lastLoginAt).getTime() >= days * 86400000;
}

const KST = 9 * 3600000;
const kstDay = (d: Date) => Math.floor((d.getTime() + KST) / 86400000);

/** 최근 접속 표시: 지금 · 오늘 08:12 · 어제 · N일 전 · 접속 없음 */
export function lastSeenLabel(lastLoginAt: string | null, now: Date): string {
  if (!lastLoginAt) return "접속 없음";
  const t = new Date(lastLoginAt);
  if (now.getTime() - t.getTime() < 5 * 60000) return "지금";
  const diff = kstDay(now) - kstDay(t);
  if (diff <= 0) {
    const k = new Date(t.getTime() + KST);
    return `오늘 ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
  }
  if (diff === 1) return "어제";
  return `${diff}일 전`;
}

// ── 역할 바꾸기 ────────────────────────────────────────

export const ROLE_LABEL: Record<TeacherRole, string> = { admin: "관리자", homeroom: "담임", subject: "교과", program: "프로그램" };

/** 담임 반이 있으면 homeroom 역할을 붙이고, 없으면 뗀다. 역할이 비면 교과 교사로 둔다 */
export function normalizeRoles(roles: TeacherRole[], homeroom: { grade: number; classNo: number } | null): TeacherRole[] {
  const set = new Set<TeacherRole>(roles.filter((r) => r !== "homeroom"));
  if (homeroom) set.add("homeroom");
  if (set.size === 0 || (set.size === 1 && set.has("admin"))) set.add("subject");
  const order: TeacherRole[] = ["admin", "homeroom", "subject", "program"];
  return order.filter((r) => set.has(r));
}

/** 역할 변경 검사: 마지막 관리자의 관리자 역할은 뺄 수 없다 */
export function checkRoleChange(
  teachers: { id: string; roles: TeacherRole[] }[],
  targetId: string,
  nextRoles: TeacherRole[],
): string | null {
  const target = teachers.find((t) => t.id === targetId);
  if (!target) return "없는 교사예요";
  const losingAdmin = target.roles.includes("admin") && !nextRoles.includes("admin");
  if (losingAdmin && teachers.filter((t) => t.roles.includes("admin")).length <= 1) {
    return "마지막 관리자라서 관리자 역할을 뺄 수 없어요";
  }
  return null;
}

/** 담임 반 겹침 검사: 다른 교사가 이미 맡은 반이면 이름을 돌려준다 */
export function homeroomTakenBy(
  teachers: { id: string; name: string; homeroom: { grade: number; classNo: number } | null }[],
  targetId: string,
  homeroom: { grade: number; classNo: number } | null,
): string | null {
  if (!homeroom) return null;
  const t = teachers.find((x) => x.id !== targetId && x.homeroom?.grade === homeroom.grade && x.homeroom.classNo === homeroom.classNo);
  return t?.name ?? null;
}

// ── 감사 로그: 기간·이상 표시 ─────────────────────────

export type AuditPeriod = "today" | "week" | "month";

/** 기간 시작 시각 (오늘 = 한국 시간 0시부터) */
export function periodStart(p: AuditPeriod, now: Date): Date {
  if (p === "today") return new Date(kstDay(now) * 86400000 - KST);
  return new Date(now.getTime() - (p === "week" ? 7 : 30) * 86400000);
}

/** 한국 날짜 머리: "10.16 (금)" */
export function kstDateLabel(iso: string): string {
  const k = new Date(new Date(iso).getTime() + KST);
  const w = "일월화수목금토"[k.getUTCDay()];
  return `${k.getUTCMonth() + 1}.${String(k.getUTCDate()).padStart(2, "0")} (${w})`;
}

export function kstTime(iso: string): string {
  const k = new Date(new Date(iso).getTime() + KST);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

export type AuditFlag = "대량 열람" | "야간 열람" | "잠김";

export const BULK_COUNT = 30;
const READ_LIKE = /view|read|export|download|열람/;

interface FlagEntry { id: string; actorId: string | null; action: string; target: string | null; at: string }

/**
 * 규칙으로 찾는 이상 접근:
 * - 대량 열람: 열람·내보내기 기록의 대상 수가 30건 이상, 또는 같은 사람이 10분 안에 30번 이상 열람
 * - 야간 열람: 한국 시간 22시~6시의 열람·내보내기
 * - 잠김: 로그인 5회 실패
 */
export function auditFlags(entries: FlagEntry[]): Map<string, AuditFlag> {
  const flags = new Map<string, AuditFlag>();
  const reads = entries.filter((e) => READ_LIKE.test(e.action)).sort((a, b) => a.at.localeCompare(b.at));
  for (const e of reads) {
    const n = Math.max(0, ...[...(e.target ?? "").matchAll(/(\d+)\s*(건|명|개)/g)].map((m) => Number(m[1])));
    if (n >= BULK_COUNT) flags.set(e.id, "대량 열람");
  }
  const byActor = new Map<string, FlagEntry[]>();
  for (const e of reads) if (e.actorId) byActor.set(e.actorId, [...(byActor.get(e.actorId) ?? []), e]);
  for (const list of byActor.values()) {
    let start = 0;
    for (let i = 0; i < list.length; i++) {
      while (new Date(list[i].at).getTime() - new Date(list[start].at).getTime() > 10 * 60000) start++;
      if (i - start + 1 >= BULK_COUNT) flags.set(list[i].id, "대량 열람");
    }
  }
  for (const e of reads) {
    if (flags.has(e.id)) continue;
    const h = new Date(new Date(e.at).getTime() + KST).getUTCHours();
    if (h >= 22 || h < 6) flags.set(e.id, "야간 열람");
  }
  for (const e of entries) if (e.action === "login.locked") flags.set(e.id, "잠김");
  return flags;
}

/** CSV 한 칸: 따옴표·쉼표·줄바꿈을 감싸고, 수식으로 읽히는 첫 글자(= + - @)를 막는다 */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
