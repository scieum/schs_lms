"use client";
// 초안 검토 · 근거 자료 "제출 서류" 블록 (Figma N33 408:90563 / 408:90938): 블록 머리 오른쪽 휴지통 → 그 자리 확인
// ("이미 만든 초안은 그대로예요") → 5초 되돌리기. 이미 만든 초안은 건드리지 않는다.
import { useState } from "react";
import { FileText } from "lucide-react";
import { Collapse, DeleteConfirm, DeleteFileButton, useDelayedDelete } from "@/components/materials/delete-file";
import { deleteMaterials } from "../programs/[id]/materials/actions";

export type EvidenceDoc = { id: string; fileName: string; pages: number | null; text: string | null };

export function EvidenceDocs({ programId, docs }: { programId: string; docs: EvidenceDoc[] }) {
  const [asking, setAsking] = useState<string | null>(null);
  const del = useDelayedDelete((ids) => {
    const fd = new FormData();
    fd.set("programId", programId);
    for (const id of ids) fd.append("materialId", id);
    return deleteMaterials(fd);
  });
  const shown = docs.filter((m) => !del.isHidden(m.id));
  if (docs.length === 0) return null;
  return (
    <>
      {shown.length > 0 && (
        <div className="mb-4 flex flex-col">
          <span className="mb-2 text-[13px] font-medium text-sub">제출 서류 {shown.length}</span>
          {docs.map((m) => {
            const href = `/teacher/programs/${programId}/materials/file/${m.id}`;
            const on = asking === m.id;
            return (
              <Collapse key={m.id} hidden={del.isHidden(m.id)}>
                <div className="mb-2 flex flex-col gap-2 rounded-inner bg-white p-3 hover:bg-key-soft has-[[role=group]]:hover:bg-white">
                  <div className="-my-1 flex items-center gap-1">
                    <a href={href} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-medium hover:underline">
                      <FileText size={14} className="shrink-0" aria-hidden /> <span className="truncate">{m.fileName}{m.pages ? ` · ${m.pages}쪽` : ""}</span>
                    </a>
                    <DeleteFileButton fileName={m.fileName} active={on} onClick={() => setAsking(on ? null : m.id)} className="-mr-1" />
                  </div>
                  {on ? (
                    <DeleteConfirm layout="stack" tone="bg-[#fff]" title="이 파일을 지울까요?" sub="이미 만든 초안은 그대로예요"
                      onCancel={() => setAsking(null)} onConfirm={() => { setAsking(null); del.remove([m.id]); }} />
                  ) : m.text ? (
                    <a href={href} target="_blank" rel="noreferrer" tabIndex={-1} className="rounded-field bg-soft p-2.5 text-[13px] leading-6 text-sub">&quot;{m.text.length > 160 ? `${m.text.slice(0, 160)}…` : m.text}&quot;</a>
                  ) : (
                    <span className="text-[12px] text-mute">글을 아직 읽지 않았어요 (자료 등록에서 AI로 읽기)</span>
                  )}
                </div>
              </Collapse>
            );
          })}
        </div>
      )}
      {del.snackbar}
    </>
  );
}
