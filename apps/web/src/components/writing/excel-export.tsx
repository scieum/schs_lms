"use client";
import { useEffect, useState } from "react";
import { Check, Download, Lock, Plus, X } from "lucide-react";
import { cx } from "@/components/ui";
import { cellOf, DEFAULT_COLS, EXPORT_COLS, LOCKED_COLS, WHO_LABEL, type ExportCol, type ExportWho } from "@/lib/domain/records-export";
import { classRoster, type ClassRoster, type ScopeArg } from "@/app/(app)/teacher/class-actions";

// 엑셀로 받기 (Figma N42 ② (d) 492:36333 모달 600 · 모바일 494:30804 바텀시트).
// AI 원안과 최종 글 나란히 · 학생 한 줄 · 요약 시트. 실명이 들어가므로 경고 줄 고정. 받은 일은 감사 기록(범위 · 학생 수만).

export const exportHref = (scope: ScopeArg) => scope.kind === "setuk"
  ? `/teacher/setuk/export/xlsx?course=${scope.courseId}${scope.section ? `&section=${encodeURIComponent(scope.section)}` : ""}`
  : `/teacher/write/export/xlsx?area=${encodeURIComponent(scope.area)}${scope.clubId ? `&club=${scope.clubId}` : ""}`;

/** 미리보기 열 너비 (글 칸만 넓게) */
const COL_W: Record<ExportCol, number | undefined> = { 학번: 52, 이름: 52, 영역: 40, "AI 원안": undefined, "최종 글": undefined, "수정 %": 52, 바이트: 48, 상태: 40, 확정일: 48, 성취수준: 56 };

