import { RefreshCw } from "lucide-react";
import { Bar } from "@/components/programs/meters";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, Button, ButtonLink, Card, StatTiles, Tag, cx } from "@/components/ui";
import { programGates, programStage, STAGE_LABEL, summarizeErrors, type Stage } from "@/lib/domain/program";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { programRows } from "../../teacher/programs/_lib/data";
import { retryDrafts } from "./actions";

export const metadata = { title: "초안 생성 현황 · 속초고등학교 학생관리시스템" };

const STAGES: Stage[] = ["S1", "S2", "S3", "S4", "S5"];
const GATE_TONE = { 통과: "bg-ok-soft text-ok", 진행: "bg-wait-soft text-wait", 대기: "bg-soft text-mute" } as const;

// A4 초안 생성 현황 (Figma 75:1117 / 75:1295)
export default async function PipelinePage() {
  await requireCan("pipeline.view");
  const programs = (await repo.listPrograms()).filter((p) => p.status !== "draft");
  const [all, jobs] = await Promise.all([Promise.all(programs.map((p) => programRows(p))), repo.listDraftJobs({})]);

  const per = programs.map((p, i) => {
    const stages = all[i].rows.map((r) => r.stage);
    const hasError = all[i].rows.some((r) => r.review === "생성 실패");
    const finalized = stages.filter((s) => s === "S4" || s === "S5").length;
    return { p, stages, stage: programStage(stages), gates: programGates(stages, hasError), pct: stages.length ? (finalized / stages.length) * 100 : 0 };
  });
  const stageCount = Object.fromEntries(STAGES.map((s) => [s, per.reduce((n, x) => n + x.stages.filter((y) => y === s).length, 0)])) as Record<Stage, number>;
  const done = jobs.filter((j) => j.state === "DONE").length;
  const errors = jobs.filter((j) => j.state === "ERROR");
  const passRate = done + errors.length ? Math.round((done / (done + errors.length)) * 100) : 100;
  const causes = summarizeErrors(errors.map((j) => j.error));
  const busy = (["S1", "S2", "S3"] as Stage[]).reduce((a, b) => (stageCount[b] > stageCount[a] ? b : a), "S2" as Stage);

  return (
    <>
      <PageHeader title="초안 생성 현황" actions={<ButtonLink href="/admin/pipeline" kind="outline" size="sm"><RefreshCw size={14} /> 새로고침</ButtonLink>} />
      <PageBody>
        <StatTiles items={[
          ["진행 중", `${per.filter((x) => x.stage !== "S5").length}개`],
          ["완료", `${per.filter((x) => x.stage === "S5").length}개`],
          ["검사 통과율", `${passRate}%`],
          ["실패", `${errors.length}건`],
        ]} />
        <AiBanner
          label="자동"
          title="실패 원인 요약"
          line={causes.length ? causes.map((c) => `${c.cause} ${c.n}건`).join(" · ") : "실패한 초안이 없어요"}
          action={
            <form action={retryDrafts}>
              <Button size="sm" disabled={errors.length === 0}>다시 시도</Button>
            </form>
          }
        />
        <Card title="단계별">
          <div className="grid grid-cols-5 gap-1.5 md:gap-2.5">
            {STAGES.map((s) => (
              <div key={s} className={cx("flex flex-col items-center rounded-inner py-3 md:py-4", s === busy ? "bg-key text-white" : "bg-white")}>
                <span className="text-xl font-bold md:text-[22px]">{stageCount[s]}</span>
                <span className={cx("text-[11px] md:text-[12px]", s === busy ? "text-white/80" : "text-mute")}>{s} {STAGE_LABEL[s]}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="프로그램별">
          {per.length === 0 ? (
            <p className="py-6 text-center text-sm text-mute">발행된 프로그램이 없어요</p>
          ) : (
            <ul>
              {per.map((x, i) => (
                <li key={x.p.id} className={cx("flex flex-col gap-2 py-3 md:flex-row md:items-center md:gap-4", i < per.length - 1 && "border-b border-line")}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{x.p.title}</div>
                    <div className="text-[12px] text-mute">{x.stage} {STAGE_LABEL[x.stage]} · {x.stages.length}명</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {x.gates.map((g, k) => <Tag key={k} tone={GATE_TONE[g]}>{`G${k + 1} ${g}`}</Tag>)}
                  </div>
                  <Bar pct={x.pct} className="w-full md:w-28" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
