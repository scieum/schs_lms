// N39 지워지는 날 안내 (Figma 469:586): 초안 자료 등록 · 학생 팝업 · 학생 제출 화면. 14일 이내면 노랑, 이미 지웠으면 회색 한 줄.
import { CalendarDays } from "lucide-react";
import { cx } from "@/components/ui";
import { noticeLine } from "@/lib/domain/retention";

export function RetentionNotice({ rawDue, textDue, base, today, purgedOn, className }: {
  rawDue: string | null; textDue: string | null; base: string; today: string;
  /** 원본을 이미 지운 날 (있으면 회색 한 줄) */
  purgedOn?: string | null;
  className?: string;
}) {
  if (purgedOn) {
    return (
      <div className={cx("flex items-center gap-2.5 rounded-inner bg-soft px-4 py-3 text-[13px] text-mute", className)}>
        <CalendarDays size={18} className="shrink-0" />
        <p>원본은 {purgedOn}에 지웠어요 · 읽은 글로 만든 초안은 그대로</p>
      </div>
    );
  }
  const n = noticeLine(rawDue, today);
  return (
    <div className={cx("flex items-start gap-2.5 rounded-inner px-4 py-3", n.soon ? "bg-wait-soft text-[#9a6400]" : "bg-soft text-ink", className)}>
      <CalendarDays size={18} className={cx("mt-0.5 shrink-0", n.soon ? "" : "text-sub")} />
      <div className="min-w-0">
        <p className="text-[14px] font-bold">{n.title}</p>
        <p className={cx("text-[13px]", n.soon ? "" : "text-sub")}>
          올린 원본 파일 · {base}{textDue ? ` · 파일에서 읽은 글은 ${textDue}` : ""} · 확정한 초안은 남아요
        </p>
      </div>
    </div>
  );
}

/** 올린 파일 목록 바닥 한 줄 (12 회색, 14일 이내면 노랑) */
export function RetentionLine({ due, today, className }: { due: string | null; today: string; className?: string }) {
  if (!due) return null;
  const n = noticeLine(due, today);
  return (
    <p className={cx("mt-3 text-[12px]", n.soon ? "font-bold text-[#9a6400]" : "text-mute", className)}>
      {n.soon ? n.title.replace(/ \(.*\)$/, "") : `올린 파일은 ${due}에 지워져요`} · 지우기 전에 받아 두려면 파일마다 받기
    </p>
  );
}
