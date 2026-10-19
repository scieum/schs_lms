"use client";
// 초안 자료 등록 · 올린 파일 목록 (Figma N33 408:12759 ~ 408:14718): 행 끝 휴지통 → 인라인 확인, 머리 "고르기" → 체크 + 고름 바,
// 지운 뒤 5초 "되돌리기" 스낵바. 행 안의 내용(학생 지정·페이지 나누기)은 서버에서 만든 그대로 받는다.
import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cx } from "@/components/ui";
import { Collapse, DeleteConfirm, DeleteFileButton, SelectBar, useDelayedDelete } from "@/components/materials/delete-file";
import type { MaterialStatus } from "@/lib/domain/program";
import { deleteMaterials } from "./actions";

export type FileItem = { id: string; fileName: string; status: MaterialStatus; sub: string; body: ReactNode; actions: ReactNode };

export function FileList({ programId, items }: { programId: string; items: FileItem[] }) {
  const [asking, setAsking] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const del = useDelayedDelete((ids) => {
    const fd = new FormData();
    fd.set("programId", programId);
    for (const id of ids) fd.append("materialId", id);
    return deleteMaterials(fd);
  });
  const shown = items.filter((m) => !del.isHidden(m.id));
  const n = (s: MaterialStatus) => shown.filter((m) => m.status === s).length;
  const counts = { matched: n("matched"), review: n("needs_review"), bundle: n("bundle") };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const stopPicking = () => { setPicking(false); setPicked([]); };
  const pickedShown = picked.filter((id) => shown.some((m) => m.id === id));

  return (
    <div className="min-w-0">
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[14px] font-bold">
        올린 파일 {shown.length}개
        <span className="rounded-chip bg-white px-2 py-0.5 text-xs font-medium text-sub">매칭 {counts.matched}</span>
        {counts.review > 0 && <span className="rounded-chip bg-wait-soft px-2 py-0.5 text-xs font-medium text-wait">확인 필요 {counts.review}</span>}
        {counts.bundle > 0 && <span className="rounded-chip bg-white px-2 py-0.5 text-xs font-medium text-sub">합본 {counts.bundle}</span>}
        {shown.length > 0 && !picking && (
          <button type="button" onClick={() => { setPicking(true); setAsking(null); }}
            className="ml-auto h-8 whitespace-nowrap rounded-control px-1.5 text-[13px] font-medium text-sub hover:bg-soft">고르기</button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-mute">아직 올린 파일이 없어요</p>
      ) : (
        <ul>
          {items.map((m) => {
            const gone = del.isHidden(m.id);
            const last = shown[shown.length - 1]?.id === m.id;
            const on = picked.includes(m.id);
            return (
              <Collapse key={m.id} as="li" hidden={gone}>
                {asking === m.id ? (
                  <div className={cx("py-2", !last && "border-b border-line")}>
                    <DeleteConfirm title="이 파일을 지울까요?" sub={`${m.fileName}${m.sub ? ` · ${m.sub}` : ""}`} onCancel={() => setAsking(null)}
                      onConfirm={() => { setAsking(null); del.remove([m.id]); }} />
                  </div>
                ) : (
                  <div className={cx("flex items-center gap-3 py-3", !last && "border-b border-line")}>
                    {picking && (
                      <button type="button" role="checkbox" aria-checked={on} aria-label={`‘${m.fileName}’ 고르기`} onClick={() => toggle(m.id)}
                        className={cx("flex size-5 shrink-0 items-center justify-center rounded-chip border", on ? "border-key bg-key text-white" : "border-hair bg-[#fff]")}>
                        {on && <Check size={13} strokeWidth={3} aria-hidden />}
                      </button>
                    )}
                    {m.body}
                    {m.actions}
                    {!picking && <DeleteFileButton fileName={m.fileName} onClick={() => setAsking(m.id)} />}
                  </div>
                )}
              </Collapse>
            );
          })}
        </ul>
      )}
      {picking && shown.length > 0 && (
        <SelectBar count={pickedShown.length} total={shown.length}
          onAll={() => setPicked(pickedShown.length === shown.length ? [] : shown.map((m) => m.id))}
          onCancel={stopPicking}
          onDelete={() => { del.remove(pickedShown); stopPicking(); }} />
      )}
      {del.snackbar}
    </div>
  );
}
