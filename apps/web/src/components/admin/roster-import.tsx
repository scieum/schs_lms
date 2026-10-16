"use client";
import { useActionState, useState, useTransition } from "react";
import { Button, Tag, cx } from "@/components/ui";
import type { RosterRow } from "@/lib/domain/accounts";
import { createTeachersBulk, previewRoster, type BulkState, type RosterPreview } from "@/app/(app)/admin/accounts/actions";

const AREA = "w-full resize-y rounded-field bg-white p-3.5 text-[14px] leading-6 outline-none placeholder:text-faint focus:ring-2 focus:ring-key";

/** A2 교사 명부 붙여넣기 → 읽기(키 있으면 AI 열 해석, 없으면 규칙) → 미리보기에서 고르기 → 확인 후 추가 */
export function RosterImport({ aiOn }: { aiOn: boolean }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [state, action, saving] = useActionState<BulkState, FormData>(async (p, f) => {
    const r = await createTeachersBulk(p, f);
    if (r.done) { setPreview(null); setText(""); }
    return r;
  }, {});

  const rows = preview?.ok ? preview.rows : [];
  const ok = rows.filter((r) => !r.error && !off.has(r.line));
  const read = () => start(async () => { setOff(new Set()); setPreview(await previewRoster(text)); });
  const toggle = (r: RosterRow) => setOff((s) => { const n = new Set(s); if (n.has(r.line)) n.delete(r.line); else n.add(r.line); return n; });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Tag tone={(preview?.ok ? preview.label : aiOn ? "AI" : "자동") === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong"}>{preview?.ok ? preview.label : aiOn ? "AI" : "자동"}</Tag>
        <p className="flex-1 text-[13px] text-sub">엑셀·한글 표를 그대로 붙여 넣어요 (이름·부서·담임 반)</p>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={20000} aria-label="교사 명부"
        placeholder={"이름\t부서\t담임\n김민지\t국어과\t1-3\n박서준\t과학과\t담임 없음"} className={AREA} />
      <Button type="button" kind="outline" size="sm" className="self-end" disabled={pending || !text.trim()} onClick={read}>
        {pending ? "읽는 중…" : preview ? "다시 읽기" : "명부 읽기"}
      </Button>
      {pending && <p className="text-[13px] text-mute">읽는 중이에요</p>}
      {preview && !preview.ok && !pending && <p className="text-[13px] text-bad" role="alert">{preview.error}</p>}
      {preview?.ok && !pending && (
        <form action={action} className="flex flex-col gap-2">
          {preview.note && <p className="text-[13px] text-mute">{preview.note}</p>}
          <ul className="flex flex-col">
            {rows.map((r, i) => {
              const on = !r.error && !off.has(r.line);
              return (
                <li key={`${r.line}-${i}`} className={cx("flex items-center gap-3 py-2.5", i < rows.length - 1 && "border-b border-line")}>
                  <input type="checkbox" checked={on} disabled={!!r.error} onChange={() => toggle(r)} aria-label={`${r.name} 추가`} className="size-4 shrink-0 accent-[#536DFE]" />
                  <div className="min-w-0 flex-1">
                    <div className={cx("truncate text-[15px] font-medium", !on && "text-mute")}>{r.name || `${r.line}줄`}</div>
                    <div className="truncate text-[13px] text-mute">
                      {[r.dept ?? "부서 없음", r.homeroom ? `담임 ${r.homeroom.grade}학년 ${r.homeroom.classNo}반` : "담임 아님"].join(" · ")}
                    </div>
                  </div>
                  {r.error ? <span className="max-w-[45%] shrink-0 text-right text-[12px] text-bad">{r.error}</span> : <Tag tone="bg-white text-sub">{`${r.line}줄`}</Tag>}
                </li>
              );
            })}
          </ul>
          <input type="hidden" name="rows" value={JSON.stringify(ok.map(({ line, name, dept, homeroom }) => ({ line, name, dept, homeroom })))} />
          <div className="flex items-center gap-3">
            <p className="flex-1 text-[13px] text-mute">역할은 교과로 만들어요. 담임 반이 있으면 담임도 붙어요</p>
            <Button kind="outline" size="sm" disabled={saving || ok.length === 0}>{saving ? "추가하는 중…" : `확인 후 ${ok.length}명 추가`}</Button>
          </div>
        </form>
      )}
      {state.error && <p className="text-[13px] text-bad" role="alert">{state.error}</p>}
      {state.done && <p className="text-[13px] text-ok" role="status">{state.done}</p>}
      {state.failed && state.failed.length > 0 && (
        <ul className="text-[12px] text-bad">{state.failed.slice(0, 10).map((f) => <li key={f}>· {f}</li>)}</ul>
      )}
    </div>
  );
}
