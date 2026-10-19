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

// ① 조각 모으기 (Figma N32): 단계 머리 + 조각 추가(메모 | 자료) + 상자 없는 조각 목록.
// 남긴 조각은 생기부 조각 화면과 ② 조각 합치기에 같이 모인다. 조각이 있을 때만 역량 보기(N18) 스위치를 보여 준다.

const SHOWN = 4;

export function PiecesCard({ studentId, load, onPieces, note, done, ...composer }: Omit<ComposerProps, "onAdded"> & {
  studentId: string;
  load: () => Promise<MergePiece[]>;
  /** 불러온 조각을 editor 에 알린다 (② 조각 합치기가 같은 목록을 쓴다) */
  onPieces?: (pieces: MergePiece[]) => void;
  /** 단계 머리 설명 뒤에 붙는 말 (예: "누가기록에도 남아요") */
  note?: ReactNode;
  done?: boolean;
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
  const meta = pieces === null ? "" : <>{list.length}개{note && <span className="max-md:hidden"> · {note}</span>}</>;

  const body = (
    <div className="flex flex-col gap-3">
      <PieceComposer {...composer} onAdded={reload} />
      {pieces === null ? (
        <p className="text-[13px] text-mute" role="status">조각을 모으는 중이에요</p>
      ) : list.length === 0 ? (
        <p className="text-[13px] text-mute">아직 조각이 없어요. 위에서 첫 조각을 남겨요</p>
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
            <Link href={`/teacher/pieces?student=${studentId}`} className="ml-auto whitespace-nowrap text-[13px] font-medium text-key-strong">생기부 조각 ›</Link>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section aria-label="조각 모으기">
      <RecordCompetency studentId={studentId} title={<StepHead n={1} title="조각 모으기" meta={meta} done={done} />} toggle={list.length > 0}
        text={[...list].reverse().map((p) => p.text.trim()).join(" ")}>
        {body}
      </RecordCompetency>
    </section>
  );
}
