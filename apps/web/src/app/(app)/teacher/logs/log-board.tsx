"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import { Check, Paperclip } from "lucide-react";
import { prepareUpload } from "@/lib/client/shrink-upload";
import { ACCEPT } from "@/components/writing/evidence-files";
import { Button, Card, Tag, cx } from "@/components/ui";
import { neisBytes } from "@/lib/domain/length";
import { addLogs, polishLogMemo, readLogFile, type LogState, type PolishResult } from "./actions";
import { makeStudentNo } from "@/lib/domain/roster";

type S = { id: string; name: string; grade: number; classNo: number; number: number; count: number };
type L = { id: string; studentId: string; date: string; content: string };

// 왼쪽: 학생 고르기(여러 명) · 오른쪽: 같은 기록을 한 번에 추가 + 최근 기록
export function LogBoard({ area, clubId, students, logs, today }: { area: string; clubId?: string; students: S[]; logs: L[]; today: string }) {
  const [state, action, pending] = useActionState<LogState, FormData>(addLogs, {});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [polish, setPolish] = useState<PolishResult | null>(null);
  const [polishing, startPolish] = useTransition();
  const runPolish = () => startPolish(async () => {
    try {
      setSource(null);
      setPolish(await polishLogMemo({ area, clubId, text }));
    } catch {
      setPolish({ ok: false, error: "다듬지 못했어요. 직접 써 주세요" });
    }
  });
  // 파일로 쓰기 (Figma N10): 활동지·보고서·사진 → 누가기록 한두 문장 제안. 큰 PDF는 쪽을 나눠 읽고 이어 붙인다
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const runFile = (f: File) => startPolish(async () => {
    try {
      const texts: string[] = [];
      let label: "AI" | "자동" = "AI";
      for (const part of await prepareUpload(f)) {
        const fd = new FormData();
        fd.set("file", part);
        fd.set("area", area);
        if (clubId) fd.set("clubId", clubId);
        const r = await readLogFile(fd);
        if (!r.ok) { setSource(null); setPolish(r); return; }
        texts.push(r.text);
        label = r.label;
      }
      setSource(f.name);
      setPolish({ ok: true, text: texts.join(" ").slice(0, 1000), label });
    } catch {
      setPolish({ ok: false, error: "파일을 읽지 못했어요. 직접 써 주세요" });
    }
  });
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = picked.size === students.length && students.length > 0;
  const shown = picked.size ? logs.filter((l) => picked.has(l.studentId)) : logs;

  return (
    <div className="grid gap-4 md:grid-cols-[300px_1fr] md:gap-6">
      <Card title="학생" action={
        <button type="button" onClick={() => setPicked(all ? new Set() : new Set(students.map((s) => s.id)))} className="text-[13px] font-medium text-key-strong">
          {all ? "모두 해제" : "모두 선택"}
        </button>
      }>
        <ul className="-mx-2 flex max-h-[560px] flex-col overflow-y-auto">
          {students.map((s) => {
            const on = picked.has(s.id);
            return (
              <li key={s.id}>
                <button type="button" onClick={() => toggle(s.id)} aria-pressed={on}
                  className={cx("flex w-full items-center gap-3 rounded-inner px-2 py-2.5 text-left", on ? "bg-white" : "hover:bg-white/60")}>
                  <span className={cx("flex size-5 shrink-0 items-center justify-center rounded-chip", on ? "bg-key text-white" : "bg-white")}>{on && <Check size={13} strokeWidth={3} />}</span>
                  <span className="w-12 shrink-0 tabular-nums text-[13px] text-mute">{makeStudentNo(s.grade, s.classNo, s.number)}</span>
                  <span className={cx("min-w-0 flex-1 truncate", on && "font-bold")}>{s.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-mute">{s.count}건</span>
                </button>
              </li>
            );
          })}
          {students.length === 0 && <li className="py-6 text-center text-sm text-mute">학생이 없어요</li>}
        </ul>
      </Card>

      <div className="flex flex-col gap-4 md:gap-6">
        <Card title={`${area} 기록 쓰기`} action={<span className="text-[13px] text-mute">{picked.size}명 선택</span>}>
          <form action={action} key={state.added ? `ok-${logs.length}` : "form"} className="flex flex-col gap-3">
            <input type="hidden" name="area" value={area} />
            {clubId && <input type="hidden" name="clubId" value={clubId} />}
            <input type="hidden" name="studentIds" value={JSON.stringify([...picked])} />
            <label className="flex items-center gap-3">
              <span className="text-[13px] font-medium text-sub">날짜</span>
              <input type="date" name="date" defaultValue={today} required className="h-10 rounded-field bg-white px-3 text-[15px] outline-none focus:ring-2 focus:ring-key" />
            </label>
            <textarea name="content" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1000} required
              placeholder="관찰한 활동을 짧게 적거나 받아쓰기를 붙여 넣어 주세요. 고른 학생 모두에게 같은 내용이 들어가요"
              className="w-full resize-y rounded-field bg-white p-4 text-[15px] leading-7 outline-none focus:ring-2 focus:ring-key" aria-label="기록 내용" />
            {polish?.ok && (
              <div className="flex flex-col gap-2 rounded-inner border border-line bg-white p-3.5">
                <div className="flex items-center gap-1.5">
                  <Tag tone={polish.label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong"}>{polish.label}</Tag>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-sub">{source ? `${source}에서` : "다듬은 문장"} · 모두에게 같은 글이 들어가요</span>
                </div>
                <p className="text-[15px] leading-7">{polish.text}</p>
                {polish.notice && <p className="text-[12px] text-mute">{polish.notice}</p>}
                <div className="flex justify-end gap-2">
                  <Button type="button" kind="ghost" size="sm" onClick={() => setPolish(null)}>그대로 두기</Button>
                  <Button type="button" kind="outline" size="sm" onClick={() => { setText(polish.text); setPolish(null); }}>확인 후 넣기</Button>
                </div>
              </div>
            )}
            {polish && !polish.ok && <p className="text-[13px] text-bad" role="alert">{polish.error}</p>}
            <div className="flex items-center justify-between gap-2 text-[13px] text-mute">
              <span className="flex-1">{text.length}자 · {neisBytes(text).toLocaleString()}바이트</span>
              {state.error && <span className="text-bad" role="alert">{state.error}</span>}
              {state.added && !state.error && <span className="text-ok" role="status">{state.added}명에게 추가했어요</span>}
              <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) runFile(f); e.target.value = ""; }} />
              <Button type="button" kind="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={polishing}>
                <Paperclip size={13} /> 파일로 쓰기
              </Button>
              <Button type="button" kind="outline" size="sm" onClick={runPolish} disabled={polishing || text.trim().length < 2}>
                {polishing ? "읽는 중…" : "AI로 다듬기"}
              </Button>
            </div>
            <Button disabled={pending || picked.size === 0 || text.trim().length < 5}>
              {pending ? "추가하는 중…" : picked.size ? `${picked.size}명에게 추가` : "학생을 골라 주세요"}
            </Button>
          </form>
        </Card>

        <Card title="최근 기록" action={<span className="text-[13px] text-mute">{picked.size ? "고른 학생" : "전체"} {shown.length}건</span>}>
          {shown.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">아직 기록이 없어요</p>
          ) : (
            <ul className="flex flex-col">
              {shown.slice(0, 30).map((l, i) => (
                <li key={l.id} className={cx("flex gap-3 py-3", i > 0 && "border-t border-line")}>
                  <span className="w-20 shrink-0 text-[13px] text-mute">{l.date.slice(5).replace("-", ".")}</span>
                  <span className="w-14 shrink-0 text-[13px] font-medium">{nameOf.get(l.studentId)}</span>
                  <span className="min-w-0 flex-1 text-sm text-sub">{l.content}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
