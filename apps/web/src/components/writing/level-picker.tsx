"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { setLevels } from "@/app/(app)/teacher/setuk/actions";
import { cx } from "@/components/ui";
import { ACHIEVEMENT_SCALES, guideLine, SCALE_TAG, type Level, type ScaleKey } from "@/lib/domain/achievement";

// 성취수준 고르기 (Figma N35 ③ 437:784 · 437:923): 세특 ② 본문 만들기 안, 조각 요약과 목표 줄 사이.
// 고른 수준은 AI 초안의 말투만 바꾼다(수준 글자는 글에 넣지 않음). 같은 칸을 다시 누르면 고르지 않음.

export function LevelPicker({ scale, value, onChange, busy }: { scale: ScaleKey; value: Level | null; onChange: (l: Level | null) => void; busy?: boolean }) {
  const list = ACHIEVEMENT_SCALES[scale];
  return (
    <div className="flex flex-col gap-3 rounded-inner border border-line p-4">
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-bold">성취수준</span>
        <span className="rounded-chip bg-soft px-1.5 py-0.5 text-[11px] font-medium text-sub">{SCALE_TAG[scale]}</span>
        <span className="ml-auto whitespace-nowrap text-[12px] text-mute">말투만 바꿔요</span>
      </div>
      <div role="radiogroup" aria-label="성취수준" className={cx("flex gap-1 rounded-inner bg-bg p-1", busy && "opacity-70")}>
        {list.map((x) => {
          const on = value === x.level;
          return (
            <button key={x.level} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? null : x.level)}
              className={cx("flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-control border py-1.5",
                on ? "border-key bg-[#fff] text-key-strong" : "border-transparent text-ink hover:bg-[#fff]/60")}>
              <span className="text-[16px] font-bold leading-5 md:text-[15px]">{x.level}</span>
              <span className={cx("max-w-full truncate text-[11px] font-medium", on ? "text-key-strong" : "text-mute")}>{x.name}</span>
            </button>
          );
        })}
      </div>
      <p className="flex gap-2 rounded-control bg-new-soft px-3 py-2.5 text-[13px] font-medium leading-5">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-new" /><span className="break-keep">{guideLine(value)}</span>
      </p>
      <p className="break-keep text-[12px] text-mute">수준 글자({scale === "A-E" ? "A~E" : "상·중·하"})는 글에 넣지 않고, 조각에 없는 성과는 만들지 않아요</p>
    </div>
  );
}

/** 학생 목록 수준 배지 (24×22): 정함 = 인디고 글자 · 안 정함 = 점선 "—" */
export function LevelBadge({ level, className }: { level: Level | null | undefined; className?: string }) {
  return level ? (
    <span aria-label={`성취수준 ${level}`} className={cx("inline-flex h-[22px] w-6 shrink-0 items-center justify-center rounded-chip bg-key-soft text-[12px] font-bold text-key-strong", className)}>{level}</span>
  ) : (
    <span aria-label="성취수준 안 정함" className={cx("inline-flex h-[22px] w-6 shrink-0 items-center justify-center rounded-chip border border-dashed border-hair bg-[#fff] text-[12px] text-mute", className)}>—</span>
  );
}

// ---------- 분반 성취수준 상태 (목록 배지 · ② 칸 · 한꺼번에 정하기가 같이 쓴다) ----------

type LevelsCtx = {
  scale: ScaleKey;
  levels: Record<string, Level | null>;
  /** 저장(낙관적으로 바로 바꾸고, 실패하면 되돌림). 돌려주는 값 = 바꾸기 전 수준(되돌리기용) */
  set: (items: { studentId: string; level: Level | null }[]) => Promise<{ error?: string; prev: { studentId: string; level: Level | null }[] }>;
};
const Ctx = createContext<LevelsCtx | null>(null);
export const useLevels = () => useContext(Ctx);

export function LevelsProvider({ courseId, scale, initial, children }: { courseId: string; scale: ScaleKey; initial: Record<string, Level | null>; children: ReactNode }) {
  const [levels, setLocal] = useState(initial);
  const set = useCallback<LevelsCtx["set"]>(async (items) => {
    const prev = items.map((x) => ({ studentId: x.studentId, level: levels[x.studentId] ?? null }));
    setLocal((cur) => ({ ...cur, ...Object.fromEntries(items.map((x) => [x.studentId, x.level])) }));
    let error: string | undefined;
    try {
      const r = await setLevels({ courseId, items });
      if (!r.ok) error = r.error;
    } catch {
      error = "저장하지 못했어요";
    }
    if (error) setLocal((cur) => ({ ...cur, ...Object.fromEntries(prev.map((x) => [x.studentId, x.level])) }));
    return { error, prev };
  }, [courseId, levels]);
  const value = useMemo(() => ({ scale, levels, set }), [scale, levels, set]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
