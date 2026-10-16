"use client";
import { useActionState, useState } from "react";
import { AiBanner, Button, Card, cx, Tag } from "@/components/ui";
import { analyzeMyScores, saveStudyPlan, type PlanState } from "./actions";

/** AI 성적 분석 → 필요한 등급 + 공부 계획 초안 → 골라서 "확인 후 담기" */
export function AnalysisPanel({ line, ai, disabled }: { line: string; ai: boolean; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState<{ summary: string; needs: string[]; plan: { text: string; on: boolean }[]; label: "AI" | "자동"; note?: string } | null>(null);
  const [saved, save, saving] = useActionState<PlanState, FormData>(saveStudyPlan, {});

  async function run() {
    setBusy(true);
    setError("");
    const r = await analyzeMyScores();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setRes({ summary: r.summary, needs: r.needs, plan: r.plan.map((text) => ({ text, on: true })), label: r.label, note: r.note });
  }
  const picked = res?.plan.filter((p) => p.on).map((p) => p.text) ?? [];

  return (
    <>
      <AiBanner
        title="성적 분석"
        label={res?.label ?? (ai ? "AI" : "자동")}
        line={busy ? "읽는 중이에요" : error || res?.summary || line || "모의고사 성적이 쌓이면 추이를 알려 줘요"}
        action={
          res ? (
            <Button size="sm" kind="ghost" onClick={() => setRes(null)}>닫기</Button>
          ) : (
            <Button size="sm" kind="outline" onClick={run} disabled={busy || disabled}>{busy ? "분석하는 중…" : "필요한 등급 보기"}</Button>
          )
        }
      />
      {res && (
        <Card title="필요한 등급과 공부 계획" action={<Tag tone={res.label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong"}>{res.label === "AI" ? "AI 요약" : "자동"}</Tag>}>
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
            <p className="flex-1 text-[13px] text-mute">{saved.saved ? "공부 계획에 담았어요" : res.note ?? (res.label === "AI" ? "이름·학번 없이 가명ID와 등급만 보냈어요" : "AI 없이 규칙으로 정리했어요")}</p>
            <Button size="sm" disabled={saving || picked.length === 0}>{saving ? "담는 중…" : "확인 후 담기"}</Button>
          </form>
          {saved.error && <p className="mt-2 text-sm text-bad" role="alert">{saved.error}</p>}
        </Card>
      )}
    </>
  );
}
