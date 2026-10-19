import "server-only";
import type { MergePiece } from "@/lib/domain/merge";
import { maskIdentity, usesDocs, usesMemos, usesSurvey, type Material, type Program, type SurveyResponse } from "@/lib/domain/program";
import {
  alignSentences, buildOriginalSentences, editRatio, guessSentences, noSourceSentences, parsePins, pinsFrom, sourceKey,
  type OriginalView, type Pin, type ProvenanceSettings, type RecordProv, type SourceItem, type SourceType,
} from "@/lib/domain/provenance";
import { repo } from "./repo";
import type { AiOriginalKind } from "./repo/modules/provenance";

// 문장 근거 · AI 원안 (Figma N38) 서버 쪽: 근거 표(pool) 만들기 · AI 원안 저장 · 저장/확정 때 다시 계산 · 감사 한 줄.
// AI에는 근거를 [S1] 같은 짧은 표지로만 보낸다 — 표지 ↔ 실제 id 표는 서버에만 있다 (DB id · 이름 · 학번을 보내지 않음).

const short = (s: string, n = 8) => {
  const t = s.replace(/^\[[^\]]*\]\s*/, "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const mdy = (d: string | null) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");
const md = (d: string | null) => (d ? `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : "");

/** 조각(합치기 조각 · 메모 · 누가기록 · 특색 활동) → 근거 표. 지금 본문 조각은 근거가 아니라 교사 글(own) */
/** 조각 → 근거 key (piecesPool 과 같은 규칙). 지금 본문 조각은 "body" */
export function pieceKey(p: Pick<MergePiece, "id" | "source">): string {
  if (p.id === "body") return "body";
  const { type, ref } = pieceRef(p);
  return sourceKey({ type, ref });
}
function pieceRef(p: Pick<MergePiece, "id" | "source">): { type: SourceType; ref: string } {
  const m = p.id.match(/^(memo|log|program)-(.+)$/);
  const ref = m ? m[2] : p.id;
  return { type: p.source === "공통 활동" ? "common" : m?.[1] === "log" ? "log" : "piece", ref };
}

export function piecesPool(pieces: MergePiece[], context?: string): SourceItem[] {
  return pieces.flatMap((p): SourceItem[] => {
    if (p.id === "body") return [];
    const { type, ref } = pieceRef(p);
    const kind = p.source === "메모" ? "조각" : p.source === "누가기록" ? "누가기록" : p.source;
    const chip = type === "log" ? `누가 ${mdy(p.date)}` : type === "common" ? `공통 · ${short(p.text)}` : p.source === "특색 활동" ? `특색 · ${short(p.text)}` : `조각 · ${short(p.text)}`;
    const where = [type === "log" ? md(p.date) : mdy(p.date), type === "log" ? context : p.source === "메모" ? "메모" : p.source].filter(Boolean).join(" · ");
    return [{ type, ref, key: sourceKey({ type, ref }), kind, where, chip, text: p.text }];
  });
}

/** 초안 검토(프로그램) 근거 표: 설문 문항 답 · 연결된 서류 · 교사 관찰 메모(N41) (이름·학번 가림) */
export function draftPool(
  program: Pick<Program, "source" | "questions" | "useMemos">, response: Pick<SurveyResponse, "answers" | "submittedAt"> | null | undefined, materials: Material[],
  people: { name: string; studentNo: string }[], memo?: { id: string; content: string; createdAt: string } | null,
): SourceItem[] {
  const out: SourceItem[] = [];
  if (usesSurvey(program.source) && response?.submittedAt) {
    program.questions.forEach((q, i) => {
      const a = (response.answers[q.id] ?? "").trim();
      if (!a) return;
      const qn = `Q${i + 1}`;
      out.push({ type: "survey", ref: q.id, q: qn, key: sourceKey({ type: "survey", ref: q.id, q: qn }), kind: "설문", where: q.fixed ? q.title : q.prompt || q.title, chip: `설문 ${qn}`, text: maskIdentity(a, people) });
    });
  }
  if (usesDocs(program.source)) {
    for (const m of materials) {
      if (m.status !== "matched") continue;
      const name = m.fileName.length > 14 ? `${m.fileName.slice(0, 12)}…` : m.fileName;
      out.push({ type: "file", ref: m.id, key: sourceKey({ type: "file", ref: m.id }), kind: "파일", where: `${m.fileName}${m.pages ? ` · ${m.pages}쪽` : ""}`, chip: name, text: maskIdentity(m.text ?? "", people) });
    }
  }
  if (usesMemos(program) && memo?.content.trim()) {
    out.push({ type: "memo", ref: memo.id, key: sourceKey({ type: "memo", ref: memo.id }), kind: "교사 메모", where: `${md(memo.createdAt.slice(0, 10))} 관찰 메모`, chip: "교사 메모", text: maskIdentity(memo.content.trim(), people) });
  }
  return out;
}

/**
 * AI 원안을 한 번 저장한다 (추가만). aiSentences 가 없으면(예시 초안 · AI 꺼짐) 규칙으로 근거를 붙인다.
 * 화면에는 원안과, 원안이 쓰는 근거 카드(새로 생긴 조각 포함)를 돌려준다.
 */
export async function saveOriginal(input: {
  kind: AiOriginalKind; studentId: string; scope: string | null; text: string;
  aiSentences?: { text: string; keys: string[] }[] | null; pool: SourceItem[]; model: string | null; ownKeys?: string[];
}): Promise<{ original: OriginalView; sources: SourceItem[] } | null> {
  const text = input.text.trim();
  if (!text) return null;
  const settings = await repo.getProvenanceSettings();
  const map = new Map(input.pool.map((p) => [p.key, p]));
  if (input.ownKeys) for (const k of input.ownKeys) if (!map.has(k)) map.set(k, { type: "piece", ref: k, key: k, kind: "본문", where: "", chip: "", text: "" });
  const sentences = input.aiSentences?.length
    ? buildOriginalSentences(text, input.aiSentences, map, { ownKeys: input.ownKeys, min: settings.sourceMatchMin })
    : guessSentences(text, input.pool, input.ownKeys);
  const row = await repo.addAiOriginal({ kind: input.kind, studentId: input.studentId, scope: input.scope, content: text, sentences, model: input.model });
  if (!row) return null;
  const used = new Set(sentences.flatMap((s) => s.sources.map(sourceKey)));
  return { original: { id: row.id, content: row.content, createdAt: row.createdAt, sentences: row.sentences }, sources: input.pool.filter((p) => used.has(p.key)) };
}

/** 화면에 내릴 원안 · 교사가 정한 문장 (기록의 ai_original_id 가 없으면 null) */
export async function provView(rec: (RecordProv & { content: string; studentId: string }) | null | undefined): Promise<{ original: OriginalView | null; pins: Pin[] }> {
  if (!rec?.aiOriginalId) return { original: null, pins: [] };
  const o = await repo.getAiOriginal(rec.aiOriginalId);
  if (!o || o.studentId !== rec.studentId) return { original: null, pins: [] };
  return { original: { id: o.id, content: o.content, createdAt: o.createdAt, sentences: o.sentences }, pins: pinsFrom(rec.content, rec.sentenceSources) };
}

/** 지금 글의 근거 없는 문장 (반 전체 검사 · 목록) — 원안이 없으면 undefined (검사 행 자체를 돌리지 않음) */
export function provCheck(original: { content: string; sentences: OriginalView["sentences"] } | null | undefined, text: string, pins: Pin[], settings: ProvenanceSettings) {
  if (!original) return undefined;
  const list = alignSentences(original, text, pins, settings.sourceMatchMin);
  return { nosource: noSourceSentences(list).map((s) => ({ i: s.i, start: s.start, end: s.end })) };
}

export type SaveProv = { prov: RecordProv; ratio: number | null; nosource: number; low: boolean; needReason: boolean };

/**
 * 저장·확정 때: 서버가 원안을 다시 읽어 문장 근거 · 수정 비율을 다시 계산한다 (화면 값을 믿지 않음).
 * 확정 · 수정 비율 < 기준 · 까닭이 비었으면 needReason (확인 창). 원안이 없으면(직접 쓴 글 · 0022 전) N38 칸 없이.
 */
export async function provForSave(input: { aiOriginalId: string | null | undefined; pins: unknown; content: string; studentId: string; confirm: boolean; reason: string }): Promise<SaveProv> {
  const none: SaveProv = { prov: {}, ratio: null, nosource: 0, low: false, needReason: false };
  if (!input.aiOriginalId) return none;
  const o = await repo.getAiOriginal(input.aiOriginalId);
  if (!o || o.studentId !== input.studentId) return none;
  const settings = await repo.getProvenanceSettings();
  let raw: unknown = input.pins;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = []; } }
  const sentenceSources = alignSentences(o, input.content, parsePins(raw), settings.sourceMatchMin);
  const nosource = noSourceSentences(sentenceSources).length;
  if (!input.confirm) return { prov: { aiOriginalId: o.id, sentenceSources }, ratio: null, nosource, low: false, needReason: false };
  const ratio = editRatio(o.content, input.content);
  const low = ratio < settings.editRatioMin;
  const reason = input.reason.replace(/\s+/g, " ").trim().slice(0, 60);
  return {
    prov: { aiOriginalId: o.id, sentenceSources, editRatio: ratio, lowEditReason: low ? reason || null : null },
    ratio, nosource, low, needReason: low && !reason,
  };
}

/** 반 전체 검사 N38 칸: 근거 없는 문장 · 수정 비율 (원안이 없으면 비움) */
export function classProv(o: { content: string; sentences: OriginalView["sentences"] } | undefined, r: (RecordProv & { content?: string }) | undefined, text: string, settings: ProvenanceSettings) {
  if (!o) return { editRatio: null };
  return { more: { provenance: provCheck(o, text, pinsFrom(text, r?.sentenceSources), settings) }, editRatio: r?.editRatio ?? editRatio(o.content, text), editRatioMin: settings.editRatioMin };
}

/** 확정 감사 한 줄: 숫자만 (글 · 까닭 · 이름 · 학번 없음) */
export const confirmAudit = (kind: string, id: string, p: SaveProv) => `${kind}:${id} ratio=${p.ratio ?? "-"} nosource=${p.nosource} low=${p.low ? 1 : 0}`;
