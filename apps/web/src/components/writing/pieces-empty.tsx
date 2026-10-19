import { Layers } from "lucide-react";

/** 활동 메모 빈 상태 (Figma N40 482:834): 점선 상자 · 아이콘 · 무엇이 생기는지 한 줄 + 예 */
export function PiecesEmpty({ what = "세특 글" }: { what?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-inner border border-dashed border-hair px-4 py-3.5">
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-key-soft text-key"><Layers size={16} /></span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[14px] font-bold">아직 활동 메모가 없어요</span>
        <span className="text-[13px] leading-5 text-mute break-keep">본 일을 한 줄씩 남기면 AI가 {what}로 써요 · 예: 오차 원인을 찾아 다시 측정함</span>
      </span>
    </div>
  );
}
