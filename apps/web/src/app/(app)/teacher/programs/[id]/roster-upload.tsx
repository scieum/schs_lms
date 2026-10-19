"use client";
import { startTransition, useActionState, useEffect, useState } from "react";
import { ArrowRight, CircleAlert, CircleCheck, FileSpreadsheet, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { ExcelButtons, TemplateSheet } from "@/components/excel-buttons";
import { TEMPLATE_HINT } from "@/lib/domain/excel-template";
import type { RosterMode } from "@/lib/domain/program-roster";
import { applyProgramRoster, previewProgramRoster, type ProgramRosterPreview, type ProgramRosterSave } from "./roster-actions";

// 프로그램 명단 업로드 (Figma N36 446:1649 · 448:13990 · 448:14419 · 448:14856 / 모바일 448:97258 · 448:97486 · 448:97749 · 448:98019):
// 학생별 현황 카드 머리의 N25 엑셀 버튼(작은 꼴) → 명단_양식.xlsx 읽기 → PC 가운데 모달 560 / 모바일 바텀시트에서
// "대상에 더하기"(기본) 또는 "이 명단으로 바꾸기"를 골라 저장. 학번·이름은 화면 상태로만 다루고 URL에 넣지 않는다.

export function RosterUpload({ programId }: { programId: string }) {
  const [preview, previewAction, reading] = useActionState<ProgramRosterPreview, FormData>(previewProgramRoster, {});
  const [save, saveAction, saving] = useActionState<ProgramRosterSave, FormData>(applyProgramRoster, {});
  const [closed, setClosed] = useState(0);
  const [pick, setPick] = useState<{ n: number; mode: RosterMode }>({ n: 0, mode: "add" });
  const [sub, setSub] = useState<{ p: number; s: number } | null>(null);

  const n = preview.n ?? 0;
  const mode: RosterMode = pick.n === n ? pick.mode : "add";
  const savedNow = !!sub && sub.p === n && (save.n ?? 0) > sub.s && !!save.done;
  const open = n > 0 && closed !== n && !savedNow;

  const read = (file: File) => {
    const fd = new FormData();
    fd.set("programId", programId);
    fd.set("file", file);
    startTransition(() => previewAction(fd));
  };
  const close = () => setClosed(n);

  return (
    <>
      <ExcelButtons kind="list" compact onPick={read} busy={reading} className="w-full md:w-auto" />
      {save.done && !open && (
        <p role="status" className="order-last flex w-full items-center gap-1.5 text-[13px] font-medium text-ok">
          <CircleCheck size={15} aria-hidden /> {save.done}
        </p>
      )}
      {open && (
        <RosterSheet onClose={close}>
          {preview.error ? (
            <ErrorView preview={preview} onPick={read} reading={reading} onClose={close} />
          ) : (
            <form
              action={saveAction}
              onSubmit={() => setSub({ p: n, s: save.n ?? 0 })}
              className="flex flex-col gap-3.5 md:gap-4"
            >
              <input type="hidden" name="programId" value={programId} />
              <input type="hidden" name="mode" value={mode} />
              {(preview.matched ?? []).map((s) => <input key={s.id} type="hidden" name="studentId" value={s.id} />)}
              <ResultView preview={preview} mode={mode} setMode={(m) => setPick({ n, mode: m })} />
              {save.error && sub?.p === n && <p className="text-[13px] font-medium text-bad" role="alert">{save.error}</p>}
              <div className="h-px bg-line max-md:hidden" />
              <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
                <span className="min-w-0 flex-1 text-[12px] text-mute max-md:hidden">{TEMPLATE_HINT} · 학생 응답·서류는 지우지 않아요</span>
                <div className="flex gap-2">
                  <Button type="button" kind="outline" onClick={close} className="h-12 flex-1 md:h-10 md:flex-none">취소</Button>
                  <Button disabled={saving || !canApply(preview, mode)} className="h-12 flex-[2] md:h-10 md:flex-none">
                    {saving ? "넣는 중…" : applyLabel(preview, mode)}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </RosterSheet>
      )}
    </>
  );
}

function canApply(p: ProgramRosterPreview, mode: RosterMode): boolean {
  const s = mode === "add" ? p.add : p.replace;
  return !!s && (p.matched?.length ?? 0) > 0 && (s.added > 0 || s.removed > 0);
}

function applyLabel(p: ProgramRosterPreview, mode: RosterMode): string {
  const s = mode === "add" ? p.add : p.replace;
  if (!s || !p.matched?.length) return "찾은 학생 없음";
  if (mode === "add") return s.added ? `${s.added}명 더하기` : "더할 학생 없음";
  return s.added || s.removed ? "명단으로 바꾸기" : "바뀔 학생 없음";
}

/** PC 가운데 모달 560 / 모바일 바텀시트 (N34 비슷한 문장 시트와 같은 틀) */
function RosterSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/50 md:items-start md:px-6 md:pt-[120px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="명단 업로드" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full flex-col gap-3.5 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 md:max-h-[calc(100dvh-160px)] md:w-[560px] md:gap-4 md:rounded-card md:p-6">
        <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair md:hidden" />
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-[17px] font-bold md:text-[18px]">명단 업로드</h2>
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
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{name || "명단 파일"}</span>
      <span className={cx("shrink-0 rounded-chip px-2 py-0.5 text-[12px] font-bold", failed ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok")}>{tag}</span>
    </div>
  );
}

function ErrorView({ preview, onPick, reading, onClose }: { preview: ProgramRosterPreview; onPick: (f: File) => void; reading: boolean; onClose: () => void }) {
  return (
    <>
      <FileRow name={preview.fileName} tag="읽지 못함" failed />
      <p className="flex items-start gap-1.5 text-[13px] font-medium text-bad" role="alert">
        <CircleAlert size={16} className="mt-px shrink-0" aria-hidden /> {preview.error}
      </p>
      <p className="text-[13px] text-sub">나이스 출석부·다른 엑셀은 읽지 않아요. 양식을 받아 학번 또는 학년·반·번호와 이름을 옮겨 적어 주세요.</p>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-sub">양식은 이렇게 생겼어요</span>
        <TemplateSheet kind="list" />
      </div>
      <ExcelButtons kind="list" onPick={onPick} busy={reading} uploadLabel="다시 올리기" />
      <div className="flex justify-end">
        <Button type="button" kind="outline" onClick={onClose} className="h-12 w-full md:h-10 md:w-20">닫기</Button>
      </div>
    </>
  );
}

const KEPT_SHOW = 12;
const UNMATCHED_SHOW = 10;

function ResultView({ preview: p, mode, setMode }: { preview: ProgramRosterPreview; mode: RosterMode; setMode: (m: RosterMode) => void }) {
  const found = p.matched?.length ?? 0;
  const miss = p.unmatched ?? [];
  const add = p.add!;
  const rep = p.replace!;
  const s = mode === "add" ? add : rep;
  const current = p.current ?? 0;
  // 지금 대상 중 명단에 없는 학생 (바꾸기에서 빠지거나 남는 학생)
  const missing = Math.max(0, current - rep.already);
  return (
    <>
      <FileRow name={p.fileName} tag={`${p.lines ?? 0}줄 읽음`} />
      <div className="grid grid-cols-3 gap-2">
        {([["찾음", found, false], ["이미 대상", add.already, false], ["못 찾음", miss.length, true]] as const).map(([k, v, warn]) => (
          <div key={k} className={cx("flex flex-col gap-0.5 rounded-inner px-3 py-2.5", warn && v ? "bg-wait-soft" : "bg-bg")}>
            <span className={cx("text-[12px] font-medium", warn && v ? "text-[#9A6400]" : "text-mute")}>{k}</span>
            <b className={cx("text-[18px] tabular-nums md:text-[20px]", warn && v ? "text-[#9A6400]" : "text-ink")}>{v}명</b>
          </div>
        ))}
      </div>
      {(p.duplicates ?? 0) > 0 && <p className="-mt-1.5 text-[12px] text-mute">같은 학생이 두 번 적힌 {p.duplicates}줄은 한 번만 셌어요</p>}
      {miss.length > 0 && (
        <div className="flex flex-col gap-2 rounded-inner border border-[#F5D9A8] bg-[#fff] px-3.5 py-3">
          <b className="text-[13px] text-[#9A6400]">못 찾은 줄 · 등록된 학생이 아니거나 이름이 달라요</b>
          <ul className="flex flex-col gap-1.5">
            {miss.slice(0, UNMATCHED_SHOW).map((u, i) => (
              <li key={i} className="flex items-baseline gap-2.5 text-[13px]">
                <span className="w-9 shrink-0 text-[12px] font-medium tabular-nums text-mute">{u.line ? `${u.line}줄` : "—"}</span>
                <span className="min-w-0 break-all">{u.text}</span>
              </li>
            ))}
          </ul>
          {miss.length > UNMATCHED_SHOW && <span className="text-[12px] text-mute">외 {miss.length - UNMATCHED_SHOW}줄</span>}
          <span className="text-[12px] text-mute max-md:hidden">양식에서 고쳐 다시 올리면 돼요</span>
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[14px] font-bold">어떻게 넣을까요?</legend>
        {([
          ["add", "대상에 더하기 (기본)", add.added ? `새로 찾은 ${add.added}명만 더해요 · 지금 대상 ${current}명은 그대로예요` : `새로 더할 학생이 없어요 · 모두 이미 대상이에요`],
          ["replace", "이 명단으로 바꾸기", missing ? `명단에 없는 ${missing}명을 대상에서 빼요 · 응답·서류·초안이 있는 학생은 빼지 않아요` : "명단에 없는 대상 학생이 없어요 · 새 학생만 더해요"],
        ] as const).map(([k, title, desc]) => {
          const on = mode === k;
          return (
            <label key={k} className={cx("flex cursor-pointer items-start gap-3 rounded-inner px-3.5 py-3.5 md:px-4", on ? "bg-[#F7F8FF] shadow-[inset_0_0_0_1.5px_var(--color-key)]" : "bg-[#fff] shadow-[inset_0_0_0_1px_var(--color-line)]")}>
              <input type="radio" name="pick" value={k} checked={on} onChange={() => setMode(k)} className="mt-0.5 size-5 shrink-0 accent-key" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <b className={cx("text-[15px]", on ? "text-key-strong" : "text-ink")}>{title}</b>
                <span className="text-[13px] text-sub">{desc}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {mode === "replace" && rep.kept.length > 0 && (
        <div className="flex flex-col gap-2 rounded-inner bg-bg px-3.5 py-3">
          <b className="text-[13px]">빼지 않고 남기는 학생 {rep.kept.length}명 · 이미 응답·서류가 있어요</b>
          <div className="flex flex-wrap gap-1.5">
            {rep.kept.slice(0, KEPT_SHOW).map((k) => (
              <span key={k.id} className="rounded-chip border border-line bg-[#fff] px-2 py-0.5 text-[12px] font-medium tabular-nums text-sub">{k.label} · {k.why.join("·")}</span>
            ))}
            {rep.kept.length > KEPT_SHOW && <span className="px-1 py-0.5 text-[12px] text-mute">외 {rep.kept.length - KEPT_SHOW}명</span>}
          </div>
          <span className="text-[12px] text-mute">응답·서류·초안은 지우지 않아요. 빼려면 학생 줄에서 따로 정리해 주세요.</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
        <span className="font-medium text-sub">대상 {current}명</span>
        <ArrowRight size={16} className="text-mute" aria-hidden />
        <b className="text-key-strong">{s.total}명</b>
        <span className="text-[12px] text-mute">
          {mode === "add" ? `더함 ${s.added}` : `더함 ${s.added} · 뺌 ${s.removed}${s.kept.length ? ` · 남김 ${s.kept.length}` : ""}`}
        </span>
      </div>
    </>
  );
}
