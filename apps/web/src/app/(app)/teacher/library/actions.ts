"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  areaCounts, isLibraryArea, LIBRARY_AREAS, LIBRARY_SOURCES, LIBRARY_TEXT_MAX, LIBRARY_TEXT_MIN, normalizeTags, stripIdentity, tagCounts,
  type LibraryArea, type LibraryEntry, type LibrarySort,
} from "@/lib/domain/library";
import { scrubIdentity } from "@/lib/domain/writing";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { addSetukPiece } from "../setuk/actions";
import { addRecordPiece } from "../write/actions";

// 문장 보관함 (Figma N35 ②): 교사 개인. 학생 id 는 이름·학번을 지우는 데만 쓰고 저장하지 않는다.
// 서버에서 다시 지운다(클라이언트 값을 믿지 않음). 감사 로그에는 보관 문장 id 만.

/** 학번처럼 보이는 다섯 자리 숫자 · 이 학생 이름·학번을 지운 글 */
async function clean(text: string, studentId?: string | null): Promise<string> {
  let t = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (studentId) {
    const s = await repo.getStudent(studentId);
    if (s) t = stripIdentity(scrubIdentity(t, s).text, [s.name], [s.studentNo]).text;
  }
  return stripIdentity(t.replace(/(?<!\d)\d{5}(?!\d)/g, ""), []).text;
}

const SaveSchema = z.object({
  text: z.string().max(4000),
  area: z.enum(LIBRARY_AREAS),
  subject: z.string().max(40).nullish(),
  tags: z.array(z.string()).max(20).default([]),
  source: z.enum(LIBRARY_SOURCES).default("body"),
  studentId: z.string().nullish(),
});

export type SaveSentenceResult = { ok: true; entry: LibraryEntry; total: number } | { ok: false; error: string };

export async function saveSentence(input: z.input<typeof SaveSchema>): Promise<SaveSentenceResult> {
  const v = await requireCan("record.write");
  const p = SaveSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "입력을 확인해 주세요" };
  const text = await clean(p.data.text, p.data.studentId);
  if (text.length < LIBRARY_TEXT_MIN) return { ok: false, error: "이름·학번을 빼면 남는 글이 없어요" };
  if (text.length > LIBRARY_TEXT_MAX) return { ok: false, error: `${LIBRARY_TEXT_MAX}자까지 보관할 수 있어요` };
  try {
    const entry = await repo.addSentence({
      ownerId: v.accountId, area: p.data.area, subject: p.data.area === "세특" ? (p.data.subject ?? "").trim().slice(0, 40) || null : null,
      text, tags: normalizeTags(p.data.tags), source: p.data.source,
    });
    await repo.audit(v.accountId, "library.add", entry.id);
    revalidatePath("/teacher/library");
    return { ok: true, entry, total: (await repo.listSentences(v.accountId)).length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "보관하지 못했어요" };
  }
}

export type LibraryList = { entries: LibraryEntry[]; total: number; areas: Record<LibraryArea, number>; tags: { tag: string; n: number }[] };

/** 내 보관함 (찾기 · 영역 · 태그 · 정렬은 화면에서도 다시 거른다) */
export async function listSentences(input: { q?: string; area?: string | null; tag?: string | null; sort?: LibrarySort } = {}): Promise<LibraryList> {
  const v = await requireCan("record.write");
  const all = await repo.listSentences(v.accountId);
  const area = isLibraryArea(input.area) ? input.area : null;
  const sort: LibrarySort = input.sort === "used" || input.sort === "abc" ? input.sort : "recent";
  const entries = await repo.listSentences(v.accountId, { q: String(input.q ?? "").slice(0, 60), area, tag: input.tag ? String(input.tag).slice(0, 20) : null, sort });
  return { entries, total: all.length, areas: areaCounts(all), tags: tagCounts(all) };
}

export async function updateSentence(input: { id: string; text?: string; tags?: string[] }): Promise<{ ok: true; entry: LibraryEntry } | { ok: false; error: string }> {
  const v = await requireCan("record.write");
  const patch: { text?: string; tags?: string[] } = {};
  if (input.text !== undefined) {
    const t = await clean(String(input.text).slice(0, 4000));
    if (t.length < LIBRARY_TEXT_MIN || t.length > LIBRARY_TEXT_MAX) return { ok: false, error: `${LIBRARY_TEXT_MIN}~${LIBRARY_TEXT_MAX}자로 써 주세요` };
    patch.text = t;
  }
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
  try {
    const e = await repo.updateSentence(v.accountId, String(input.id ?? ""), patch);
    if (!e) return { ok: false, error: "보관 문장을 찾지 못했어요" };
    revalidatePath("/teacher/library");
    return { ok: true, entry: e };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "고치지 못했어요" };
  }
}

export async function removeSentence(input: { id: string }): Promise<{ deleted?: number; error?: string }> {
  const v = await requireCan("record.write");
  try {
    const ok = await repo.removeSentence(v.accountId, String(input?.id ?? ""));
    if (!ok) return { error: "보관 문장을 찾지 못했어요" };
    await repo.audit(v.accountId, "library.remove", String(input.id));
    revalidatePath("/teacher/library");
    return { deleted: 1 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "지우지 못했어요" };
  }
}

/** 본문에 넣기: 많이 넣은 순을 위해 +1 하고 글을 돌려준다 (넣기는 화면에서) */
export async function takeSentence(input: { id: string }): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const v = await requireCan("record.write");
  const e = (await repo.listSentences(v.accountId)).find((x) => x.id === input?.id);
  if (!e) return { ok: false, error: "보관 문장을 찾지 못했어요" };
  await repo.bumpSentence(v.accountId, e.id);
  return { ok: true, text: e.text };
}

export type PieceTarget = { kind: "setuk"; courseId: string; studentId: string } | { kind: "record"; area: string; studentId: string; clubId?: string | null };

/** 조각으로 넣기: ① 조각 목록에 출처 "보관함"으로 (권한은 각 조각 액션이 다시 확인) */
export async function pieceFromLibrary(input: { id: string; target: PieceTarget }): Promise<{ error?: string }> {
  const v = await requireCan("record.write");
  const e = (await repo.listSentences(v.accountId)).find((x) => x.id === input?.id);
  if (!e) return { error: "보관 문장을 찾지 못했어요" };
  const t = input.target;
  const r = t?.kind === "setuk"
    ? await addSetukPiece({ courseId: t.courseId, studentId: t.studentId, text: e.text, activity: "", kind: "library" })
    : t?.kind === "record"
      ? await addRecordPiece({ area: t.area, studentId: t.studentId, clubId: t.clubId, text: e.text, activity: "", kind: "library" })
      : { error: "넣을 곳을 찾지 못했어요" };
  if (!r.error) await repo.bumpSentence(v.accountId, e.id);
  return r;
}
