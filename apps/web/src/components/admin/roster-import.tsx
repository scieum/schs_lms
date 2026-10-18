"use client";
import { useActionState, useState, useTransition } from "react";
import { Button, Tag, cx } from "@/components/ui";
import { ExcelButtons, TemplateSheet } from "@/components/excel-buttons";
import type { RosterRow } from "@/lib/domain/accounts";
import { createTeachersBulk, previewRoster, type BulkState, type RosterPreview } from "@/app/(app)/admin/accounts/actions";

/** 명부로 여러 명 (Figma N25 342:10318): 교사명부_양식.xlsx 올리기 → 미리보기에서 고르기 → 확인 후 추가. AI 없음 */
export function RosterImport() {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [state, action, saving] = useActionState<BulkState, FormData>(async (p, f) => {
    const r = await createTeachersBulk(p, f);
    if (r.done) setPreview(null);
    return r;
  }, {});

  const rows = preview?.ok ? preview.rows : [];
  const ok = rows.filter((r) => !r.error && !off.has(r.line));
  const read = (file: File) => start(async () => {
    setOff(new Set());
    const fd = new FormData();
    fd.set("file", file);
    setPreview(await previewRoster(fd).catch(() => ({ ok: false as const, error: "파일을 읽지 못했어요" })));
  });
  const toggle = (r: RosterRow) => setOff((s) => { const n = new Set(s); if (n.has(r.line)) n.delete(r.line); else n.add(r.line); return n; });
  const fileRow = preview?.fileName
    ? preview.ok ? { name: preview.fileName, tag: `${rows.length}명 읽음` } : { name: preview.fileName, tag: "읽지 못함", failed: true }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <ExcelButtons kind="teacher" onPick={read} busy={pending} error={preview && !preview.ok ? preview.error : null} file={fileRow} />
      {preview?.ok ? (
        <form action={action} className="flex flex-col gap-2 rounded-inner bg-[#fff] p-3.5">
          <ul className="flex flex-col">
            {rows.map((r, i) => {
              const on = !r.error && !off.has(r.line);
              return (
                <li key={`${r.line}-${i}`} className={cx("flex items-center gap-3 py-2.5", i < rows.length - 1 && "border-b border-line")}>
                  <input type="checkbox" checked={on} disabled={!!r.error} onChange={() => toggle(r)} aria-label={`${r.name} 추가`} className="size-4 shrink-0 accent-[#536DFE]" />
                  <div className="min-w-0 flex-1">
                    <div className={cx("truncate text-[15px] font-medium", !on && "text-mute")}>{r.name || `${r.line}행`}</div>
                    <div className="truncate text-[13px] text-mute">
                      {[r.dept ?? "부서 없음", r.homeroom ? `담임 ${r.homeroom.grade}학년 ${r.homeroom.classNo}반` : "담임 아님"].join(" · ")}
                    </div>
                  </div>
                  {r.error ? <span className="max-w-[45%] shrink-0 text-right text-[12px] text-bad">{r.error}</span> : <Tag tone="bg-soft text-sub">{`${r.line}행`}</Tag>}
                </li>
              );
            })}
          </ul>
          <input type="hidden" name="rows" value={JSON.stringify(ok.map(({ line, name, dept, homeroom }) => ({ line, name, dept, homeroom })))} />
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="min-w-0 flex-1 text-[13px] text-mute">역할은 교과로 만들어요. 담임 반이 있으면 담임도 붙어요</p>
            <Button size="sm" disabled={saving || ok.length === 0}>{saving ? "추가하는 중…" : `확인 후 ${ok.length}명 추가`}</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-medium text-sub">양식</div>
          <TemplateSheet kind="teacher" />
        </div>
      )}
      {state.error && <p className="text-[13px] text-bad" role="alert">{state.error}</p>}
      {state.done && <p className="text-[13px] text-ok" role="status">{state.done}</p>}
      {state.failed && state.failed.length > 0 && (
        <ul className="text-[12px] text-bad">{state.failed.slice(0, 10).map((f) => <li key={f}>· {f}</li>)}</ul>
      )}
    </div>
  );
}
