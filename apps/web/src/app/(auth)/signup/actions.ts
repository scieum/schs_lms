"use server";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkSignup, normalizeTeacherName } from "@/lib/domain/accounts";
import { homePath } from "@/lib/domain/policy";
import { env } from "@/lib/server/env";
import { repo } from "@/lib/server/repo";
import { createSession } from "@/lib/server/session";
import { getViewer } from "@/lib/server/viewer";

// 인증코드 맞히기 시도 막기: 같은 주소에서 10분에 5번 틀리면 잠시 막는다 (서버 메모리 기준)
const CODE_FAILS = new Map<string, number[]>();
const WINDOW_MS = 10 * 60000;
const MAX_CODE_FAILS = 5;

async function clientKey() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

function recentFails(key: string, now: number) {
  const list = (CODE_FAILS.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  CODE_FAILS.set(key, list);
  return list;
}

export type SignupState = { error?: string } | undefined;

/** 교사 가입: 학교 인증코드가 맞아야 한다. 교사가 0명이면 첫 가입자가 관리자가 된다 (DB 함수가 한 번에 판정) */
export async function signup(_: SignupState, form: FormData): Promise<SignupState> {
  const input = {
    name: String(form.get("name") ?? ""),
    password: String(form.get("password") ?? ""),
    confirm: String(form.get("confirm") ?? ""),
    code: String(form.get("code") ?? ""),
  };
  if (input.password.length > 100) return { error: "비밀번호가 너무 길어요" };
  const key = await clientKey();
  const now = Date.now();
  if (recentFails(key, now).length >= MAX_CODE_FAILS) return { error: "인증코드를 여러 번 틀렸어요. 10분 뒤에 다시 해 주세요" };
  if (input.code.trim() !== env.initialAuthCode) {
    recentFails(key, now).push(now);
    return { error: "학교 인증코드가 맞지 않아요" };
  }
  const problem = checkSignup(input, env.initialAuthCode);
  if (problem) return { error: problem };
  const name = normalizeTeacherName(input.name);

  let created: { id: string; roles: string[] };
  try {
    created = await repo.adminRegisterTeacher(name, await bcrypt.hash(input.password, 10));
  } catch (e) {
    if (e instanceof Error && e.message === "duplicate_name") {
      return { error: "이미 가입한 이름이에요. 동명이인이면 '이서연2'처럼 구분해 주세요" };
    }
    return { error: "가입하지 못했어요. 잠시 뒤 다시 해 주세요" };
  }
  await repo.audit(created.id, created.roles.includes("admin") ? "teacher.signup.admin" : "teacher.signup", null);
  await createSession(created.id);
  const v = await getViewer();
  redirect(v ? homePath(v) : "/login");
}
