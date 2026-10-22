"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Users } from "lucide-react";
import { cx } from "@/components/ui";
import { PROGRAM_MEMO_MAX } from "@/lib/domain/program";
import { rewriteWithMemo, saveProgramMemo } from "./actions";

// 이 학생 관찰 메모 (Figma N41 492:15918): 프로그램 × 학생. 초안 검토 근거 자료 칸 · 학생 활동 팝업에 같이 쓴다.
// 저장하면 근거 자료(교사 메모)가 되고, "메모 반영해 다시 쓰기"로 이 학생 초안을 새로 만든다 (앞 버전은 남는다).
// "다른 학생에게도 넣기": 같은 메모를 고른 학생들에게 한 번에 (N28 누가기록 한꺼번에처럼).

const md = (iso: string) => `${+iso.slice(5, 7)}.${+iso.slice(8, 10)}`;

export function ProgramMemoBox({ programId, studentId, initial, canRewrite, others = [], narrow = false, onRewritten }: {
  programId: string;
  studentId: string;
  initial: { content: string; at: string } | null;
  /** 발행된 프로그램만 다시 쓸 수 있다 */
  canRewrite: boolean;
  /** 같은 메모를 넣을 수 있는 다른 대상 학생 */
  others?: { id: string; name: string }[];
  /** 좁은 칸(초안 검토 근거 자료 · 모바일): 버튼을 위아래로 */
  narrow?: boolean;
  onRewritten?: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState(initial?.content ?? "");
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [bulk, setBulk] = useState(false);
  const [more, setMore] = useState<Set<string>>(new Set());
  const dirty = text.trim() !== (saved?.content ?? "").trim();
  const canSave = dirty && text.length <= PROGRAM_MEMO_MAX;
  const hasMemo = !!(saved?.content.trim());

  const save = () => start(async () => {
    setMsg(null);
    const r = await saveProgramMemo({ programId, studentIds: [studentId, ...more], content: text });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setSaved({ content: text.trim(), at: r.at });
    setMore(new Set());
    setBulk(false);
    setMsg({ tone: "ok", text: `${r.saved > 1 ? `${r.saved}명에게 ` : ""}저장했어요${r.turnedOn ? " · 근거 자료에 교사 메모를 더했어요" : ""}` });
    router.refresh();
  });
  const rewrite = () => start(async () => {
    setMsg(null);
    if (dirty) {
      const s = await saveProgramMemo({ programId, studentIds: [studentId], content: text });
      if (!s.ok) return setMsg({ tone: "bad", text: s.error });
      setSaved({ content: text.trim(), at: s.at });
    }
    const r = await rewriteWithMemo({ programId, studentId });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "ok", text: r.done });
    onRewritten?.();
    router.refresh();
  });

  return (
    <section aria-label="이 학생 관찰 메모" className={cx("flex flex-col gap-2.5 rounded-inner border bg-[#fff] p-3.5 md:px-4", dirty ? "border-[1.5px] border-key" : "border-hair")}>
      <div className="flex items-center gap-2">
        <span className="whitespace-nowrap text-[14px] font-bold">이 학생 관찰 메모</span>
        <span className="shrink-0 whitespace-nowrap rounded-chip bg-key-soft px-1.5 py-0.5 text-[12px] font-bold text-key-strong">교사 메모</span>
        <span className="ml-auto min-w-0 truncate whitespace-nowrap text-[12px] text-mute">{saved?.content ? `${md(saved.at)} 저장` : "선택"}</span>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={PROGRAM_MEMO_MAX} rows={3} aria-label="이 학생 관찰 메모"
        placeholder="수업에서 본 일을 짧게 · 예: 발표 뒤 질문에 그래프로 다시 설명함"
        className="min-h-[76px] w-full resize-y rounded-field bg-soft px-3 py-2.5 text-[14px] leading-[22px] outline-none focus:ring-2 focus:ring-key" />
      <p className="text-[12px] text-mute break-keep">제출 서류와 함께 근거가 돼요 · AI에는 이름 없이 가명으로만 가요</p>
      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => setBulk(!bulk)} aria-expanded={bulk} className="flex items-center gap-1 self-start text-[12px] font-medium text-key-strong">
            <Users size={13} /> 다른 학생에게도 넣기{more.size ? ` · ${more.size}명` : ""}
          </button>
          {bulk && (
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-control bg-bg p-2">
              {others.map((o) => {
                const on = more.has(o.id);
                return (
                  <button key={o.id} type="button" aria-pressed={on} onClick={() => { const n = new Set(more); if (on) n.delete(o.id); else n.add(o.id); setMore(n); }}
                    className={cx("inline-flex items-center gap-1 rounded-chip px-2 py-1 text-[12px]", on ? "bg-key font-bold text-white" : "border border-line bg-[#fff] text-sub")}>
                    {on && <Check size={11} strokeWidth={3} />}{o.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div className={cx("flex gap-2", narrow ? "flex-col" : "flex-col md:flex-row md:items-center")}>
        {!narrow && (
          <span className={cx("hidden text-[12px] md:inline md:flex-1", msg?.tone === "bad" ? "text-bad" : msg ? "font-medium text-ok" : "text-sub")} role="status">
            {msg?.text ?? (dirty ? `${text.trim().length}자` : "")}
          </span>
        )}
        <button type="button" onClick={save} disabled={(!canSave && !(more.size && text.trim())) || pending}
          className="h-11 whitespace-nowrap rounded-control border border-hair bg-[#fff] px-3.5 text-[13px] font-bold disabled:border-transparent disabled:bg-soft disabled:text-mute md:h-9">
          메모 저장
        </button>
        {canRewrite && (
          <button type="button" onClick={rewrite} disabled={(!hasMemo && !text.trim()) || pending}
            className="flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-key px-3.5 text-[13px] font-bold text-white disabled:bg-line disabled:text-mute md:h-9">
            <RotateCcw size={14} /> 메모 반영해 다시 쓰기
          </button>
        )}
      </div>
      {msg && <p className={cx("text-[12px]", !narrow && "md:hidden", msg.tone === "bad" ? "text-bad" : "font-medium text-ok")} role="status">{msg.text}</p>}
    </section>
  );
}
