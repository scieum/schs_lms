"use client";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { Bell, ChevronRight, FileText, Paperclip, X } from "lucide-react";
import { cx } from "@/components/ui";
import { ChipDeleteButton, DeleteConfirm, useDelayedDelete } from "@/components/materials/delete-file";
import { remindOne, studentDetail, type StudentDetail } from "./actions";
import { deleteMaterials } from "./materials/actions";

// 프로그램 상세 · 학생 활동 팝업 (Figma N24 339:331): PC 가운데 560 창 · 모바일 바텀시트.
// 행을 누르면 열리고, 그 학생 것만 서버 액션으로 불러온다. 행 오른쪽 버튼(보기·알림·직접 작성)은 그대로 동작한다.

export type PopupStudent = { id: string; name: string; sub: string };

/** 학생별 현황 한 행: 행 빈 곳을 누르면 팝업. 안의 버튼·링크·폼은 그대로 */
export function StudentRowItem({ programId, student, className, children }: { programId: string; student: PopupStudent; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const onClick = (e: MouseEvent<HTMLLIElement>) => {
    if ((e.target as HTMLElement).closest("a, button, form, input, select, textarea")) return;
    setOpen(true);
  };
  return (
    <>
      <li
        tabIndex={0}
        className={cx("cursor-pointer outline-none hover:bg-bg focus-visible:ring-2 focus-visible:ring-key md:rounded-inner", className)}
        onClick={onClick}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(true); } }}
      >
        {children}
      </li>
      {open && <StudentPopup programId={programId} student={student} onClose={() => setOpen(false)} />}
    </>
  );
}

const CHIP = "inline-flex shrink-0 items-center whitespace-nowrap rounded-chip px-2 py-[3px] text-[12px] font-bold";
const AMBER = "bg-wait-soft text-[#9A6400]";

function draftChip(review: StudentDetail["review"]): [string, string] {
  switch (review) {
    case "검토 대기": return ["초안 검토 대기", AMBER];
    case "확정": return ["초안 확정", "bg-ok-soft text-ok"];
    case "반려": return ["초안 반려", "bg-bad-soft text-bad"];
    case "생성 실패": return ["초안 생성 실패", "bg-bad-soft text-bad"];
    case "생성 중": return ["초안 만드는 중", "bg-key-soft text-key-strong"];
    default: return ["초안 작성 전", "bg-soft text-mute"];
  }
}

