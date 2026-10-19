import { ClipboardPaste, Sparkles } from "lucide-react";
import { cx } from "@/components/ui";
import { ORIGIN_LABEL, type DraftOrigin } from "@/lib/domain/external-text";

// 초안 출처 태그 (Figma N46 컴포넌트 "N46 출처 태그" 516:564): 직접 입력 = 흰 바탕 + 회색 선, AI 초안 = 시안 #E2F7FC.
// 직접 작성(처음부터 교사가 쓴 글)은 태그를 달지 않는다 (지금처럼).
export function OriginTag({ origin, className }: { origin: DraftOrigin | null | undefined; className?: string }) {
  if (origin !== "external" && origin !== "ai") return null;
  const ext = origin === "external";
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-chip px-2 py-[2px] text-[12px] font-bold",
      ext ? "border border-hair bg-[#fff] text-sub" : "bg-new-soft text-[#0A86A3]", className)}>
      {ext ? <ClipboardPaste size={12} aria-hidden /> : <Sparkles size={12} aria-hidden />}
      {ORIGIN_LABEL[origin]}
    </span>
  );
}
