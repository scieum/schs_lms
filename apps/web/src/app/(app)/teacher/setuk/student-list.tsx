"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import { Tag, cx } from "@/components/ui";
import { SimilarBadge } from "@/components/writing/similar-sheet";
import { LevelBadge, useLevels } from "@/components/writing/level-picker";
import { PickBar, PickBox } from "@/components/writing/pick-bar";
import { CheckStatus } from "@/components/writing/workspace";
import { useUndoSnack } from "@/components/writing/undo-snack";
import { ACHIEVEMENT_SCALES, countLevels, type Level } from "@/lib/domain/achievement";

// 세특 분반 학생 목록 (Figma N34 ④ · N35 ①③): 반 전체 검사 버튼 · 거르기 칩 [전체 n | ≋ 비슷한 문장 n](화면 상태 — URL에 넣지 않는다)
// · 이름 뒤 성취수준 배지 · 상태 칩(검사 패널이 열리면 검사 결과) · 한꺼번에 정하기(PC 목록 체크 모드 / 모바일 바텀시트 + 네이비 바).

export type ListItem = { id: string; no: string; name: string; status: "확정" | "작성 중" | "미작성"; href: string; similar: number; on: boolean };

const STATUS_TONE = { 확정: undefined, "작성 중": "bg-wait-soft text-wait", 미작성: "bg-white text-mute" } as const;

