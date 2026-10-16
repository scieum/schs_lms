"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { Avatar, Card, cx, Tag } from "@/components/ui";
import { VERDICT_TONE, type Verdict } from "@/lib/domain/scores";

export type VerdictRow = {
  id: string;
  name: string;
  number: number;
  target: string | null;
  more: number;
  rule: string;
  ko: number | null;
  ma: number | null;
  en: number | null;
  tam: number | null;
  status: Verdict;
  reason: string;
};

const g = (n: number | null) => (n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1));

export function VerdictTable({ rows, empty }: { rows: VerdictRow[]; empty: string | null }) {
  const [q, setQ] = useState("");
  const [onlyFail, setOnlyFail] = useState(false);
  const term = q.trim();
  const shown = rows.filter(
    (r) => (!onlyFail || r.status === "미충족" || r.status === "근접") && (!term || r.name.includes(term) || (r.target ?? "").includes(term)),
  );
  return (
    <Card
      title="학생별 판정"
      action={
        <button type="button" onClick={() => setOnlyFail((x) => !x)} aria-pressed={onlyFail} className={cx("rounded-chip px-2.5 py-1 text-[13px]", onlyFail ? "bg-key font-bold text-white" : "text-sub hover:bg-white")}>
          미충족만 보기
        </button>
      }
    >
      <label className="mb-3 flex items-center gap-2 rounded-field bg-white px-3.5 py-2.5 text-sm">
        <Search size={16} className="text-mute" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="학생·대학 검색" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint" />
      </label>
      {empty ? (
        <p className="py-8 text-center text-sm text-mute">{empty}</p>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-mute">해당하는 학생이 없어요</p>
      ) : (
        <>
          <table className="hidden w-full table-fixed text-sm md:table">
            <colgroup>
              <col className="w-40" />
              <col />
              <col className="w-36" />
              {[0, 1, 2, 3].map((i) => <col key={i} className="w-14" />)}
              <col className="w-24" />
            </colgroup>
            <thead className="text-xs text-mute">
              <tr className="border-b border-line">
                <th className="py-2 text-left font-normal">학생</th>
                <th className="py-2 text-center font-normal">목표 대학·학과</th>
                <th className="py-2 text-center font-normal">기준</th>
                {["국어", "수학", "영어", "탐구"].map((h) => <th key={h} className="py-2 text-center font-normal">{h}</th>)}
                <th className="py-2 text-center font-normal">판정</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0" title={r.reason}>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name} size={32} />
                      <div className="min-w-0">
                        <div className="truncate font-bold">{r.name}</div>
                        <div className="text-xs text-mute">{r.number}번</div>
                      </div>
                    </div>
                  </td>
                  <td className="truncate px-2 py-3 text-center font-bold">
                    {r.target ?? <span className="font-normal text-mute">목표 없음</span>}
                    {r.more > 0 && <span className="ml-1 text-xs font-normal text-mute">외 {r.more}</span>}
                  </td>
                  <td className="truncate px-2 py-3 text-center text-sub">{r.rule}</td>
                  {[r.ko, r.ma, r.en, r.tam].map((x, i) => <td key={i} className="py-3 text-center tabular-nums text-sub">{g(x)}</td>)}
                  <td className="py-3 text-center"><Tag tone={VERDICT_TONE[r.status]}>{r.status}</Tag></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-col md:hidden">
            {shown.map((r, i) => (
              <div key={r.id} className={cx("flex items-center gap-3 py-3", i < shown.length - 1 && "border-b border-line")}>
                <Avatar name={r.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{r.name}</div>
                  <div className="truncate text-xs text-mute">{r.target ? `${r.target} · ${r.rule}` : "목표 없음"}</div>
                  <div className="truncate text-xs text-sub">국 {g(r.ko)} · 수 {g(r.ma)} · 영 {g(r.en)} · 탐 {g(r.tam)}</div>
                </div>
                <Tag tone={VERDICT_TONE[r.status]}>{r.status}</Tag>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
