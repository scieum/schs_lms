import { cx } from "@/components/ui";
import { STAGE_LABEL, type Stage } from "@/lib/domain/program";

const STAGES: Stage[] = ["S1", "S2", "S3", "S4", "S5"];

/** 초안 단계별 학생 수 5칸 (A1·A4). 가장 몰린 단계만 인디고로 */
export function StageStrip({ count, busy, code = true }: { count: Record<Stage, number>; busy: Stage; code?: boolean }) {
  return (
    <div className="grid grid-cols-5 gap-1.5 md:gap-2">
      {STAGES.map((s) => (
        <div key={s} className={cx("flex flex-col items-center gap-0.5 rounded-inner py-2.5 md:py-3", s === busy ? "bg-key text-white" : "bg-white")}>
          <span className="text-[17px] font-bold md:text-xl">{count[s]}</span>
          <span className={cx("text-[11px] md:text-[12px]", s === busy ? "text-white/80" : "text-mute")}>{code ? `${s} ` : ""}{STAGE_LABEL[s]}</span>
        </div>
      ))}
    </div>
  );
}
