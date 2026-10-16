"use client";
import { useActionState, useState } from "react";
import { AiBanner, Button, Card, cx, Tag } from "@/components/ui";
import { analyzeMyScores, saveStudyPlan, type PlanState } from "./actions";

/** AI 성적 분석 → 필요한 등급 + 공부 계획 초안 → 골라서 "확인 후 담기" */
export function AnalysisPanel({ line, ai, disabled }: { line: string; ai: boolean; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState<{ summary: string; needs: string[]; plan: { text: string; on: boolean }[] } | null>(null);
  const [saved, save, saving] = useActionState<PlanState, FormData>(saveStudyPlan, {});

  async function run() {
    setBusy(true);
    setError("");
    const r = await analyzeMyScores();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setRes({ summary: r.summary, needs: r.needs, plan: r.plan.map((text) => ({ text, on: true })) });
  }
  const picked = res?.plan.filter((p) => p.on).map((p) => p.text) ?? [];

  return (
    <>
      <AiBanner
        title="성적 분석"
        line={error || res?.summary || line || "모의고사 성적이 쌓이면 추이를 알려 줘요"}
        action={
          res ? (
            <Button size="sm" kind="ghost" onClick={() => setRes(null)}>닫기</Button>
          ) : (
            <Button size="sm" onClick={run} disabled={busy || disabled || !ai}>{busy ? "분석하는 중…" : ai ? "공부 계획에 담기" : "AI 꺼짐"}</Button>
          )
        }
      />
      {res && (
        <Card title="필요한 등급과 공부 계획" action={<Tag tone="bg-new-soft text-new">AI 요약</Tag>}>
          {res.needs.length > 0 && (
            <ul className="mb-4 flex flex-col gap-1.5 text-sm">
              {res.needs.map((n, i) => <li key={i} className="rounded-inner bg-white px-3.5 py-2.5 font-medium">{n}</li>)}
            </ul>
          )}
          <div className="flex flex-col gap-2">
            {res.plan.map((p, i) => (
              <label key={i} className={cx("flex items-start gap-3 rounded-inner bg-white px-3.5 py-3 text-sm", !p.on && "opacity-60")}>
                <input
                  type="checkbox"
                  checked={p.on}
                  onChange={(e) => setRes({ ...res, plan: res.plan.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)) })}
                  className="mt-0.5 size-4 accent-[#536DFE]"
                />
                <span>{p.text}</span>
              </label>
            ))}
          </div>
          <form action={save} className="mt-4 flex items-center gap-3">
            <input type="hidden" name="items" value={JSON.stringify(picked)} />
            <p className="flex-1 text-[13px] text-mute">{saved.saved ? "공부 계획에 담았어요" : "이름·학번 없이 가명ID와 등급만 보냈어요"}</p>
            <Button size="sm" disabled={saving || picked.length === 0}>{saving ? "담는 중…" : "확인 후 담기"}</Button>
          </form>
          {saved.error && <p className="mt-2 text-sm text-bad" role="alert">{saved.error}</p>}
        </Card>
      )}
    </>
  );
}
