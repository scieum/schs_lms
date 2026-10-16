"use client";
import { useActionState, useState, useTransition } from "react";
import { FileUp } from "lucide-react";
import { AiBanner, Button, Card, Tag, cx } from "@/components/ui";
import { addCoursesBulk, readCurriculumAction, type BulkCourseState, type ImportPreview } from "@/app/(app)/admin/curriculum/actions";

/**
 * 편제표 읽기: 학교 편제표 이미지·PDF 를 올리면 AI 가 과목 목록(학년·학기·과목·학점)을 뽑는다.
 * 키가 없으면 표를 글로 붙여 넣어 규칙으로 읽는다. 미리보기에서 고른 뒤 "확인 후 추가"를 눌러야 편제표에 들어간다.
 */
export function CurriculumImport({ aiOn }: { aiOn: boolean }) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [state, action, saving] = useActionState<BulkCourseState, FormData>(async (p, f) => {
    const r = await addCoursesBulk(p, f);
    if (r.done) setPreview(null);
    return r;
  }, {});

  const rows = preview?.ok ? preview.rows : [];
  const picked = rows.filter((r, i) => !r.error && !off.has(i));
  const read = (form: FormData) => start(async () => { setOff(new Set()); setPreview(await readCurriculumAction(form)); });

  return (
    <div className="flex flex-col gap-3">
      <AiBanner
        label={preview?.ok ? preview.label : aiOn ? "AI" : "자동"}
        title="편제표 읽기"
        line={pending ? "읽는 중이에요" : preview?.ok ? `${rows.length}과목을 읽었어요 · ${picked.length}과목 추가 가능` : aiOn ? "편제표 이미지·PDF를 올리면 과목 목록을 뽑아요" : "편제표를 글로 붙여 넣으면 과목 목록을 만들어요"}
        action={<Button type="button" kind="outline" size="sm" onClick={() => setOpen((x) => !x)}>{open ? "닫기" : "편제표 올리기"}</Button>}
      />
      {state.done && !open && <p className="px-1 text-[13px] text-ok" role="status">{state.done}</p>}
      {open && (
        <Card>
          <form action={read} className="flex flex-col gap-3">
            {aiOn && (
              <label className={cx("flex cursor-pointer items-center gap-3 rounded-inner bg-white px-4 py-4", fileName && "ring-2 ring-key")}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-field bg-soft"><FileUp size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{fileName || "편제표 파일 고르기"}</span>
                  <span className="block text-[12px] text-mute">PDF · JPG · PNG · 20MB까지 · 학생 정보가 없는 학교 문서만</span>
                </span>
                <input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
              </label>
            )}
            <textarea name="text" value={text} onChange={(e) => setText(e.target.value)} rows={aiOn ? 3 : 6} maxLength={20000} aria-label="편제표 글"
              placeholder={"글로 붙여 넣기 (한 줄에 학년 학기 과목 학점)\n2 1 물리학Ⅰ 4\n2 1 확률과 통계 4"}
              className="w-full resize-y rounded-field bg-white p-3.5 text-[14px] leading-6 outline-none placeholder:text-faint focus:ring-2 focus:ring-key" />
            <Button kind="outline" size="sm" className="self-end" disabled={pending || (!fileName && !text.trim())}>{pending ? "읽는 중…" : "읽기"}</Button>
          </form>

          {preview && !preview.ok && !pending && <p className="mt-3 text-[13px] text-bad" role="alert">{preview.error}</p>}
          {preview?.ok && !pending && (
            <form action={action} className="mt-4 flex flex-col gap-2">
              <ul className="flex flex-col">
                {rows.map((r, i) => {
                  const on = !r.error && !off.has(i);
                  return (
                    <li key={i} className={cx("flex items-center gap-3 py-2.5", i < rows.length - 1 && "border-b border-line")}>
                      <input type="checkbox" checked={on} disabled={!!r.error} aria-label={`${r.subject} 추가`} className="size-4 shrink-0 accent-[#536DFE]"
                        onChange={() => setOff((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                      <span className="w-[72px] shrink-0 text-[13px] text-mute tabular-nums">{r.grade}학년 {r.semester}학기</span>
                      <div className="min-w-0 flex-1">
                        <div className={cx("truncate text-[15px] font-medium", !on && "text-mute")}>{r.subject}</div>
                        <div className="truncate text-[12px] text-mute">
                          {r.group} · {r.type ?? "직접 입력"} · {r.credits}학점{r.renamedFrom ? ` · '${r.renamedFrom}'에서 맞춤` : ""}
                        </div>
                      </div>
                      {r.error ? <span className="shrink-0 text-[12px] text-bad">{r.error}</span> : <Tag tone="bg-white text-sub">{r.type ? "2022" : "학교 지정"}</Tag>}
                    </li>
                  );
                })}
              </ul>
              <input type="hidden" name="rows" value={JSON.stringify(picked.map((r) => ({ grade: r.grade, semester: r.semester, subject: r.subject, credits: r.credits, group: r.group })))} />
              <div className="flex items-center gap-3">
                <p className="flex-1 text-[13px] text-mute">{preview.note ?? (preview.label === "AI" ? "AI가 읽은 목록이에요. 표와 맞는지 확인해 주세요" : "붙여 넣은 글에서 읽었어요")}</p>
                <Button kind="outline" size="sm" disabled={saving || picked.length === 0}>{saving ? "추가하는 중…" : `확인 후 ${picked.length}과목 추가`}</Button>
              </div>
            </form>
          )}
          {state.error && <p className="mt-2 text-[13px] text-bad" role="alert">{state.error}</p>}
          {state.done && <p className="mt-2 text-[13px] text-ok" role="status">{state.done}</p>}
          {state.failed && state.failed.length > 0 && (
            <ul className="mt-1 text-[12px] text-bad">{state.failed.slice(0, 10).map((f) => <li key={f}>· {f}</li>)}</ul>
          )}
        </Card>
      )}
    </div>
  );
}
