"use client";
import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Download, Upload, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import type { ScopeArg } from "@/app/(app)/teacher/class-actions";
import { applyTextsImport, previewTextsImport, type ImportPreview } from "./actions";

// 갖고 있던 생기부 글 올리기 (Figma N66): [양식 받기](그 반 학생 · 지금 글이 채워진 엑셀) → 글 붙여 넣고 올리기 → 맞춘 줄 확인 → n명 임시 저장.
// 넣은 글은 새 버전(임시 저장) — 지금 글은 이전 버전으로 남고, 확정은 글 짓기에서 선생님이 한다.

const q = (s: ScopeArg) => (s.kind === "setuk"
  ? `course=${s.courseId}${s.section ? `&section=${encodeURIComponent(s.section)}` : ""}`
  : `area=${encodeURIComponent(s.area)}${s.clubId ? `&club=${s.clubId}` : ""}`);
const put = (fd: FormData, s: ScopeArg) => {
  if (s.kind === "setuk") { fd.set("course", s.courseId); if (s.section) fd.set("section", s.section); }
  else { fd.set("area", s.area); if (s.clubId) fd.set("club", s.clubId); }
};

export function ImportButton({ scope, className, mobile }: { scope: ScopeArg; className: string; mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}><Upload size={mobile ? 16 : 14} /> 엑셀로 올리기</button>
      {open && <ImportDialog scope={scope} onClose={() => setOpen(false)} />}
    </>
  );
}

function ImportDialog({ scope, onClose }: { scope: ScopeArg; onClose: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pv, setPv] = useState<ImportPreview | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const pick = (f: File | null) => f && start(async () => {
    setError(""); setDone(null); setFile(f);
    const fd = new FormData(); put(fd, scope); fd.set("file", f);
    setPv(await previewTextsImport(fd));
  });
  const ok = pv?.ok ? pv.rows.filter((r) => r.studentId) : [];
  const apply = () => file && start(async () => {
    const fd = new FormData(); put(fd, scope); fd.set("file", file);
    const r = await applyTextsImport(fd);
    if (!r.ok) return setError(r.error);
    setDone(r.added);
    router.refresh();
  });
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="엑셀로 올리기">
      <div className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-5 pt-4 md:max-w-[640px] md:rounded-[16px] md:px-7 md:py-6">
        <div className="flex items-center">
          <h2 className="flex-1 text-[18px] font-bold">갖고 있던 생기부 글 올리기</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-mute hover:text-ink"><X size={20} /></button>
        </div>
        <ol className="flex flex-col gap-1.5 rounded-control bg-bg px-3.5 py-3 text-[13px] text-sub">
          <li>① <a href={`/teacher/texts/import-template?${q(scope)}`} download className="inline-flex items-center gap-1 font-bold text-key-strong hover:underline"><Download size={13} /> 양식 받기</a> — 이 반 학생 학번 · 이름이 채워져 있어요</li>
          <li>② “생기부 글” 칸에 갖고 있던 글을 붙여 넣어요 (한 칸에 한 학생)</li>
          <li>③ 올리면 학생마다 <b>임시 저장</b>(새 버전)으로 들어가요 · 확정은 글 짓기에서</li>
        </ol>
        <button type="button" onClick={() => input.current?.click()} disabled={pending}
          className="flex items-center gap-3 rounded-inner border-2 border-dashed border-[#C2CAFF] bg-[#fff] px-4 py-3.5 text-left disabled:opacity-60">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-key-soft text-key"><Upload size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">{file ? file.name : "채운 양식 올리기"}</span>
            <span className="block text-[12px] text-mute">생기부글_양식.xlsx · 1행 제목은 그대로</span>
          </span>
        </button>
        <input ref={input} type="file" accept=".xlsx" className="sr-only" aria-label="생기부 글 엑셀" onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} />

        {pv && !pv.ok && <p className="text-[13px] text-bad" role="alert">{pv.error}</p>}
        {pv?.ok && (
          <>
            <div className="flex items-center gap-2 text-[13px]">
              <b>{pv.title}</b><span className="text-mute">· 넣을 글 {ok.length}명{pv.rows.length > ok.length ? ` · 못 넣음 ${pv.rows.length - ok.length}줄` : ""}</span>
            </div>
            <ul className="max-h-72 overflow-y-auto rounded-inner border border-line">
              {pv.rows.map((r) => (
                <li key={r.line} className="flex flex-col gap-1 border-t border-soft px-3.5 py-2.5 first:border-0">
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="w-12 shrink-0 tabular-nums text-mute">{r.studentNo}</span>
                    <b className="min-w-0 flex-1 truncate">{r.name}</b>
                    <span className={cx("shrink-0 tabular-nums", r.over ? "font-bold text-[#9a6400]" : "text-mute")}>{r.bytes.toLocaleString("ko-KR")} / {pv.maxBytes.toLocaleString("ko-KR")}B</span>
                    <span className={cx("shrink-0 rounded-chip px-1.5 py-0.5 text-[11px] font-bold", r.problem ? "bg-bad-soft text-bad" : r.replaces ? "bg-wait-soft text-[#9a6400]" : "bg-ok-soft text-ok")}>
                      {r.problem ?? (r.replaces ? "새 버전" : "넣음")}
                    </span>
                  </div>
                  <p className="truncate text-[12px] text-sub">{r.text}</p>
                </li>
              ))}
            </ul>
            {ok.some((r) => r.over) && <p className="text-[12px] text-[#9a6400]">한도를 넘은 글도 넣어요 · 글 짓기에서 줄이거나 확정할 때 다시 확인해요</p>}
          </>
        )}
        {done !== null && <p className="text-[13px] font-medium text-ok" role="status">✓ {done}명 임시 저장했어요 · 글 짓기에서 확인하고 확정해 주세요</p>}
        {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" kind="outline" className="flex-1 md:flex-none" onClick={onClose}>{done !== null ? "닫기" : "취소"}</Button>
          {done === null && <Button type="button" className="flex-1 md:flex-none" disabled={pending || !ok.length} onClick={apply}>{pending ? "넣는 중…" : `${ok.length}명 임시 저장`}</Button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
