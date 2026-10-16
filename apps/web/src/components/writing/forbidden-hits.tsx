import { cx } from "@/components/ui";
import type { ForbiddenHit } from "@/lib/domain/forbidden";

// 금칙어 목록: 금지(빨강, 확정 막음) · 확인(노랑, 경고만). 낱말과 기재요령 근거를 같이 보여 준다
export function ForbiddenHits({ hits }: { hits: ForbiddenHit[] }) {
  if (!hits.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {hits.map((h) => (
        <li key={`${h.category}-${h.word}`} className="flex items-start gap-2 text-[12px]">
          <span className={cx("shrink-0 rounded-chip px-1.5 py-0.5 font-bold", h.level === "ban" ? "bg-bad-soft text-bad" : "bg-wait-soft text-wait")}>
            {h.level === "ban" ? "금지" : "확인"}
          </span>
          <span className="min-w-0">
            <b className="text-ink">‘{h.word}’</b> <span className="text-mute">{h.category} · {h.reason}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
