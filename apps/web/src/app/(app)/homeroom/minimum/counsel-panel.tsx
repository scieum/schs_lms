"use client";
import { useActionState, useState } from "react";
import { AiBanner, Button, Card, cx, Tag } from "@/components/ui";
import { analyzeMinimum, saveCounselList, type CounselItem, type SaveState } from "./actions";

/** AI 최저 분석 → 사람이 고르고 고친 뒤 "확인 후 저장" */
export function CounselPanel({ classKey, examId, ai, nearCount, names }: { classKey: string; examId: string; ai: boolean; nearCount: number; names: Record<string, string> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{ summary: string; source: "AI" | "자동"; items: (CounselItem & { on: boolean })[] } | null>(null);
  const [saved, save, saving] = useActionState<SaveState, FormData>(saveCounselList, {});

  async function run() {
    setBusy(true);
    setError("");
    const r = await analyzeMinimum(classKey, examId);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDraft({ summary: r.summary, source: r.source, items: r.items.map((i) => ({ ...i, on: i.priority <= 2 })) });
  }

  const picked = draft?.items.filter((i) => i.on) ?? [];
  return (
    <>
      <AiBanner
        title="최저 분석"
        label={draft ? draft.source : ai ? "AI" : "자동"}
        line={error || (draft ? draft.summary : `한 과목만 1등급 올리면 충족되는 학생 ${nearCount}명 — 우선 상담 대상`)}
        action={
          !draft ? (
            <Button size="sm" onClick={run} disabled={busy || !examId}>{busy ? (ai ? "분석하는 중…" : "고르는 중…") : "상담 명단 만들기"}</Button>
          ) : (
            <Button size="sm" kind="ghost" onClick={() => setDraft(null)}>닫기</Button>
          )
        }
      />
      {draft && (
        <Card title="상담 명단 만들기" action={<Tag tone="bg-new-soft text-new">{draft.source === "AI" ? "AI 추천" : "규칙으로 고름"}</Tag>}>
          {draft.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">넣을 학생이 없어요</p>
          ) : (
            <div className="flex flex-col gap-2">
              {draft.items.map((it, i) => (
                <div key={it.studentId} className={cx("flex items-start gap-3 rounded-inner bg-white px-3.5 py-3", !it.on && "opacity-60")}>
                  <input
                    type="checkbox"
                    checked={it.on}
                    onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)) })}
                    className="mt-1 size-4 accent-[#536DFE]"
                    aria-label={`${names[it.studentId] ?? "학생"} 넣기`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{names[it.studentId] ?? "학생"}</span>
                      <Tag tone={it.priority === 1 ? "bg-key-soft text-key-strong" : "bg-soft text-sub"}>{`우선 ${it.priority}`}</Tag>
                    </div>
                    <input
                      value={it.reason}
                      onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)) })}
                      maxLength={100}
                      className="mt-1 w-full rounded-field bg-soft px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-key"
                      aria-label="상담 이유"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <form action={save} className="mt-4 flex items-center gap-3">
            <input type="hidden" name="class" value={classKey} />
            <input type="hidden" name="examId" value={examId} />
            <input type="hidden" name="items" value={JSON.stringify(picked.map(({ studentId, reason }) => ({ studentId, reason })))} />
            <p className="flex-1 text-[13px] text-mute">{saved.saved ? `${saved.saved}명을 상담 명단에 저장했어요` : draft.source === "AI" ? "가명ID·등급만 AI에 보냈어요" : "규칙으로 고른 명단이에요"}</p>
            <Button size="sm" disabled={saving || picked.length === 0}>{saving ? "저장하는 중…" : `확인 후 저장 (${picked.length}명)`}</Button>
          </form>
          {saved.error && <p className="mt-2 text-sm text-bad" role="alert">{saved.error}</p>}
        </Card>
      )}
    </>
  );
}