function StudentPopup({ programId, student, onClose }: { programId: string; student: PopupStudent; onClose: () => void }) {
  const [data, setData] = useState<StudentDetail | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, startSend] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    studentDetail(programId, student.id).then((d) => alive && setData(d)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [programId, student.id, reload]);

  // N33 서류 칩 지우기: 칩 × → 칩 줄 아래 작은 확인 → 5초 되돌리기, 지운 뒤 팝업 데이터 다시 읽기
  const [asking, setAsking] = useState<string | null>(null);
  const del = useDelayedDelete((ids) => {
    const fd = new FormData();
    fd.set("programId", programId);
    for (const id of ids) fd.append("materialId", id);
    return deleteMaterials(fd);
  }, { onDone: () => setReload((n) => n + 1) });
  const mats = data ? data.materials.filter((m) => !del.isHidden(m.id)) : [];
  const askedFile = mats.find((m) => m.id === asking);

  // 열릴 때 닫기 버튼에 초점, 닫히면 원래 자리로 · 뒤 화면 스크롤 막기
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; before?.focus?.(); };
  }, []);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab" || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const remind = () => {
    const fd = new FormData();
    fd.set("programId", programId);
    fd.set("studentId", student.id);
    startSend(async () => { await remindOne(fd); setSent(true); });
  };

  const empty = !!data && data.answers.length === 0 && mats.length === 0;
  const [dLabel, dTone] = draftChip(data?.review ?? "대기");
  const unit = data?.draft?.unit === "chars" ? "자" : "B";
  const pct = data?.draft ? Math.min(100, Math.round((data.draft.length / Math.max(1, data.draft.max)) * 100)) : 0;
  const footBtn = "h-12 md:h-11";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-navy/48 md:items-center md:p-6" onClick={onClose}>
      {del.snackbar && <div onClick={(e) => e.stopPropagation()}>{del.snackbar}</div>}
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={`${student.name} 활동`}
        onKeyDown={onKey}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full flex-col overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-5 pt-2 md:max-h-[calc(100dvh-48px)] md:w-[560px] md:rounded-card md:p-6"
      >
        <span aria-hidden className="mx-auto mb-2 h-1 w-9 shrink-0 rounded-[2px] bg-hair md:hidden" />
        <div className="flex flex-col gap-4 md:gap-5">
          {/* 머리 */}
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-key-soft text-[15px] font-bold text-key-strong">{student.name.slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] font-bold">{student.name}</div>
              <div className="truncate text-[13px] text-mute">{student.sub}</div>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기" className="-mr-1.5 flex size-8 items-center justify-center rounded-control text-mute hover:bg-soft"><X size={20} /></button>
          </div>

          {data === undefined && !failed ? (
            <p className="py-10 text-center text-[14px] text-mute" role="status">불러오는 중…</p>
          ) : failed || data === null ? (
            <p className="py-10 text-center text-[14px] text-mute" role="alert">학생 활동을 불러오지 못했어요</p>
          ) : data && (
            <>
              {/* 상태 칩 */}
              <div className="-mt-1 flex flex-wrap gap-1.5">
                {data.survey !== null && <span className={cx(CHIP, data.survey ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")}>{data.survey ? "설문 응답함" : "설문 안 함"}</span>}
                {data.docs !== null && <span className={cx(CHIP, mats.length ? "bg-key-soft text-key-strong" : "bg-soft text-mute")}>{mats.length ? `서류 ${mats.length}개` : "서류 없음"}</span>}
                <span className={cx(CHIP, dTone)}>{dLabel}</span>
              </div>

              {/* 한 활동 */}
              <section className="flex flex-col gap-2.5">
                <h3 className="flex items-baseline gap-1.5 text-[14px] font-bold">
                  한 활동
                  {!empty && (
                    <span className="text-[12px] font-normal text-mute">
                      {[data.answers.length ? `설문 ${data.answers.length}` : "", mats.length ? `서류 ${mats.length}` : ""].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </h3>
                {empty ? (
                  <div className="flex flex-col items-center gap-2 rounded-inner bg-bg py-6">
                    <FileText size={24} className="text-faint" aria-hidden />
                    <p className="text-[14px] text-sub">설문 응답도 서류도 없어요</p>
                  </div>
                ) : (
                  <>
                    {data.answers.length > 0 && (
                      <div className="flex flex-col gap-3 rounded-inner bg-bg p-3.5">
                        {data.answers.slice(0, 4).map((a, i) => (
                          <div key={i} className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-mute">{a.title}</span>
                            <p className="line-clamp-2 text-[14px] leading-[22px] text-ink">{a.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {mats.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {mats.map((m) => (
                            <span key={m.id} className={cx("group/chip inline-flex min-w-0 max-w-full items-center rounded-chip border bg-[#fff] pr-1", asking === m.id ? "border-bad" : "border-line")}>
                              <a href={`/teacher/programs/${programId}/materials/file/${m.id}`} target="_blank" rel="noopener"
                                className="inline-flex min-w-0 items-center gap-1.5 rounded-chip py-1.5 pl-2.5 pr-1 text-[13px] font-medium text-ink hover:underline">
                                <Paperclip size={14} className="shrink-0 text-sub" aria-hidden />
                                <span className="truncate">{m.fileName}</span>
                                <ChevronRight size={12} className={cx("shrink-0 text-mute", "max-md:hidden md:group-hover/chip:hidden md:group-focus-within/chip:hidden", asking === m.id && "md:hidden")} aria-hidden />
                              </a>
                              <ChipDeleteButton fileName={m.fileName} active={asking === m.id} onClick={() => setAsking(asking === m.id ? null : m.id)} />
                            </span>
                          ))}
                        </div>
                        {askedFile && (
                          <DeleteConfirm layout="small" title={`‘${askedFile.fileName}’ 파일을 지울까요?`} onCancel={() => setAsking(null)}
                            onConfirm={() => { setAsking(null); del.remove([askedFile.id]); }} />
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* 기록: 초안이 있을 때만 */}
              {data.draft && (
                <section className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-bold">기록</h3>
                    <span className={cx(CHIP, dTone)}>{dLabel.replace(/^초안 /, "")}</span>
                    <span className="ml-auto whitespace-nowrap text-[12px] text-mute tabular-nums">
                      <b className="text-ink">{data.draft.length.toLocaleString("ko-KR")}</b> / {data.draft.max.toLocaleString("ko-KR")}{unit}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden>
                    <div className="h-full rounded-full bg-key" style={{ width: `${pct}%` }} />
                  </div>
                  {/* 말줄임은 안쪽 글에만 (안쪽 여백에 넷째 줄이 비치지 않게) */}
                  <div className="rounded-inner bg-bg p-3.5">
                    <p className="line-clamp-3 text-[14px] leading-[22px] text-ink">{data.draft.content}</p>
                  </div>
                </section>
              )}
            </>
          )}

          {/* 바닥 */}
          <div className="flex items-center gap-2 md:justify-end">
            <button type="button" onClick={onClose} className={cx(footBtn, "w-[88px] shrink-0 rounded-control text-[14px] font-medium text-sub hover:bg-soft md:w-auto md:px-4")}>닫기</button>
            {data?.jobId ? (
              <Link href={`/teacher/drafts?d=${data.jobId}`} className={cx(footBtn, "inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-control bg-key px-5 text-[15px] font-bold text-white hover:bg-key-strong md:flex-none")}>
                활동 자세히 보기 <ChevronRight size={18} aria-hidden />
              </Link>
            ) : data?.canRemind ? (
              <button type="button" onClick={remind} disabled={sending || sent}
                className={cx(footBtn, "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-key-soft px-5 text-[15px] font-bold text-key-strong hover:bg-[#e3e7ff] disabled:cursor-not-allowed md:flex-none")}>
                <Bell size={16} aria-hidden /> {sent ? "알림을 보냈어요" : sending ? "보내는 중…" : "응답 알림 보내기"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