export function SetukStudentList({ items, title }: { items: ListItem[]; title?: string }) {
  const [only, setOnly] = useState(false);
  const lv = useLevels();
  const [bulk, setBulk] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState<Level | null>(null);
  const snack = useUndoSnack();
  const simN = items.filter((x) => x.similar > 0).length;
  const shown = only ? items.filter((x) => x.similar > 0) : items;
  const chip = (on: boolean) => cx("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-chip px-2 text-[12px]", on ? "bg-key-soft font-bold text-key-strong" : "bg-soft text-sub");
  const ids = items.map((x) => x.id);
  const all = checked.size === items.length && items.length > 0;
  const toggle = (id: string) => setChecked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const end = () => { setBulk(false); setChecked(new Set()); setPick(null); };
  const apply = async () => {
    if (!lv || !pick || !checked.size) return;
    const list = [...checked].map((studentId) => ({ studentId, level: pick }));
    const r = await lv.set(list);
    if (r.error) { snack.show(r.error); return; }
    snack.show(`${list.length}명 ${pick}로 정했어요`, () => { void lv.set(r.prev); });
    setChecked(new Set());
    setPick(null);
  };
  // 모바일 바텀시트가 열리면 뒤 화면 스크롤을 막는다
  useEffect(() => {
    if (!bulk || window.matchMedia("(min-width: 768px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [bulk]);

  const bar = lv && checked.size > 0 && (
    <PickBar layout="stack" floating={false} count={checked.size} onClear={() => setChecked(new Set())} clearLabel="해제">
      {ACHIEVEMENT_SCALES[lv.scale].map((x) => (
        <button key={x.level} type="button" aria-pressed={pick === x.level} onClick={() => setPick(x.level)}
          className={cx("h-10 min-w-0 flex-1 rounded-control text-[14px] font-bold md:h-8", pick === x.level ? "bg-[#fff] text-key-strong" : "bg-navy-2 text-white")}>{x.level}</button>
      ))}
      <button type="button" onClick={apply} disabled={!pick} className="h-10 shrink-0 whitespace-nowrap rounded-control bg-[#fff] px-3.5 text-[13px] font-bold text-key-strong disabled:opacity-50 md:h-8">넣기</button>
    </PickBar>
  );

  const row = (s: ListItem, mode: "list" | "check") => {
    const level = lv?.levels[s.id] ?? null;
    if (mode === "check") {
      const on = checked.has(s.id);
      return (
        <label key={s.id} className={cx("flex cursor-pointer items-center gap-3 rounded-inner px-2 py-2.5", on && "bg-bg")}>
          <PickBox on={on} onClick={() => toggle(s.id)} label={`${s.name} 고르기`} />
          <span className="w-12 shrink-0 tabular-nums text-[13px] text-mute">{s.no}</span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium md:text-[14px]">{s.name}</span>
          {lv && <LevelBadge level={level} />}
        </label>
      );
    }
    return (
      <li key={s.id}>
        <Link href={s.href} aria-current={s.on ? "true" : undefined}
          className={cx("flex items-center gap-3 rounded-inner px-2 py-2.5", s.on ? "bg-white" : "hover:bg-white/60")}>
          <span className="w-12 shrink-0 tabular-nums text-[13px] text-mute">{s.no}</span>
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
            <span className={cx("max-w-full truncate", s.on && "font-bold")}>{s.name}</span>
            <SimilarBadge n={s.similar} />
          </span>
          {lv && <LevelBadge level={level} />}
          <span className="flex w-14 shrink-0 justify-end">
            <CheckStatus id={s.id}><Tag tone={STATUS_TONE[s.status]}>{s.status}</Tag></CheckStatus>
          </span>
        </Link>
      </li>
    );
  };

  return (
    <>
      {lv && !bulk && (
        <div className="-mt-1 mb-2 flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-sub">성취수준 {countLevels(lv.levels, ids)} / {items.length}명</span>
          <button type="button" onClick={() => setBulk(true)} className="whitespace-nowrap text-[12px] font-bold text-key-strong">한꺼번에 정하기</button>
        </div>
      )}
      {simN > 0 && !bulk && (
        <div className="-mt-1 mb-2 flex gap-1.5" role="radiogroup" aria-label="거르기">
          <button type="button" role="radio" aria-checked={!only} onClick={() => setOnly(false)} className={chip(!only)}>전체 {items.length}</button>
          <button type="button" role="radio" aria-checked={only} onClick={() => setOnly(true)} className={chip(only)}><Layers size={12} /> 비슷한 문장 {simN}</button>
        </div>
      )}
      {bulk ? (
        <div className="flex flex-col">
          {/* PC: 목록이 체크 모드 */}
          <div className="hidden flex-col md:flex">
            <div className="-mt-1 mb-1 flex items-center gap-3 px-2 text-[12px] text-sub">
              <PickBox on={all} onClick={() => setChecked(all ? new Set() : new Set(ids))} label="모두 고르기" />
              <span className="flex-1">모두</span>
              <button type="button" onClick={end} className="whitespace-nowrap text-[12px] font-bold text-key-strong">끝내기</button>
            </div>
            <div className="-mx-2 flex max-h-[560px] flex-col overflow-y-auto">{items.map((s) => row(s, "check"))}</div>
            {bar && <div className="mt-2">{bar}</div>}
          </div>
          {/* 모바일: 바텀시트 */}
          <div className="fixed inset-0 z-[90] flex items-end bg-navy/50 md:hidden" onClick={end}>
            <div role="dialog" aria-modal="true" aria-label="성취수준 한꺼번에" onClick={(e) => e.stopPropagation()}
              className="flex max-h-[88dvh] w-full flex-col gap-3 rounded-t-[16px] bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5">
              <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair" />
              <div className="flex items-center gap-2">
                <span className="text-[17px] font-bold">성취수준 한꺼번에</span>
                {title && <span className="min-w-0 flex-1 truncate text-[13px] text-mute">{title}</span>}
                <button type="button" onClick={end} className="ml-auto whitespace-nowrap text-[14px] font-medium text-ink">닫기</button>
              </div>
              <p className="text-[13px] text-sub">학생을 고르고 아래에서 수준을 눌러 넣어요 · {lv ? countLevels(lv.levels, ids) : 0} / {items.length}명 정함</p>
              <div className="flex items-center gap-3 border-b border-soft py-2 text-[13px] text-sub">
                <PickBox on={all} onClick={() => setChecked(all ? new Set() : new Set(ids))} label="모두 고르기" />
                <span className="flex-1">모두</span>
                <span className="text-[12px]">성취수준</span>
              </div>
              <div className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto">{items.map((s) => row(s, "check"))}</div>
              {bar}
            </div>
          </div>
        </div>
      ) : (
        <ul className="-mx-2 flex max-h-[560px] flex-col overflow-y-auto">{shown.map((s) => row(s, "list"))}</ul>
      )}
      {snack.node}
    </>
  );
}
