"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cx } from "@/components/ui";
import { neisBytes } from "@/lib/domain/length";
import { shortMd } from "@/lib/domain/log-date";
import { orderPieces, type MergePiece } from "@/lib/domain/merge";
import { RecordCompetency } from "./record-competency";
import { PieceComposer, type ComposerProps } from "./piece-composer";
import { PieceChip } from "./piece-chip";
import { StepHead } from "./step-head";
import { PiecesEmpty } from "./pieces-empty";

// ① 활동 메모 (Figma N40, N32 구조): 단계 머리 + 활동 메모 추가(메모 | 자료) + 상자 없는 메모 목록 · 없으면 빈 상태.
// 남긴 메모(코드 이름은 조각)는 생기부 조각 화면과 ② AI로 쓰기에 같이 모인다. 메모가 있을 때만 역량 보기(N18) 스위치를 보여 준다.

const SHOWN = 4;

export function PiecesCard({ studentId, load, onPieces, note, done, what, ...composer }: Omit<ComposerProps, "onAdded"> & {
  studentId: string;
  load: () => Promise<MergePiece[]>;
  /** 불러온 조각을 editor 에 알린다 (② 조각 합치기가 같은 목록을 쓴다) */
  onPieces?: (pieces: MergePiece[]) => void;
  /** 단계 머리 설명 뒤에 붙는 말 (예: "누가기록에도 남아요") */
  note?: ReactNode;
  done?: boolean;
  /** 빈 상태 "AI가 ○○로 써요" (기본 세특 글) */
  what?: string;
}) {
  const [pieces, setPieces] = useState<MergePiece[] | null>(null);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const reload = () => load().then((p) => { setPieces(p); onPieces?.(p); }).catch(() => { setPieces((cur) => cur ?? []); });
  useEffect(() => {
    let alive = true;
    load().then((p) => { if (!alive) return; setPieces(p); onPieces?.(p); }).catch(() => alive && setPieces([]));
    return () => { alive = false; };
    // 학생이 바뀌면 부모가 key 로 새로 그린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 새 것부터 보여 준다
  const list = pieces ? orderPieces(pieces).reverse() : [];
  const visible = all ? list : list.slice(0, SHOWN);
  const meta = pieces === null ? "" : !list.length ? "아직 없어요" : <>{list.length}개{note && <span className="max-md:hidden"> · {note}</span>}</>;

  const body = (
    <div className="flex flex-col gap-3">
      <PieceComposer {...composer} onAdded={reload} />
      {pieces === null ? (
        <p className="text-[13px] text-mute" role="status">메모를 불러오는 중이에요</p>
      ) : list.length === 0 ? (
        <PiecesEmpty what={what} />
      ) : (
        <div className="flex flex-col">
          <ul className="flex flex-col">
            {visible.map((p) => {
              const expanded = open === p.id;
              return (
                <li key={p.id} className="border-t border-soft">
                  <button type="button" onClick={() => setOpen(expanded ? null : p.id)} aria-expanded={expanded}
                    className="flex w-full flex-col gap-1 py-2.5 text-left md:flex-row md:items-start md:gap-2.5">
                    <span className="flex items-center gap-2 md:contents">
                      <PieceChip source={p.source} />
                      <span className="w-[34px] shrink-0 text-[12px] tabular-nums text-mute md:pt-0.5">{shortMd(p.date ?? "")}</span>
                      <span className="ml-auto shrink-0 text-[12px] tabular-nums text-mute md:order-last md:pt-0.5">{neisBytes(p.text).toLocaleString()}B</span>
                    </span>
                    <span className={cx("min-w-0 flex-1 text-[13px] leading-5", !expanded && "line-clamp-2")}>{p.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-2 border-t border-soft pt-2.5">
            {list.length > SHOWN ? (
              <button type="button" onClick={() => setAll(!all)} className="flex items-center gap-1 whitespace-nowrap text-[12px] font-medium text-sub">
                {all ? "접기" : `${list.length - SHOWN}개 더 보기`}<ChevronDown size={13} className={all ? "rotate-180" : ""} />
              </button>
            ) : <span />}
            <Link href={`/teacher/pieces?student=${studentId}`} className="ml-auto whitespace-nowrap text-[13px] font-medium text-key-strong">메모 모아 보기 ›</Link>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section aria-label="활동 메모">
      <RecordCompetency studentId={studentId} title={<StepHead n={1} title="활동 메모" meta={meta} done={done} hint={note ? `본 일을 한 줄씩 남겨요 · ${typeof note === "string" ? note : ""}` : "본 일을 한 줄씩 남겨요 · 활동명은 꼭 적어요"} />} toggle={list.length > 0}
        text={[...list].reverse().map((p) => p.text.trim()).join(" ")}>
        {body}
      </RecordCompetency>
    </section>
  );
}
