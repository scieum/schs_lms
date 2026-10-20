"use client";
import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Tag, cx } from "@/components/ui";
import { COMPETENCIES, COMPETENCY_LABEL, competencySummary, SUB_ITEMS, subLabel, type Competency, type TaggedSentence } from "@/lib/domain/competency";

// 역량 보기 (Figma N11 227:2502 · 228:2502 · 230:2515): 본문 문장을 대입 3대 역량 색으로 칠하고, 옆에서 평가항목 10개로 나눠 본다.
// 색은 디자인 시스템 포인트 색의 파스텔 (2026-10-17 사용자: 인디고 톤은 눈에 안 띈다) — 학업 파랑 · 진로 초록 · 공동체 노랑.

export const COMPETENCY_COLOR: Record<Competency, { tint: string; strong: string; dot: string }> = {
  학업: { tint: "#D3DAFF", strong: "#B3BFFF", dot: "#536DFE" },
  진로: { tint: "#C9F0DC", strong: "#9EE3BF", dot: "#00B86B" },
  공동체: { tint: "#FFE6B0", strong: "#FFD27A", dot: "#F5A524" },
};

export type TagResult = { tags: TaggedSentence[]; label: "AI" | "자동" } | { error: string };
type Focus = { competency: Competency; sub?: string } | null;

/**
 * 본문 카드 머리: 제목 + (역량 보기 중이면) 수정하기 + 역량 보기 스위치. 꺼져 있으면 children(편집기·기록 목록)을 보여 준다.
 * editable=false 는 읽기 전용 기록(누가기록·초안·조각, Figma N18)에 쓴다 — 수정하기 버튼 없음.
 * bare: 바깥 상자 없이 (Figma N32 ③ 본문 — 흰 면 위에 바로, 회색 안 회색 금지). toggle=false 면 역량 보기 스위치를 숨긴다(글이 없을 때).
 * title 이 글자가 아니면(단계 머리 등) 그대로 그린다.
 */
export function BodyCard({ text, tag, children, title = "본문", editable = true, className, bare = false, toggle = true, extra, view, head = true }: {
  text: string; tag: (text: string) => Promise<TagResult>; children: React.ReactNode; title?: React.ReactNode; editable?: boolean; className?: string; bare?: boolean; toggle?: boolean;
  /** 머리 오른쪽, 역량 보기 앞 (N34 "다른 버전") */
  extra?: React.ReactNode;
  /** 역량 보기 켜짐을 밖에서 쥔다 (Figma N52 글 짓기: 스위치는 "더보기" 줄에) */
  view?: { on: boolean; set: (on: boolean) => void };
  /** false = 머리 줄을 그리지 않는다 (N52 — 제목 · 스위치는 글 칸 밖에) */
  head?: boolean;
}) {
  const [own, setOwn] = useState(false);
  const state = view ? view.on : own;
  const setOn = view ? view.set : setOwn;
  const on = state && toggle;
  return (
    <section className={cx("@container flex flex-col gap-3", className ?? (bare ? "" : "rounded-inner bg-white p-4"))}>
      {head && <div className="flex items-center gap-2">
        {typeof title === "string" ? <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{title}</span> : <div className="min-w-0 flex-1">{title}</div>}
        {on && editable && (
          <button type="button" onClick={() => setOn(false)} className="hidden items-center gap-1 rounded-control border border-hair bg-[#fff] px-2.5 py-1 text-[12px] font-medium md:flex">
            <Pencil size={12} /> 수정하기
          </button>
        )}
        {!on && extra}
        {toggle && <label className={cx("flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px] text-sub", text.trim() ? "cursor-pointer" : "cursor-not-allowed opacity-50")}>
          역량 보기
          <input type="checkbox" role="switch" className="peer sr-only" checked={on} onChange={(e) => setOn(e.target.checked)} disabled={!text.trim()} />
          <span aria-hidden className={cx("relative h-5 w-9 rounded-full transition-colors", on ? "bg-key" : "bg-faint")}>
            <span className={cx("absolute top-0.5 size-4 rounded-full bg-[#fff] transition-all", on ? "left-[18px]" : "left-0.5")} />
          </span>
        </label>}
      </div>}
      {/* 편집기는 늘 그려 두고(폼 제출용) 역량 보기일 때만 숨긴다 */}
      <div className={cx(on && "hidden")}>{children}</div>
      {on && <CompetencyView text={text} tag={tag} />}
      {on && editable && (
        <button type="button" onClick={() => setOn(false)} className={cx("flex h-10 items-center justify-center gap-1 rounded-control border border-hair bg-[#fff] text-[13px] font-medium", head && "md:hidden")}>
          <Pencil size={13} /> 수정하기
        </button>
      )}
    </section>
  );
}

