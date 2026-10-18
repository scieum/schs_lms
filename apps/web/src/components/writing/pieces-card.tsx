"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { ACTIVITY_MAX } from "@/lib/domain/activity-name";
import { orderPieces, PIECE_MAX, type MergePiece, type PieceSource } from "@/lib/domain/merge";
import { RecordCompetency } from "./record-competency";
import { PieceMaker, type PieceMakerApi } from "./piece-maker";

// 조각 칸 (Figma N19): 세특·행발·동아리(창체) 편집 화면에서 이 학생의 조각(누가기록·메모·특색 활동)을 보고, 지금 본 것을 바로 한 조각으로 남긴다.
// 남긴 조각은 생기부 조각 화면과 합치기 탭에 같이 모인다. 스위치를 켜면 조각 전체를 역량으로 나눠 본다 (N18).

const CHIP: Record<PieceSource, string> = {
  누가기록: "bg-key-soft text-key-strong",
  메모: "bg-soft text-sub",
  본문: "bg-line text-ink",
  "특색 활동": "bg-navy-2 text-white",
};
const SHOWN = 4;
const md = (d: string | null) => (d ? `${+d.slice(5, 7)}.${+d.slice(8, 10)}` : "");

export function PiecesCard({ studentId, load, add, placeholder, maker }: {
  studentId: string;
  load: () => Promise<MergePiece[]>;
  /** 활동명 (N27) 과 함께 남긴다 — 서버가 "[활동명] …"으로 붙인다 */
  add: (text: string, activity: string) => Promise<{ error?: string }>;
  placeholder: string;
  /** 세특 (N22): 자료로 조각 만들기를 맨 위에, 메모로 남기기는 아래로 작게 */
  maker?: PieceMakerApi;
}) {
  const [pieces, setPieces] = useState<MergePiece[] | null>(null);
  const [all, setAll] = useState(false);
  const [text, setText] = useState("");
  const [activity, setActivity] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, start] = useTransition();

  useEffect(() => {
    let alive = true;
    load().then((p) => alive && setPieces(p)).catch(() => alive && setPieces([]));
    return () => { alive = false; };
    // 학생이 바뀌면 부모가 key 로 새로 그린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => start(async () => {
    const r = await add(text, activity).catch(() => ({ error: "남기지 못했어요" }));
    if (r.error) return setMsg({ ok: false, text: r.error });
    setText("");
    setMsg({ ok: true, text: "조각을 남겼어요" });
    setPieces(await load().catch(() => pieces ?? []));
  });
  // 자료로 만든 활동 요약을 조각으로 남기고 목록을 다시 불러온다
  const keepSummary = async (summary: string, act: string) => {
    const r = await add(summary, act).catch(() => ({ error: "남기지 못했어요" }));
    if (!r.error) setPieces(await load().catch(() => pieces ?? []));
    return r;
  };

  // 새 것부터 보여 준다
  const list = pieces ? orderPieces(pieces).reverse() : [];
  const visible = all ? list : list.slice(0, SHOWN);

  return (
    <section className="flex flex-col gap-3 rounded-inner bg-white p-4" aria-label="조각">
      {pieces === null ? (
        <p className="py-4 text-center text-[13px] text-mute" role="status">조각을 모으는 중이에요</p>
      ) : (
        <RecordCompetency studentId={studentId} title={`조각 ${list.length}`} text={[...list].reverse().map((p) => p.text.trim()).join(" ")}>
          {maker && <div className="mb-3"><PieceMaker api={maker} save={keepSummary} /></div>}
          {list.length === 0 ? (
            <p className="rounded-inner bg-bg py-5 text-center text-[13px] text-mute">아직 조각이 없어요</p>
          ) : (
            <ul className="overflow-hidden rounded-inner border border-line">
              {visible.map((p) => (
                <li key={p.id} className="flex flex-col gap-1 border-t border-soft px-3.5 py-2.5 first:border-0">
                  <span className="flex items-center gap-2">
                    <span className={cx("shrink-0 rounded-chip px-1.5 py-0.5 text-[12px] font-medium", CHIP[p.source])}>{p.source}</span>
                    <span className="text-[12px] text-mute">{md(p.date)}</span>
                  </span>
                  <span className="line-clamp-2 text-[13px] leading-5">{p.text}</span>
                </li>
              ))}
              {list.length > SHOWN && (
                <li className="border-t border-soft">
                  <button type="button" onClick={() => setAll(!all)} className="flex w-full items-center justify-center gap-1 py-2.5 text-[12px] font-medium text-sub hover:bg-bg">
                    {all ? "접기" : `${list.length - SHOWN}개 더 보기`}<ChevronRight size={12} className={all ? "-rotate-90" : "rotate-90"} />
                  </button>
                </li>
              )}
            </ul>
          )}
        </RecordCompetency>
      )}
      {maker && <span className="-mb-1.5 text-[13px] text-mute">메모로 남기기</span>}
      {/* 활동명 (N27): 세특은 PC 한 줄(활동명 200 + 메모), 그 밖은 새 조각 글칸 위 */}
      <div className={cx("flex flex-col gap-2", maker && "md:flex-row")}>
        <input value={activity} onChange={(e) => { setActivity(e.target.value); setMsg(null); }} maxLength={ACTIVITY_MAX} aria-label="활동명"
          placeholder={maker ? "활동명" : "활동명 (기록 맨 앞에 붙어요)"}
          className={cx("h-10 w-full shrink-0 rounded-field bg-soft px-3 text-[14px] outline-none focus:ring-2 focus:ring-key", maker && "md:w-[200px]")} />
        <textarea value={text} onChange={(e) => { setText(e.target.value); setMsg(null); }} rows={maker ? 1 : 2} maxLength={PIECE_MAX} aria-label="새 조각"
          placeholder={maker ? "지금 본 것을 짧게" : placeholder}
          className="w-full min-w-0 resize-y rounded-field bg-soft p-3 text-[14px] leading-6 outline-none focus:ring-2 focus:ring-key" />
      </div>
      <div className="flex items-center gap-2">
        {msg ? <p className={cx("min-w-0 flex-1 text-[13px]", msg.ok ? "text-ok" : "text-bad")} role={msg.ok ? "status" : "alert"}>{msg.text}</p>
          : <Link href={`/teacher/pieces?student=${studentId}`} className="mr-auto whitespace-nowrap text-[13px] font-medium text-key-strong">생기부 조각 ›</Link>}
        <Button type="button" kind="soft" size="sm" disabled={saving || text.trim().length < 2 || !activity.trim()} onClick={save}>
          <Plus size={14} /> {saving ? "남기는 중…" : maker ? "남기기" : "조각 남기기"}
        </Button>
      </div>
    </section>
  );
}
