"use client";
import { startTransition, useActionState, useEffect, useState } from "react";
import { CircleAlert, CircleCheck, ClipboardPaste, FileSpreadsheet, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { ExcelButtons, TemplateSheet } from "@/components/excel-buttons";
import { externalCounts, planExternal, type OverwriteMode } from "@/lib/domain/external-text";
import { applyExternal, previewExternal, type ExternalPreview, type ExternalSave } from "./external-actions";

// 외부 글 넣기 (Figma N46 c 519:11826 · d 519:12310 / 모바일 522:7696 · 522:7952):
// 외부글_양식.xlsx(대상 학생이 채워진 양식) → 올리면 미리 보기(찾음 · 못 찾음 · 대상 아님 · 이미 초안) → 덮어쓰기/건너뛰기 → 넣기.
// 양식이 아니면 읽지 않는다(N25). AI 없음. 넣는 글은 "직접 입력" 초안이 되고 확정은 학생마다 교사가 한다.
// 단계 카드의 "외부 글 넣기"(N16 다음 할 일)는 window 이벤트로 이 창을 연다.

export const EXTERNAL_OPEN_EVENT = "n46:external-open";

export function ExternalImport({ programId, targets, trigger = "soft", className }: {
  programId: string;
  targets: number;
  /** soft = 카드 안 꽉 찬 soft 버튼 · outline = 머리 작은 외곽선 버튼 · none = 버튼 없이 이벤트로만 */
  trigger?: "soft" | "outline" | "none";
  className?: string;
}) {
  // 연 때의 넣기 횟수 (null = 닫힘). 넣기가 끝나면(save.n 이 늘고 done) 창이 닫힌다
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, previewAction, reading] = useActionState<ExternalPreview, FormData>(previewExternal, {});
  const [save, saveAction, saving] = useActionState<ExternalSave, FormData>(applyExternal, {});
  const [readN, setReadN] = useState(0);
  const [overwrite, setOverwrite] = useState<OverwriteMode>("overwrite");
  const [addNon, setAddNon] = useState(true);

  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail === programId) { setOpenAt(save.n ?? 0); setReadN(preview.n ?? 0); } };
    window.addEventListener(EXTERNAL_OPEN_EVENT, on);
    return () => window.removeEventListener(EXTERNAL_OPEN_EVENT, on);
  }, [programId, preview.n, save.n]);
  const saved = openAt !== null && (save.n ?? 0) > openAt;
  const open = openAt !== null && !(saved && save.done);

  const read = (f: File) => {
    setFile(f);
    const fd = new FormData();
    fd.set("programId", programId);
    fd.set("file", f);
    startTransition(() => previewAction(fd));
  };
  const apply = () => {
    if (!file) return;
    const fd = new FormData();
    fd.set("programId", programId);
    fd.set("file", file);
    fd.set("overwrite", overwrite);
    if (addNon) fd.set("addNonTargets", "on");
    startTransition(() => saveAction(fd));
  };
  const begin = () => { setOpenAt(save.n ?? 0); setReadN(preview.n ?? 0); };
  const close = () => setOpenAt(null);
  const showPreview = (preview.n ?? 0) > readN;
  const href = `/teacher/programs/${programId}/external-template`;

  return (
    <>
      {trigger === "soft" && (
        <Button type="button" kind="soft" size="sm" onClick={begin} className={cx("w-full", className)}><ClipboardPaste size={14} /> 외부 글 넣기</Button>
      )}
      {trigger === "outline" && (
        <Button type="button" kind="outline" size="sm" onClick={begin} className={className}><ClipboardPaste size={14} /> 외부 글 넣기</Button>
      )}
      {save.done && !open && (
        <p role="status" className="flex w-full items-center gap-1.5 text-[13px] font-medium text-ok"><CircleCheck size={15} aria-hidden /> {save.done}</p>
      )}
      {open && (
        <Sheet onClose={close}>
          {!showPreview ? (
            <>
              <p className="-mt-2 text-[13px] text-mute">기관이 보낸 생기부 글을 학생마다 한 번에 넣어요 · AI는 쓰지 않아요</p>
              <ol className="flex flex-col gap-2.5 rounded-inner bg-bg p-3.5">
                {[["양식 받기", `대상 ${targets}명의 학번·이름이 채워져 있어요`], ["'생기부 글' 칸에 받은 글 붙여 넣기", "글이 빈 줄은 건너뛰어요 · 한 칸에 한 학생"], ["엑셀 올리기", "넣기 전에 찾은 학생·덮어쓸 학생을 먼저 보여 줘요"]].map(([t, d], i) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-[6px] bg-[#fff] text-[12px] font-bold text-key-strong">{i + 1}</span>
                    <span className="min-w-0"><b className="block text-[14px]">{t}</b><span className="block text-[12px] text-mute">{d}</span></span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-col gap-2 max-md:hidden">
                <span className="text-[13px] font-medium text-sub">양식</span>
                <TemplateSheet kind="external" />
              </div>
              <ExcelButtons kind="external" templateHref={href} onPick={read} busy={reading} uploadLabel="엑셀 올리기" />
              <p className="-mt-1 text-[12px] text-mute">올린 글은 AI에 보내지 않아요 · 확정은 학생마다 따로 해요</p>
            </>
          ) : preview.error ? (
            <>
              <FileRow name={preview.fileName} tag="읽지 못함" failed />
              <p className="flex items-start gap-1.5 text-[13px] font-medium text-bad" role="alert"><CircleAlert size={16} className="mt-px shrink-0" aria-hidden /> {preview.error}</p>
              <p className="text-[13px] text-sub">다른 엑셀은 읽지 않아요. 양식을 받아 &apos;생기부 글&apos; 칸에 글을 옮겨 적어 주세요.</p>
              <TemplateSheet kind="external" />
              <ExcelButtons kind="external" templateHref={href} onPick={read} busy={reading} uploadLabel="다시 올리기" />
              <div className="flex justify-end"><Button type="button" kind="outline" onClick={close} className="h-12 w-full md:h-10 md:w-20">닫기</Button></div>
            </>
          ) : (
            <Result preview={preview} overwrite={overwrite} setOverwrite={setOverwrite} addNon={addNon} setAddNon={setAddNon}
              saving={saving} error={saved && save.error ? save.error : null} onApply={apply} onCancel={close} />
          )}
        </Sheet>
      )}
    </>
  );
}

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/50 md:items-start md:px-6 md:pt-[80px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="외부 글 넣기" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col gap-3.5 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 md:max-h-[calc(100dvh-112px)] md:w-[560px] md:gap-4 md:rounded-card md:p-6">
        <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair md:hidden" />
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-[17px] font-bold md:text-[18px]">외부 글 넣기</h2>
          <button type="button" autoFocus onClick={onClose} aria-label="닫기" className="flex size-8 shrink-0 items-center justify-center text-sub"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FileRow({ name, tag, failed }: { name?: string; tag: string; failed?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-field bg-bg px-3 py-2.5">
      <FileSpreadsheet size={16} className="shrink-0 text-[#1D6F42]" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{name || "외부 글 파일"}</span>
      <span className={cx("shrink-0 rounded-chip px-2 py-0.5 text-[12px] font-bold", failed ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok")}>{tag}</span>
    </div>
  );
}

const SHOW = 10;

function Result({ preview: p, overwrite, setOverwrite, addNon, setAddNon, saving, error, onApply, onCancel }: {
  preview: ExternalPreview; overwrite: OverwriteMode; setOverwrite: (m: OverwriteMode) => void; addNon: boolean; setAddNon: (b: boolean) => void;
  saving: boolean; error: string | null; onApply: () => void; onCancel: () => void;
}) {
  const found = p.found ?? [];
  const miss = p.unmatched ?? [];
  const plan = planExternal(found.map((x) => ({ ...x, text: "" })), { overwrite, addNonTargets: addNon });
  const c = externalCounts({ found: found.map((x) => ({ ...x, text: "" })), unmatched: miss }, plan);
  const non = found.filter((x) => !x.target);
  const fin = found.filter((x) => x.existing === "finalized");
  const draftable = c.withDraft - c.finalized;
  const skipped = [...(p.empty ?? []), ...(p.duplicates ?? []), ...(p.tooLong ?? [])];
  return (
    <>
      <FileRow name={p.fileName} tag={`${p.lines ?? 0}줄 읽음`} />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {([["찾음", `${c.found}명`, false], ["못 찾음", `${c.unmatched}줄`, true], ["대상 아님", `${c.notTarget}명`, false], ["이미 초안", `${c.withDraft}명`, false]] as const).map(([k, v, warn]) => {
          const on = warn && c.unmatched > 0;
          return (
            <div key={k} className={cx("flex flex-col gap-0.5 rounded-inner px-3 py-2.5", on ? "bg-wait-soft" : "bg-bg")}>
              <span className={cx("text-[12px] font-medium", on ? "text-[#9A6400]" : "text-mute")}>{k}</span>
              <b className={cx("text-[18px] tabular-nums md:text-[20px]", on ? "text-[#9A6400]" : "text-ink")}>{v}</b>
            </div>
          );
        })}
      </div>
      {skipped.length > 0 && (
        <p className="-mt-1.5 text-[12px] text-mute">
          {[p.empty?.length ? `글이 빈 ${p.empty.length}줄` : "", p.duplicates?.length ? `같은 학생이 다시 적힌 ${p.duplicates.length}줄` : "", p.tooLong?.length ? `너무 긴 ${p.tooLong.length}줄(${p.tooLong.join("·")}줄)` : ""].filter(Boolean).join(" · ")}은 건너뛰어요
        </p>
      )}
      {miss.length > 0 && (
        <div className="flex flex-col gap-2 rounded-inner border border-[#F5D9A8] bg-[#fff] px-3.5 py-3">
          <b className="text-[13px] text-[#9A6400]">못 찾은 줄 · 등록된 학생이 아니거나 이름이 달라요</b>
          <ul className="flex flex-col gap-1.5">
            {miss.slice(0, SHOW).map((u, i) => (
              <li key={i} className="flex items-baseline gap-2.5 text-[13px]">
                <span className="w-9 shrink-0 text-[12px] font-medium tabular-nums text-mute">{u.line ? `${u.line}줄` : "—"}</span>
                <span className="min-w-0 break-all">{u.text}</span>
              </li>
            ))}
          </ul>
          {miss.length > SHOW && <span className="text-[12px] text-mute">외 {miss.length - SHOW}줄</span>}
          <span className="text-[12px] text-mute max-md:hidden">양식에서 고쳐 다시 올리면 돼요</span>
        </div>
      )}
      {non.length > 0 && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-inner bg-bg px-3.5 py-3">
          <input type="checkbox" checked={addNon} onChange={(e) => setAddNon(e.target.checked)} className="mt-0.5 size-[18px] shrink-0 accent-key" />
          <span className="min-w-0">
            <b className="block text-[14px]">대상이 아닌 학생 {non.length}명도 대상에 더해 넣기</b>
            <span className="block text-[12px] text-sub">{non.slice(0, 4).map((x) => x.label).join(", ")}{non.length > 4 ? ` 외 ${non.length - 4}명` : ""} · 끄면 이 학생 글은 건너뛰어요</span>
          </span>
        </label>
      )}
      {c.withDraft > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[14px] font-bold">이미 초안이 있는 학생 {c.withDraft}명은 어떻게 할까요?</legend>
          {([
            ["overwrite", "덮어쓰기 (새 버전)", draftable ? `${draftable}명은 새 글로 바꿔요 · 지금 초안은 이전 버전으로 남아요` : "바꿀 초안이 없어요 · 확정한 학생만 있어요"],
            ["skip", "건너뛰기", "초안이 없는 학생만 넣어요 · 이미 있는 초안은 그대로예요"],
          ] as const).map(([k, title, desc]) => {
            const on = overwrite === k;
            return (
              <label key={k} className={cx("flex cursor-pointer items-start gap-3 rounded-inner px-3.5 py-3.5 md:px-4", on ? "bg-[#F7F8FF] shadow-[inset_0_0_0_1.5px_var(--color-key)]" : "bg-[#fff] shadow-[inset_0_0_0_1px_var(--color-line)]")}>
                <input type="radio" name="overwrite" value={k} checked={on} onChange={() => setOverwrite(k)} className="mt-0.5 size-5 shrink-0 accent-key" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <b className={cx("text-[15px]", on ? "text-key-strong" : "text-ink")}>{title}</b>
                  <span className="text-[13px] text-sub">{desc}</span>
                </span>
              </label>
            );
          })}
          {fin.length > 0 && (
            <p className="rounded-field bg-bg px-3 py-2 text-[12px] font-medium text-sub">
              확정한 학생 {fin.length}명({fin.slice(0, 3).map((x) => x.label).join(", ")}{fin.length > 3 ? " …" : ""})은 어느 쪽이든 그대로 둬요
            </p>
          )}
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
        <span className="font-medium text-sub">넣을 학생</span>
        <b className="text-key-strong">{c.write}명</b>
        <span className="text-[12px] text-mute">새로 {c.fresh}{c.overwrite ? ` · 덮어쓰기 ${c.overwrite}` : ""}{c.kept ? ` · 그대로 ${c.kept}` : ""}{plan.addTargets.length ? ` · 대상에 더함 ${plan.addTargets.length}` : ""}</span>
      </div>
      {error && <p className="text-[13px] font-medium text-bad" role="alert">{error}</p>}
      <div className="h-px bg-line max-md:hidden" />
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <span className="min-w-0 flex-1 text-[12px] text-mute max-md:hidden">넣은 글은 &apos;직접 입력&apos; 초안이 돼요 · 확정은 학생마다 따로 해요</span>
        <div className="flex gap-2">
          <Button type="button" kind="outline" onClick={onCancel} className="h-12 flex-1 md:h-10 md:flex-none">취소</Button>
          <Button type="button" onClick={onApply} disabled={saving || c.write === 0} className="h-12 flex-[2] md:h-10 md:flex-none">
            {saving ? "넣는 중…" : c.write ? `${c.write}명 넣기` : "넣을 학생 없음"}
          </Button>
        </div>
      </div>
    </>
  );
}
