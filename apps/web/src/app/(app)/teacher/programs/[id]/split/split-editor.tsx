"use client";
import { startTransition, useActionState, useState } from "react";
import { AlertCircle, ArrowRight, List, Plus, X } from "lucide-react";
import { Button, Card, cx } from "@/components/ui";
import { quickSplit, rangeLabel, validateRanges, type PageRange } from "@/lib/domain/program";
import { splitAction, suggestSplitAction, type SplitState, type SuggestSplitState } from "./actions";

type Opt = { id: string; label: string; sub: string };

// T7 합본 PDF 나누기 (Figma 45:3829 / 45:4109): 쪽 구간 → 학생. 이름표 열은 고정 폭, 드롭다운은 같은 폭
export function SplitEditor({ programId, materialId, pages, students, aiOn, fileHref }: {
  programId: string; materialId: string; pages: number; students: Opt[]; aiOn: boolean; fileHref: string;
}) {
  const [split, splitAct, splitting] = useActionState<SplitState, FormData>(splitAction, {});
  const [sug, sugAct, suggesting] = useActionState<SuggestSplitState, FormData>(suggestSplitAction, {});
  const [ranges, setRanges] = useState<PageRange[]>([]);
  const [appliedN, setAppliedN] = useState(0);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(Math.min(2, pages));
  const [pick, setPick] = useState("");
  const [per, setPer] = useState(3);
  const [showAll, setShowAll] = useState(false);

  // AI 제안이 새로 오면 한 번 구간에 채운다 (확인 후 나누기 전까지 고칠 수 있다)
  if (sug.ranges && (sug.n ?? 0) !== appliedN) {
    setAppliedN(sug.n ?? 0);
    setRanges(sug.ranges);
  }

  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const covered = new Map<number, number>();
  sorted.forEach((r, i) => { for (let p = r.from; p <= r.to; p++) covered.set(p, i); });
  const err = ranges.length ? validateRanges(ranges, pages) : null;
  const byId = new Map(students.map((s) => [s.id, s]));
  const nextFree = () => { let p = 1; while (covered.has(p) && p <= pages) p++; return p; };

  const add = () => {
    const f = Math.max(1, Math.min(from, pages));
    const t = Math.max(f, Math.min(to, pages));
    setRanges([...ranges, { from: f, to: t, studentId: pick || null }]);
    const nf = Math.min(pages, t + 1);
    setFrom(nf);
    setTo(Math.min(pages, nf + (t - f)));
    setPick("");
  };
  // 한 쪽을 누르면 시작, 그 뒤 쪽을 누르면 끝까지 늘린다
  const clickPage = (p: number) => { if (from === to && p > from) setTo(p); else { setFrom(p); setTo(p); } };
  const runAi = () => { const fd = new FormData(); fd.set("programId", programId); fd.set("materialId", materialId); startTransition(() => sugAct(fd)); };
  const used = new Set(ranges.map((r) => r.studentId));
  const visible = showAll ? sorted : sorted.slice(0, 6);
  const tiles = Array.from({ length: pages }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3 rounded-inner bg-soft px-4 py-3.5 md:gap-4 md:px-5 md:py-4">
        <span className="rounded-chip bg-new-soft px-2.5 py-1 text-xs font-bold text-new">AI</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">AI로 쪽 나누기 제안</div>
          <div className="truncate text-[13px] text-sub">
            {sug.error ?? (sug.ranges ? sug.ranges.slice(0, 3).map((r) => `${rangeLabel(r)} ${byId.get(r.studentId ?? "")?.label.split(" ").pop() ?? "?"}`).join(" · ") + (sug.ranges.length > 3 ? ` 외 ${sug.ranges.length - 3}명` : "") : aiOn ? "첫 쪽 이름으로 학생별 쪽 구간을 찾아요" : "AI가 꺼져 있어요. 빠른 나누기를 써 보세요")}
          </div>
        </div>
        <Button type="button" size="sm" onClick={runAi} disabled={!aiOn || suggesting}>{suggesting ? "읽는 중이에요…" : "제안 받기"}</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_360px] md:gap-6">
        <Card title="페이지" action={<a href={fileHref} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-sub">전체 {pages}쪽 보기</a>}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-11 items-center gap-1 rounded-field bg-white px-3 ring-2 ring-key">
                <input aria-label="시작 쪽" inputMode="numeric" value={from} onChange={(e) => setFrom(Number(e.target.value.replace(/\D/g, "")) || 1)} className="w-8 bg-transparent text-center font-bold outline-none" />
                –
                <input aria-label="끝 쪽" inputMode="numeric" value={to} onChange={(e) => setTo(Number(e.target.value.replace(/\D/g, "")) || 1)} className="w-8 bg-transparent text-center font-bold outline-none" />
                <span className="text-[13px] text-mute">쪽</span>
              </span>
              <ArrowRight size={16} className="text-mute" />
              <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-11 min-w-40 flex-1 rounded-field bg-white px-3 text-[14px] outline-none focus:ring-2 focus:ring-key" aria-label="학생">
                <option value="">학생 고르기 (이름·학번)</option>
                {students.map((s) => <option key={s.id} value={s.id} disabled={used.has(s.id)}>{s.label} · {s.sub}</option>)}
              </select>
              <Button type="button" size="sm" onClick={add}>구간 추가</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-medium text-sub">빠른 나누기</span>
              <span className="flex items-center gap-1.5 rounded-control bg-white px-3 py-1.5">
                쪽수로 나누기
                <input aria-label="몇 쪽씩" inputMode="numeric" value={per} onChange={(e) => setPer(Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1))} className="w-7 rounded-chip bg-soft text-center font-bold outline-none" />
                쪽씩
              </span>
              <button type="button" onClick={() => setRanges(quickSplit(pages, per, students.map((s) => s.id)))} className="flex items-center gap-1 rounded-control bg-white px-3 py-1.5 hover:bg-key-soft">
                <List size={14} /> 명렬표 순서대로 배정
              </button>
              {ranges.length > 0 && <button type="button" onClick={() => setRanges([])} className="rounded-control px-2 py-1.5 text-mute">모두 지우기</button>}
            </div>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
              {tiles.map((p) => {
                const ri = covered.get(p);
                const sel = p >= from && p <= to;
                return (
                  <button key={p} type="button" onClick={() => clickPage(p)} className="flex flex-col items-center gap-1">
                    <span className={cx("flex aspect-[3/4] w-full flex-col gap-1 rounded-inner border-2 bg-white p-2", sel ? "border-key" : ri !== undefined ? "border-key-soft" : "border-line")}>
                      <span className={cx("h-1.5 w-2/3 rounded-full", ri !== undefined || sel ? "bg-[#c2caff]" : "bg-line")} />
                      {[0, 1, 2, 3].map((k) => <span key={k} className="h-1 w-full rounded-full bg-line" />)}
                      {ri !== undefined && <span className="mt-auto truncate text-[11px] font-medium text-key-strong">{byId.get(sorted[ri].studentId ?? "")?.label.split(" ").pop() ?? "미지정"}</span>}
                    </span>
                    <span className={cx("text-[12px]", sel ? "font-bold" : "text-mute")}>{p}쪽</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card title="구간 지정" className="md:self-start">
          <form action={splitAct} className="flex flex-col gap-2.5">
            <input type="hidden" name="programId" value={programId} />
            <input type="hidden" name="materialId" value={materialId} />
            <input type="hidden" name="ranges" value={JSON.stringify(ranges)} />
            {sorted.length === 0 && <p className="py-4 text-center text-[13px] text-mute">왼쪽에서 구간을 넣거나 빠른 나누기를 눌러 주세요</p>}
            {visible.map((r) => {
              const idx = ranges.indexOf(r);
              return (
                <div key={`${r.from}-${r.to}-${idx}`} className="flex items-center gap-2 rounded-inner bg-white p-2.5">
                  <span className={cx("size-2 shrink-0 rounded-full", r.studentId ? "bg-key" : "bg-wait")} />
                  <span className="w-16 shrink-0 text-[14px] font-bold">{rangeLabel(r)}</span>
                  <select value={r.studentId ?? ""} onChange={(e) => setRanges(ranges.map((x, i) => (i === idx ? { ...x, studentId: e.target.value || null } : x)))}
                    className={cx("h-10 min-w-0 flex-1 rounded-field bg-soft px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-key", !r.studentId && "ring-1 ring-wait")} aria-label={`${rangeLabel(r)} 학생`}>
                    <option value="">학생 선택</option>
                    {students.map((s) => <option key={s.id} value={s.id} disabled={used.has(s.id) && s.id !== r.studentId}>{s.label} · {s.sub}</option>)}
                  </select>
                  <button type="button" aria-label="구간 빼기" onClick={() => setRanges(ranges.filter((_, i) => i !== idx))} className="text-mute"><X size={16} /></button>
                </div>
              );
            })}
            {sorted.length > 6 && (
              <button type="button" onClick={() => setShowAll(!showAll)} className="text-left text-[13px] text-mute">{showAll ? "접기" : `+ ${sorted.length - 6}개 구간 더 보기`}</button>
            )}
            <Button type="button" kind="outline" size="sm" onClick={() => { const f = nextFree(); if (f <= pages) { setFrom(f); setTo(f); } }}><Plus size={14} /> 다음 빈 쪽으로</Button>
            {(err || sug.note) && (
              <p className="flex gap-2 rounded-inner bg-wait-soft px-3 py-2.5 text-[13px] text-sub">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-wait" /> {err ?? sug.note}
              </p>
            )}
            {split.error && <p className="text-sm text-bad" role="alert">{split.error}</p>}
            <div className="mt-1 flex items-center justify-between border-t border-line pt-3 text-[14px]">
              <span className="font-bold">나눈 결과</span>
              <span className="font-bold">{ranges.length}개 파일</span>
            </div>
            <Button disabled={splitting || !!err || ranges.length === 0}>{splitting ? "나누는 중…" : `확인 후 ${ranges.length}명 파일로 나누기`}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