function CompetencyView({ text, tag }: { text: string; tag: (text: string) => Promise<TagResult> }) {
  const [res, setRes] = useState<TagResult | null>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const asked = useRef("");
  useEffect(() => {
    if (asked.current === text) return;
    asked.current = text;
    let alive = true;
    tag(text).then((r) => alive && setRes(r)).catch(() => alive && setRes({ error: "역량을 나누지 못했어요" }));
    return () => { alive = false; };
  }, [text, tag]);

  if (!res) return <p className="py-8 text-center text-[13px] text-mute" role="status">문장마다 역량을 나누는 중이에요</p>;
  if ("error" in res) return <p className="py-6 text-center text-[13px] text-bad" role="alert">{res.error}</p>;

  const sum = competencySummary(res.tags);
  const total = res.tags.filter((t) => t.competency).length;
  const hit = (t: TaggedSentence) => !focus || (t.competency === focus.competency && (!focus.sub || t.sub === focus.sub));
  const toggle = (f: NonNullable<Focus>) => setFocus((cur) => (cur && cur.competency === f.competency && cur.sub === f.sub ? null : f));
  const missing = sum.missingSubs.slice(0, 2).map((m) => subLabel(m.sub));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 @2xl:grid-cols-[1fr_264px]">
        <p className="text-[15px] leading-[30px]">
          {res.tags.map((t, i) => {
            const c = t.competency ? COMPETENCY_COLOR[t.competency] : null;
            const lit = hit(t);
            return (
              <span key={i} className="group relative">
                <span tabIndex={c ? 0 : undefined}
                  className={cx("rounded-[4px] py-0.5 transition-opacity [box-decoration-break:clone] [-webkit-box-decoration-break:clone]", !lit && "opacity-35")}
                  style={c ? { background: focus && lit ? c.strong : c.tint } : undefined}>
                  {t.text}
                </span>
                {c && t.sub && (
                  <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-max max-w-[240px] flex-col rounded-control bg-navy px-3 py-2 group-hover:flex group-focus-within:flex">
                    <span className="flex items-center gap-1.5 text-[13px] font-bold text-white"><span className="size-2 rounded-full" style={{ background: c.dot }} />{t.sub}</span>
                    <span className="text-[12px] text-[#9EAAFF]">{COMPETENCY_LABEL[t.competency!]}</span>
                  </span>
                )}
                {i < res.tags.length - 1 && " "}
              </span>
            );
          })}
        </p>
        <aside className="flex flex-col gap-3.5 rounded-inner bg-bg px-3 py-3.5" aria-label="평가 항목">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold">평가 항목</span>
            <span className="text-[12px] text-mute">{total}문장{res.label === "자동" ? " · 자동" : ""}</span>
          </div>
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {COMPETENCIES.filter((c) => sum.counts[c]).map((c) => <span key={c} style={{ flex: sum.counts[c], background: COMPETENCY_COLOR[c].dot }} />)}
            {!total && <span className="flex-1 bg-line" />}
          </div>
          {COMPETENCIES.map((c) => (
            <div key={c} className="flex flex-col gap-0.5">
              <button type="button" onClick={() => toggle({ competency: c })}
                className={cx("flex items-center gap-2 rounded-chip px-2 py-1 text-left", focus?.competency === c && !focus.sub && "border border-key bg-[#fff] text-key-strong")}>
                <span className="size-2.5 rounded-full" style={{ background: COMPETENCY_COLOR[c].dot }} />
                <span className="flex-1 text-[13px] font-bold">{COMPETENCY_LABEL[c]}</span>
                <span className="text-[12px] text-mute">{sum.counts[c]}문장</span>
              </button>
              {SUB_ITEMS[c].map((sub) => {
                const n = sum.subs[sub] ?? 0;
                const sel = focus?.competency === c && focus.sub === sub;
                return (
                  <button key={sub} type="button" onClick={() => toggle({ competency: c, sub })} disabled={!n}
                    className={cx("ml-5 flex items-center gap-2 rounded-chip border px-2 py-1.5 text-left text-[13px]", sel ? "border-key bg-[#fff] font-bold text-key-strong" : "border-transparent", !n && "text-[#B0B8C1]")}>
                    <span className="min-w-0 flex-1">{sub}</span>
                    <span className="tabular-nums">{n}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </aside>
      </div>
      {missing.length > 0 && (
        <p className="flex items-center gap-2 rounded-control bg-bg px-3 py-2.5 text-[13px]">
          <Tag tone="bg-new-soft text-new">{res.label}</Tag>
          <span className="min-w-0 flex-1">{missing.join("·")} 문장이 없어요</span>
        </p>
      )}
    </div>
  );
}
