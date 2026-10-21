"use server";
import { revalidatePath } from "next/cache";
import { matchImport, type ImportRow } from "@/lib/domain/texts-import";
import { readTemplateFile } from "@/lib/server/excel";
import { resolveScope, type ClassScopeInput } from "@/lib/server/class-scope";
import { can } from "@/lib/domain/policy";
import { parseTextsTab, TEXTS_TABS } from "@/lib/domain/texts-view";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";

// 글 모아 보기 (N49 (d)) 모두 복사 감사: 탭 · 숫자만 (이름 · 학번 · 글 없음).
export async function textsCopyLog(input: { tab: string; n: number }): Promise<void> {
  const v = await requireViewer();
  const tab = parseTextsTab(input?.tab);
  if (!can(v, tab === "setuk" ? "setuk.write" : tab === "logs" ? "logs.write" : "record.write")) return;
  const n = Math.max(0, Math.min(999, Math.floor(Number(input?.n) || 0)));
  await repo.audit(v.accountId, "texts.copy_all", `${TEXTS_TABS.find((t) => t.key === tab)!.label} n=${n}`);
}

// ---------- 갖고 있던 생기부 글 올리기 (N66): 엑셀 → 학생마다 임시 저장(새 버전) ----------


export type ImportPreview = { ok: true; rows: ImportRow[]; title: string; maxBytes: number } | { ok: false; error: string };

const scopeOf = (form: FormData): ClassScopeInput => (form.get("course")
  ? { kind: "setuk", courseId: String(form.get("course")), section: form.get("section") ? String(form.get("section")) : null }
  : { kind: "record", area: String(form.get("area") ?? ""), clubId: form.get("club") ? String(form.get("club")) : null });

/** 1단계: 생기부글_양식.xlsx 를 읽어 반 학생과 맞춰 보기만 (저장 안 함) */
export async function previewTextsImport(form: FormData): Promise<ImportPreview> {
  const v = await requireViewer();
  const r = await resolveScope(v, scopeOf(form));
  if (!r) return { ok: false, error: "내 담당 학생 범위가 아니에요" };
  const t = await readTemplateFile(form.get("file"), "records");
  if ("error" in t) return { ok: false, error: t.error };
  const current = new Map([...r.latest].map(([id, x]) => [id, x.content]));
  const rows = matchImport(t.body, r.students.map((s) => ({ id: s.id, studentNo: s.studentNo, name: s.name })), current, r.maxBytes);
  if (!rows.length) return { ok: false, error: "넣을 글이 없어요 · '생기부 글' 칸에 붙여 넣어 주세요" };
  return { ok: true, rows, title: r.title, maxBytes: r.maxBytes };
}

/** 2단계: 맞춘 줄만 임시 저장으로 넣는다 (추가만, C4 — 지금 글은 이전 버전으로 남음). 서버에서 다시 읽어 맞춘다 */
export async function applyTextsImport(form: FormData): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const v = await requireViewer();
  const r = await resolveScope(v, scopeOf(form));
  if (!r) return { ok: false, error: "내 담당 학생 범위가 아니에요" };
  const t = await readTemplateFile(form.get("file"), "records");
  if ("error" in t) return { ok: false, error: t.error };
  const current = new Map([...r.latest].map(([id, x]) => [id, x.content]));
  const rows = matchImport(t.body, r.students.map((s) => ({ id: s.id, studentNo: s.studentNo, name: s.name })), current, r.maxBytes).filter((x) => x.studentId);
  let added = 0;
  for (const x of rows) {
    if (r.kind === "setuk") await repo.addSetuk({ courseId: r.course!.id, studentId: x.studentId!, authorId: v.accountId, content: x.text, unit: "bytes", max: r.maxBytes, status: "draft" });
    else await repo.addRecordDraft({ area: r.areaKey as Exclude<typeof r.areaKey, "세특">, studentId: x.studentId!, authorId: v.accountId, year: r.year, semester: null, content: x.text, unit: "bytes", max: r.maxBytes, status: "draft" });
    added++;
  }
  await repo.audit(v.accountId, "texts.import", `${r.title} ${added}명`);
  revalidatePath("/teacher/texts");
  return { ok: true, added };
}
