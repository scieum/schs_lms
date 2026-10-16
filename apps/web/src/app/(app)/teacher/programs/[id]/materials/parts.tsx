"use client";
import { useActionState, useState } from "react";
import { FileUp, ShieldCheck, Sparkles } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { confirmReads, readMaterialsAction, uploadMaterials, type ReadState, type UploadState } from "./actions";

type Opt = { id: string; label: string };
const SELECT = "h-10 w-full rounded-field bg-white px-3 text-[14px] outline-none focus:ring-2 focus:ring-key";

/** 일괄·개별·합본 업로드 */
export function UploadBox({ programId, mode, students }: { programId: string; mode: "bulk" | "one" | "bundle"; students: Opt[] }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadMaterials, {});
  const [picked, setPicked] = useState<{ n: number; names: string[] }>({ n: 0, names: [] });
  const names = picked.n === (state.n ?? 0) ? picked.names : [];
  return (
    <form action={action} className="flex flex-col gap-3" key={state.n ?? 0}>
      <input type="hidden" name="programId" value={programId} />
      <input type="hidden" name="mode" value={mode} />
      {mode === "one" && (
        <select name="studentId" required defaultValue="" className={SELECT} aria-label="학생">
          <option value="" disabled>학생 고르기</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      )}
      <label className={cx("flex cursor-pointer flex-col items-center gap-3 rounded-inner border-2 border-dashed border-hair bg-white px-4 py-8 text-center", names.length > 0 && "border-key")}>
        <span className="flex size-11 items-center justify-center rounded-field bg-soft text-key"><FileUp size={22} /></span>
        <span className="font-bold">{names.length ? `${names.length}개 파일 골랐어요` : mode === "bundle" ? "합본 PDF 고르기" : "파일을 골라 주세요"}</span>
        <span className="text-[13px] text-mute">{names.length ? names.slice(0, 3).join(", ") + (names.length > 3 ? " …" : "") : mode === "bundle" ? "여러 학생 서류를 모은 PDF" : "PDF · JPG · PNG · TXT · 파일당 최대 50MB"}</span>
        <input type="file" name="files" multiple={mode !== "one"} required className="sr-only"
          accept={mode === "bundle" ? "application/pdf" : "application/pdf,image/jpeg,image/png,image/webp,text/plain"}
          onChange={(e) => setPicked({ n: state.n ?? 0, names: [...(e.target.files ?? [])].map((f) => f.name) })} />
      </label>
      {mode === "bulk" && (
        <p className="flex gap-2 rounded-inner bg-white px-3.5 py-3 text-[13px] text-sub">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-key" />
          <span>파일 이름 예시 20312_김민준_보고서.pdf — 학번이나 이름이 있으면 자동으로 학생과 연결돼요</span>
        </p>
      )}
      <p className="flex gap-2 rounded-inner bg-white px-3.5 py-3 text-[13px] text-sub">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" />
        <span>이름·학번은 AI에 보내기 전에 자동으로 가려요. 원본은 학교 서버에만 보관돼요</span>
      </p>
      {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      {state.done && <p className="text-sm text-ok" role="status">{state.done}</p>}
      <Button kind="outline" disabled={pending || names.length === 0}>{pending ? "올리는 중…" : "올리기"}</Button>
    </form>
  );
}

/** AI로 서류 읽기 → 확인 후 연결 */
export function ReadBox({ programId, pending: count, aiOn, students }: { programId: string; pending: number; aiOn: boolean; students: Opt[] }) {
  const [read, readAction, reading] = useActionState<ReadState, FormData>(readMaterialsAction, {});
  const [saved, saveAction, saving] = useActionState<ReadState, FormData>(confirmReads, {});
  const [doneFor, setDoneFor] = useState(-1);
  const list = read.proposals && doneFor !== (read.n ?? 0) ? read.proposals : null;
  return (
    <div className="rounded-inner bg-soft px-4 py-3.5 md:px-5 md:py-4">
      <form action={readAction} className="flex items-center gap-3 md:gap-4">
        <input type="hidden" name="programId" value={programId} />
        <span className="rounded-chip bg-new-soft px-2.5 py-1 text-xs font-bold text-new">AI</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">AI로 서류 읽기</div>
          <div className="truncate text-[13px] text-sub">
            {!aiOn ? "AI가 꺼져 있어요. 학생을 직접 지정해 주세요" : saved.n && !list ? "확인한 파일을 연결했어요" : count ? `${count}개 파일 → 표지 이름으로 학생 연결·본문 읽기` : "읽을 파일이 없어요"}
          </div>
        </div>
        <Button kind="outline" size="sm" disabled={!aiOn || reading || count === 0}>{reading ? "읽는 중이에요…" : "서류 읽기"}</Button>
      </form>
      {read.error && <p className="mt-2 text-[13px] text-bad" role="alert">{read.error}</p>}
      {list && list.length > 0 && (
        <form action={saveAction} onSubmit={() => setDoneFor(read.n ?? 0)} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="programId" value={programId} />
          {list.map((p) => (
            <div key={p.materialId} className="flex flex-col gap-2 rounded-inner bg-white p-3">
              <input type="hidden" name="materialId" value={p.materialId} />
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{p.fileName}</span>
                <span className={cx("rounded-chip px-2 py-0.5 text-xs font-medium", p.studentId ? "bg-ok-soft text-ok" : "bg-wait-soft text-wait")}>{p.studentId ? "연결" : "확인 필요"}</span>
              </div>
              <select name={`student_${p.materialId}`} defaultValue={p.studentId ?? ""} className={SELECT} aria-label="학생">
                <option value="">학생 지정 안 함</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              {p.hint && <p className="text-[12px] text-wait">{p.hint}</p>}
              {p.text && (
                <textarea name={`text_${p.materialId}`} defaultValue={p.text} rows={3} className="w-full resize-y rounded-field bg-soft p-2.5 text-[13px] outline-none focus:ring-2 focus:ring-key" aria-label="읽은 글 (이름·학번 가림)" />
              )}
            </div>
          ))}
          <Button kind="outline" size="sm" disabled={saving} className="self-end">{saving ? "연결하는 중…" : "확인 후 연결"}</Button>
        </form>
      )}
    </div>
  );
}
