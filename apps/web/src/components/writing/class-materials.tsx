"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Layers, List } from "lucide-react";
import { cx } from "@/components/ui";
import { currentLesson, type LessonView } from "@/lib/domain/lesson-plan";
import { LessonPlanCard } from "./lesson-plan-card";
import { CommonActivitiesCard, type CommonRow } from "./common-activities-card";

// 수업 자료 접기 (Figma N48 538:753): 기록 쓰기 화면 위의 차시별 활동(N43) · 공통 활동(N26) 카드를 한 줄 머리로 접어 둔다.
// PC 는 두 머리를 한 줄에 나란히, 모바일은 위아래. 누르면 원래 카드가 펼쳐지고(머리 끝 ⌃ 로 다시 접기) 동작은 그대로다.
// 차시 칩은 ① 활동 메모 칸 위에도 있어서(N43 f) 접어 두어도 메모 쓰기에는 지장이 없다.

type Common = { scope: string; rows: CommonRow[]; detailBase: string; today: string };

export function ClassMaterials({ lesson, year, common }: { lesson?: LessonView; year?: number; common?: Common }) {
  const [openLesson, setOpenLesson] = useState(false);
  const [openCommon, setOpenCommon] = useState(false);
  if (!lesson && !common) return null;

  const now = lesson ? currentLesson(lesson.items, lesson.today) : undefined;
  const lessonSummary = !lesson ? "" : !lesson.items.length ? "계획 없음 · 올리면 메모 칸에서 차시를 눌러 써요" : now ? `오늘 ${now.no}차시 · ${now.title}` : `${lesson.items.length}차시`;
  const rows = common?.rows ?? [];
  const commonSummary = rows.length ? `${rows[0].name}${rows.length > 1 ? ` 외 ${rows.length - 1}` : ""} · ${rows[0].chip.label}` : "다 같이 한 활동을 등록해 보세요";
  const both = !!lesson && !!common;
  const fold = (close: () => void, what: string) => (
    <button type="button" onClick={close} aria-expanded aria-label={`${what} 접기`} className="flex size-9 shrink-0 items-center justify-center rounded-control text-mute hover:bg-soft">
      <ChevronUp size={18} />
    </button>
  );

  return (
    <div className={cx("grid gap-3 md:gap-4", both && "md:grid-cols-2")}>
      {lesson && year != null && (openLesson ? (
        <div className={both ? "md:col-span-2" : undefined}>
          <LessonPlanCard view={lesson} year={year} fold={fold(() => setOpenLesson(false), "차시별 활동")} />
        </div>
      ) : (
        <FoldRow icon={<List size={16} />} title="차시별 활동" count={lesson.items.length || null} summary={lessonSummary} onOpen={() => setOpenLesson(true)} />
      ))}
      {common && (openCommon ? (
        <div className={both ? "md:col-span-2" : undefined}>
          <CommonActivitiesCard scope={common.scope} rows={common.rows} detailBase={common.detailBase} today={common.today} lessons={lesson?.items}
            fold={fold(() => setOpenCommon(false), "공통 활동")} />
        </div>
      ) : (
        <FoldRow icon={<Layers size={16} />} title="공통 활동" count={rows.length} summary={commonSummary} onOpen={() => setOpenCommon(true)} />
      ))}
    </div>
  );
}

/** 접힌 카드 머리 (Figma N48 538:726 · 538:744): 아이콘 칸 28 · 제목 15 Bold · 수 · 요약 한 줄 · ⌄ */
function FoldRow({ icon, title, count, summary, onOpen }: { icon: ReactNode; title: string; count: number | null; summary: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-expanded={false}
      className="surface flex min-h-[52px] w-full min-w-0 items-center gap-2.5 rounded-card py-3 pl-3.5 pr-3 text-left hover:bg-soft md:pl-4 md:pr-3.5">
      <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-field bg-key-soft text-key">{icon}</span>
      <span className="shrink-0 whitespace-nowrap text-[15px] font-bold">{title}</span>
      {count != null && <span className="shrink-0 text-[15px] text-mute">{count}</span>}
      <span className="min-w-0 flex-1 truncate text-[13px] text-sub">{summary}</span>
      <ChevronDown size={16} className="shrink-0 text-mute" aria-hidden />
    </button>
  );
}
