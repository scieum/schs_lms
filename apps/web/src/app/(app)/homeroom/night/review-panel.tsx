"use client";
import { useActionState, useState } from "react";
import { AiBanner, Button, Card, cx, Tag } from "@/components/ui";
import { reviewAttendance, sendNotices, type ReviewDraft, type SendState } from "./actions";

/** AI 출결 살펴보기 → 메시지 초안을 고치고 "확인 후 보내기" */
export function ReviewPanel({ classKey, line, ai, names }: { classKey: string; line: string; ai: boolean; names: Record<string, string> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{ summary: string; source: "AI" | "자동"; items: (ReviewDraft & { on: boolean })[] } | null>(null);
  const [sent, send, sending] = useActionState<SendState, FormData>(sendNotices, {});

  async function run() {
    setBusy(true);
    setError("");
    const r = await reviewAttendance(classKey);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDraft({ summary: r.summary, source: r.source, items: r.drafts.map((d) => ({ ...d, on: true })) });
  }
  const picked = draft?.items.filter((i) => i.on && i.message.trim()) ?? [];

  return (
    <>
      <AiBanner
        title="출결 살펴보기"
        label={draft ? draft.source : ai ? "AI" : "자동"}
        line={error || draft?.summary || line}
        action={
          draft ? (
            <Button size="sm" kind="ghost" onClick={() => setDraft(null)}>닫기</Button>
          ) : (
            <Button kind="outline" size="sm" onClick={run} disabled={busy}>{busy ? "살펴보는 중…" : "메시지 만들기"}</Button>
          )
        }
      />
      {draft && (
        <Card title="확인 메시지" action={<Tag tone="bg-new-soft text-new">{draft.source === "AI" ? "AI 초안" : "기본 문구"}</Tag>}>
          {draft.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">메시지를 보낼 학생이 없어요</p>
          ) : (
            <div className="flex flex-col gap-2">
              {draft.items.map((it, i) => (
                <div key={it.studentId} className={cx("flex items-start gap-3 rounded-inner bg-white px-3.5 py-3", !it.on && "opacity-60")}>
                  <input
                    type="checkbox"
                    checked={it.on}
                    onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)) })}
                    className="mt-1 size-4 accent-[#536DFE]"
                    aria-label={`${names[it.studentId] ?? "학생"}에게 보내기`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{names[it.studentId] ?? "학생"}</span>
                      <span className="text-xs text-mute">{it.pattern}</span>
                    </div>
                    <textarea
                      value={it.message}
                      rows={2}
                      maxLength={300}
                      onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, message: e.target.value } : x)) })}
                      className="mt-1.5 w-full resize-none rounded-field bg-soft px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-key"
                      aria-label="메시지"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <form action={send} className="mt-4 flex items-center gap-3">
            <input type="hidden" name="class" value={classKey} />
            <input type="hidden" name="rows" value={JSON.stringify(picked.map((p) => ({ studentId: p.studentId, body: p.message })))} />
            <p className="flex-1 text-[13px] text-mute">{sent.sent ? `${sent.sent}명에게 보냈어요 (학생 야자 화면)` : draft.source === "AI" ? "가명ID·출결만 AI에 보냈어요" : "규칙으로 만든 기본 문구예요"}</p>
            <Button kind="outline" size="sm" disabled={sending || picked.length === 0}>{sending ? "보내는 중…" : `확인 후 보내기 (${picked.length}명)`}</Button>
          </form>
          {sent.error && <p className="mt-2 text-sm text-bad" role="alert">{sent.error}</p>}
        </Card>
      )}
    </>
  );
}
