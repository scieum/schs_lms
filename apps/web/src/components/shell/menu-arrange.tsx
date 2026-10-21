"use client";
import { useState, type DragEvent } from "react";
import { layoutOf, moveGroup, moveItem, rebuild, type ArrangeGroup } from "./nav";

// 메뉴 순서 바꾸기 (Figma N53): 사이드바 순서 바꾸기 모드와 내 정보 · 설정 카드가 같이 쓴다.
// 끌어 옮기기는 PC(HTML 끌어 놓기), 휴대폰은 카드의 ↑ ↓ 로 옮긴다.

type Drag = { kind: "item"; href: string } | { kind: "group"; label: string };
/** 놓을 자리: 메뉴는 (묶음, 몇째), 묶음은 몇째 */
export type Over = { kind: "item"; label: string; index: number } | { kind: "group"; index: number };

/** 끌어 놓기 상태 + 각 요소에 붙일 이벤트 */
export function useMenuDrag(groups: ArrangeGroup[], onChange: (next: ArrangeGroup[]) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const end = () => { setDrag(null); setOver(null); };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (drag && over) {
      const l = layoutOf(groups);
      const next = drag.kind === "item" && over.kind === "item" ? moveItem(l, drag.href, over.label, over.index)
        : drag.kind === "group" && over.kind === "group" ? moveGroup(l, drag.label, over.index) : l;
      onChange(rebuild(groups, next));
    }
    end();
  };
  const half = (e: DragEvent) => { const r = e.currentTarget.getBoundingClientRect(); return e.clientY > r.top + r.height / 2 ? 1 : 0; };
  const same = (a: Over | null, b: Over) => JSON.stringify(a) === JSON.stringify(b);
  const set = (o: Over) => { if (!same(over, o)) setOver(o); };
  return {
    drag,
    over,
    /** 메뉴 행 */
    item: (label: string, href: string, index: number) => ({
      draggable: true,
      onDragStart: (e: DragEvent) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", href); setDrag({ kind: "item", href }); },
      onDragEnd: end,
      onDragOver: (e: DragEvent) => { if (drag?.kind !== "item") return; e.preventDefault(); e.stopPropagation(); set({ kind: "item", label, index: index + half(e) }); },
      onDrop: drop,
    }),
    /** 놓을 자리 표시(빈 칸) 위: 자리를 그대로 둔다 */
    slot: { onDragOver: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); }, onDrop: drop },
    /** 묶음 머리: 묶음 손잡이 + 메뉴를 묶음 맨 앞으로 */
    head: (label: string) => ({
      draggable: true,
      onDragStart: (e: DragEvent) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", label); setDrag({ kind: "group", label }); },
      onDragEnd: end,
    }),
    /** 묶음 전체: 메뉴는 끝에(빈 묶음 포함), 묶음은 위 · 아래 반쪽으로 */
    group: (label: string, gi: number, count: number) => ({
      onDragOver: (e: DragEvent) => {
        if (!drag) return;
        e.preventDefault();
        if (drag.kind === "group") set({ kind: "group", index: gi + half(e) });
        else set({ kind: "item", label, index: count });
      },
      onDrop: drop,
    }),
  };
}
