"use server";
import { maskIdentity } from "@/lib/domain/program";
import type { Viewer } from "@/lib/domain/types";
import { answerUsage, makeDraft, MAKE_KINDS, type Answer, type MakeKind, type YeongrangRole } from "@/lib/server/ai/yeongrang";
import { repo } from "@/lib/server/repo";
import { getViewer, requireViewer } from "@/lib/server/viewer";

// 영랑이 서버 액션. 보내기 전에 학생 이름·학번을 가린다 (AI에는 가명만).

function roleOf(v: Viewer): YeongrangRole {
  if (v.kind === "student") return "student";
  if (v.teacher.roles.includes("admin")) return "admin";
  return v.teacher.roles.includes("homeroom") ? "homeroom" : "teacher";
}

async function mask(text: string) {
  const people = (await repo.listStudents()).map((s) => ({ name: s.name, studentNo: s.studentNo }));
  return maskIdentity(text, people);
}

export async function askYeongrang(question: string, history: { q: string; a: string }[]): Promise<Answer> {
  // 로그인 화면에서도 쓴다 → 로그인 전에는 로그인·가입 안내만
  const v = await getViewer();
  const q = question.trim().slice(0, 500);
  if (!q) return { text: "무엇이 궁금한지 적어 주세요.", source: null, href: null, ai: false };
  const a = await answerUsage(v ? await mask(q) : q, v ? roleOf(v) : "guest", history.slice(-3));
  if (v) await repo.audit(v.accountId, "yeongrang.ask", null);
  return a;
}

export async function makeWithYeongrang(kind: string, input: string): Promise<{ ok: true; text: string; ai: boolean } | { ok: false; error: string }> {
  const v = await requireViewer();
  if (v.kind === "student") return { ok: false, error: "학생은 사용법 문의만 쓸 수 있어요." };
  if (!MAKE_KINDS.includes(kind as MakeKind)) return { ok: false, error: "만들 글 종류를 골라 주세요." };
  const text = input.trim().slice(0, 3000);
  if (text.length < 5) return { ok: false, error: "내용을 조금 더 적어 주세요." };
  const r = await makeDraft(kind as MakeKind, await mask(text));
  await repo.audit(v.accountId, "yeongrang.make", kind);
  return r;
}
