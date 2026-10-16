import { Tag } from "@/components/ui";

export type ActivityRow = { key: string; label: string; title: string; meta: string; status: string; content?: string };

const tone = (s: string) =>
  s === "작성 중" ? "bg-wait-soft text-wait" : s === "누가기록" ? "bg-soft text-sub" : undefined;

/** 활동·초안 목록 (흰 블록). open=true 면 펼쳐서 내용을 보여 준다 */
export function ActivityList({ items, empty = "아직 기록이 없어요", open }: { items: ActivityRow[]; empty?: string; open?: boolean }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-mute">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it) => (
        <li key={it.key} className="rounded-inner bg-white">
          <details open={open} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
              <span className="hidden w-20 shrink-0 text-[13px] text-sub md:block">{it.label}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{it.title}</span>
                <span className="block truncate text-xs text-mute"><span className="md:hidden">{it.label} · </span>{it.meta}</span>
              </span>
              <Tag tone={tone(it.status)}>{it.status}</Tag>
            </summary>
            {it.content && <p className="whitespace-pre-line border-t border-line px-4 py-3 text-sm leading-6 text-sub">{it.content}</p>}
          </details>
        </li>
      ))}
    </ul>
  );
}