export function ExcelExport({ scope, roster: given, open, onClose, defaultWho = "all" }: { scope: ScopeArg; roster?: ClassRoster | null; open: boolean; onClose: () => void; defaultWho?: ExportWho }) {
  const [own, setOwn] = useState<ClassRoster | null>(null);
  // roster 를 넘기면(null = 불러오는 중) 그대로, 안 넘기면(undefined) 열 때 직접 불러온다
  const roster = given !== undefined ? given : own;
  const [range, setRange] = useState<"one" | "all">("one");
  const [who, setWho] = useState<ExportWho>(defaultWho);
  const [cols, setCols] = useState<ExportCol[]>(DEFAULT_COLS);
  useEffect(() => {
    if (!open || given !== undefined || own) return;
    void classRoster(scope).then(setOwn).catch(() => setOwn({ ok: false, error: "불러오지 못했어요" }));
  }, [open, given, own, scope]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", esc); };
  }, [open, onClose]);
  if (!open) return null;

  const ok = roster?.ok ? roster : null;
  const rows = ok?.rows ?? [];
  const n = { all: rows.length, confirmed: rows.filter((r) => r.상태 === "확정").length, draft: rows.filter((r) => r.상태 === "임시").length };
  const allowed = EXPORT_COLS.filter((c) => c !== "성취수준" || ok?.levels);
  const picked = allowed.filter((c) => cols.includes(c) || LOCKED_COLS.includes(c));
  const toggle = (c: ExportCol) => { if (LOCKED_COLS.includes(c)) return; setCols((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c])); };
  const shown = rows.filter((r) => who === "all" || (who === "confirmed" ? r.상태 === "확정" : r.상태 === "임시")).slice(0, 2);
  const many = range === "all" && !!ok?.all;
  const href = `${exportHref(scope)}&scope=${many ? "all" : "one"}&who=${who}&cols=${encodeURIComponent(picked.join(","))}`;
  const fileName = many ? ok?.fileAll ?? "" : ok?.fileName ?? "";
  const download = () => {
    const a = document.createElement("a");
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-navy/50 md:items-center md:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="엑셀로 받기" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2.5 md:w-[600px] md:rounded-card md:p-6">
        <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair md:hidden" />
        <div className="flex items-center gap-2">
          <h2 className="text-[18px] font-bold">엑셀로 받기</h2>
          <span className="flex-1" />
          <button type="button" onClick={onClose} aria-label="닫기" className="flex size-7 items-center justify-center text-mute"><X size={18} /></button>
        </div>
        <p className="-mt-2 break-keep text-[13px] text-sub">AI 원안과 최종 글을 나란히 받아요 · 학생 한 줄 · 요약 시트 같이</p>
        {!roster ? <p className="py-8 text-center text-[13px] text-mute" role="status">불러오는 중이에요</p> : !ok ? <p className="text-[13px] text-bad">{roster.ok ? "" : roster.error}</p> : (
          <>
            {ok.all && (
              <section className="flex flex-col gap-2">
                <h3 className="text-[13px] font-bold">범위</h3>
                <div className="grid grid-cols-2 gap-1 rounded-inner bg-bg p-1" role="radiogroup" aria-label="범위">
                  {([["one", ok.title, `${rows.length}명 · 시트 1개`], ["all", ok.homeroom ? "담임 영역 셋 다" : "내 분반 모두", ok.homeroom ? "자율 · 진로 · 행발 · 영역마다 시트" : `${ok.all.sheets}분반 · ${ok.all.students}명 · 분반마다 시트`]] as const).map(([k, t, sub]) => (
                    <button key={k} type="button" role="radio" aria-checked={range === k} onClick={() => setRange(k)}
                      className={cx("flex min-h-12 min-w-0 flex-col items-center justify-center rounded-control px-2 py-1.5 text-center", range === k ? "border border-key bg-[#fff] text-key-strong" : "text-sub")}>
                      <span className="max-w-full truncate text-[14px] font-bold">{t}</span>
                      <span className="max-w-full truncate text-[11px] text-mute">{sub}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section className="flex flex-col gap-2">
              <h3 className="text-[13px] font-bold">학생</h3>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="학생">
                {(["all", "confirmed", "draft"] as const).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={who === k} onClick={() => setWho(k)}
                    className={cx("inline-flex h-8 items-center whitespace-nowrap rounded-[16px] border px-3 text-[13px]", who === k ? "border-key bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-ink")}>
                    {WHO_LABEL[k]} {n[k]}
                  </button>
                ))}
              </div>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-[13px] font-bold">열</h3>
              <div className="flex flex-wrap gap-1.5">
                {allowed.map((c) => {
                  const lock = LOCKED_COLS.includes(c);
                  const on = lock || cols.includes(c);
                  return (
                    <button key={c} type="button" aria-pressed={on} disabled={lock} onClick={() => toggle(c)}
                      className={cx("inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-[16px] border px-3 text-[13px]", on ? "border-key bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-sub", lock && "cursor-default")}>
                      {lock ? null : on ? <Check size={12} strokeWidth={3} /> : <Plus size={12} />}{c}{lock && <Lock size={11} className="text-mute" aria-label="끌 수 없음" />}
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="overflow-hidden rounded-inner border border-line" aria-label="미리보기">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] table-fixed text-[11px]">
                  <thead className="bg-[#DFE3FF] text-[#26348C]">
                    <tr>{picked.map((c) => <th key={c} style={{ width: COL_W[c] }} className="whitespace-nowrap px-2 py-1.5 text-left font-bold">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {shown.map((r, i) => (
                      <tr key={i} className="border-t border-line align-top">
                        {picked.map((c) => (
                          <td key={c} className={cx("px-2 py-1.5", c === "바이트" && r.over && "font-bold text-[#9A6400]")}>
                            <div className={c === "AI 원안" || c === "최종 글" ? "line-clamp-2" : "truncate"}>{String(cellOf(r, c))}</div>
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!shown.length && <tr><td colSpan={picked.length} className="px-2 py-3 text-center text-mute">해당하는 학생이 없어요</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-bg px-2.5 py-2 text-[11px]">
                <span className="rounded-chip bg-[#fff] px-1.5 py-0.5 font-bold text-key-strong">시트 1 · {many ? (ok.homeroom ? "자율" : "분반마다") : ok.title}</span>
                <span className="rounded-chip bg-[#fff] px-1.5 py-0.5 font-bold text-ink">{many ? "… · " : "시트 2 · "}요약</span>
                <span className="hidden text-mute md:inline">요약 = 학생 수 · 확정 · 임시 · 빈 글 · 평균 수정 % · 한도 넘음</span>
              </div>
            </section>
            <div className="rounded-control bg-wait-soft px-3.5 py-2.5">
              <p className="flex items-center gap-1.5 text-[13px] font-bold text-[#9A6400]"><Lock size={13} className="shrink-0" /> 학생 이름이 들어 있어요 · 학교 밖으로 보내지 마세요</p>
              <p className="text-[12px] text-[#9A6400]">받은 일은 기록에 남아요 ({ok.homeroom || !ok.levels ? "범위" : "분반"} · 학생 수만)</p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <span className="min-w-0 flex-1 truncate text-[12px] text-mute">{fileName}<span className="md:hidden"> · 휴대폰에서는 파일 앱에 저장돼요</span></span>
              <div className="flex gap-2 [&>*]:h-12 [&>*]:flex-1 md:[&>*]:h-10 md:[&>*]:flex-none">
                <button type="button" onClick={onClose} className="rounded-control border border-hair bg-[#fff] px-4 text-[14px] font-bold">취소</button>
                <button type="button" onClick={download} disabled={!rows.length} className="inline-flex items-center justify-center gap-1.5 rounded-control bg-key px-4 text-[14px] font-bold text-white hover:bg-key-strong disabled:opacity-40">
                  <Download size={15} /> 엑셀 받기
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** /teacher/neis "보낼 기록" 행: "엑셀" 버튼 + 모달 (확정만이 기본) */
export function ExcelExportButton({ scope, disabled }: { scope: ScopeArg; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={disabled}
        className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-hair bg-[#fff] px-3 text-[13px] font-bold hover:bg-soft disabled:opacity-40">
        <Download size={14} />엑셀
      </button>
      <ExcelExport scope={scope} open={open} onClose={() => setOpen(false)} defaultWho="confirmed" />
    </>
  );
}
