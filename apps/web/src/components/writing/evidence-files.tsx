"use client";
import { useRef, useState } from "react";
import { ChevronDown, FileText, Image as ImageIcon, RotateCw, Upload, X } from "lucide-react";
import { Tag, cx } from "@/components/ui";
import { prepareUpload } from "@/lib/client/shrink-upload";
import { composeKeywordMemo, parseKeywordMemo, type KeywordBlock } from "@/lib/domain/writing";
import type { EvidenceResult } from "@/lib/server/ai/read-evidence";

// 자료로 쓰기 (Figma N10 217:2485 · 행 상태 221:2394): 학생 자료 파일 → AI가 읽어 (주제)(활동)(키워드) 근거로.
// 읽은 내용은 펼쳐서 고칠 수 있다. 큰 PDF는 브라우저에서 쪽을 나눠 한 조각씩 읽고 이어 붙인다.

export type EvidenceItem = {
  id: number; file: File; state: "reading" | "done" | "fail";
  /** 읽은 활동 묶음 (자동 읽기면 주제·활동만) */
  blocks: KeywordBlock[];
  progress: number; error?: string; label?: "AI" | "자동";
};
export const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.hwpx,.txt,application/pdf,image/jpeg,image/png,image/webp,text/plain";

/** 읽은 근거를 AI 초안 입력으로: 자료마다 활동 묶음 */
export function evidenceMemo(items: EvidenceItem[]): string {
  return items.filter((i) => i.state === "done").map((i) => composeKeywordMemo(i.blocks)).filter(Boolean).join("\n\n");
}

const ext = (name: string) => name.split(".").pop()?.toUpperCase() ?? "";
const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const FIELD = "min-w-0 flex-1 rounded-control bg-soft px-3 py-2 text-[13px] leading-5 outline-none focus:ring-2 focus:ring-key";
const LABELS: [keyof KeywordBlock, string][] = [["topic", "(주제)"], ["activity", "(활동)"], ["keywords", "(키워드)"]];

export function EvidenceFiles({ items, setItems, read }: {
  items: EvidenceItem[];
  setItems: (f: (prev: EvidenceItem[]) => EvidenceItem[]) => void;
  read: (fd: FormData) => Promise<EvidenceResult>;
}) {
  const seq = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const patch = (id: number, p: Partial<EvidenceItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function readOne(id: number, file: File) {
    patch(id, { state: "reading", progress: 0, error: undefined });
    try {
      const parts = await prepareUpload(file);
      const texts: string[] = [];
      let label: "AI" | "자동" = "AI";
      for (const [i, part] of parts.entries()) {
        const fd = new FormData();
        fd.set("file", part);
        const r = await read(fd);
        if (!r.ok) return patch(id, { state: "fail", error: r.error });
        texts.push(r.text);
        label = r.label;
        patch(id, { progress: Math.round(((i + 1) / parts.length) * 100) });
      }
      const blocks = parseKeywordMemo(texts.join("\n\n")) ?? [{ topic: "", activity: texts.join(" "), keywords: "" }];
      patch(id, { state: "done", blocks, label });
      setOpen(id);
    } catch {
      patch(id, { state: "fail", error: "읽지 못했어요" });
    }
  }

  function add(files: File[]) {
    for (const file of files) {
      const id = ++seq.current;
      setItems((xs) => [...xs, { id, file, state: "reading", blocks: [], progress: 0 }]);
      void readOne(id, file);
    }
  }

  const setBlock = (it: EvidenceItem, bi: number, k: keyof KeywordBlock, v: string) =>
    patch(it.id, { blocks: it.blocks.map((b, j) => (j === bi ? { ...b, [k]: v } : b)) });

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add([...e.dataTransfer.files]); }}
        className={cx("flex flex-col items-center gap-1 rounded-inner border border-dashed px-4 py-4 text-center md:py-5", drag ? "border-key bg-key-soft/40" : "border-[#C4CAD1] bg-[#fff] hover:bg-soft")}>
        <span className="flex items-center gap-1.5 text-[14px] font-bold text-key-strong"><Upload size={18} className="text-key" />파일 올리기</span>
        <span className="text-[12px] text-mute">PDF·이미지·HWPX·TXT · 여러 개</span>
      </button>
      <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />
      {items.map((it) => {
        const expanded = it.state === "done" && open === it.id;
        const Icon = it.file.type.startsWith("image/") ? ImageIcon : FileText;
        return (
          <div key={it.id} className="rounded-inner border border-line bg-[#fff]">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-soft text-sub"><Icon size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{it.file.name}</p>
                {it.state === "fail"
                  ? <p className="truncate text-[12px] text-bad">{it.error}</p>
                  : <p className="text-[12px] text-mute">{ext(it.file.name)} · {size(it.file.size)}</p>}
                {it.state === "reading" && (
                  <div className="mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-line md:w-40" aria-hidden>
                    <div className={cx("h-full rounded-full bg-key", !it.progress && "w-1/3 animate-pulse")} style={it.progress ? { width: `${it.progress}%` } : undefined} />
                  </div>
                )}
              </div>
              {it.state === "reading" && <span className="shrink-0 rounded-chip bg-[#FFF5E0] px-2 py-0.5 text-[12px] font-bold text-[#9A6400]" role="status">읽는 중{it.progress ? ` ${it.progress}%` : ""}</span>}
              {it.state === "done" && (
                <button type="button" onClick={() => setOpen(expanded ? null : it.id)} aria-expanded={expanded} className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded-chip bg-[#E3F8EE] px-2 py-0.5 text-[12px] font-bold text-[#00B86B]">읽음</span>
                  <ChevronDown size={16} className={cx("text-sub transition-transform", expanded && "rotate-180")} />
                </button>
              )}
              {it.state === "fail" && (
                <>
                  <span className="shrink-0 rounded-chip bg-[#FEECEE] px-2 py-0.5 text-[12px] font-bold text-bad">못 읽음</span>
                  <button type="button" aria-label="다시 읽기" onClick={() => readOne(it.id, it.file)} className="shrink-0 text-sub hover:text-ink"><RotateCw size={16} /></button>
                </>
              )}
              <button type="button" aria-label={`${it.file.name} 빼기`} onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))} className="shrink-0 text-mute hover:text-ink"><X size={16} /></button>
            </div>
            {expanded && (
              <div className="flex flex-col gap-2 border-t border-line px-3.5 pb-3.5 pt-3">
                <p className="flex items-center gap-1.5 text-[12px] font-bold"><Tag tone="bg-new-soft text-new">{it.label ?? "AI"}</Tag>읽은 내용</p>
                {it.blocks.map((b, bi) => (
                  <div key={bi} className={cx("flex flex-col gap-2", bi > 0 && "border-t border-line pt-2")}>
                    {LABELS.map(([k, l]) => (
                      <label key={k} className="flex items-start gap-2">
                        <span className="w-11 shrink-0 pt-2 text-[12px] font-medium text-sub md:w-[52px]">{l}</span>
                        {k === "activity"
                          ? <textarea value={b[k]} onChange={(e) => setBlock(it, bi, k, e.target.value)} rows={4} maxLength={800} className={cx(FIELD, "resize-y")} />
                          : <input value={b[k]} onChange={(e) => setBlock(it, bi, k, e.target.value)} maxLength={200} className={FIELD} />}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
