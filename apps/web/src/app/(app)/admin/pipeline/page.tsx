import { RefreshCw } from "lucide-react";
import { Bar } from "@/components/programs/meters";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card, StatTiles, Tag, cx } from "@/components/ui";
import { STAGE_LABEL, summarizeErrors } from "@/lib/domain/program";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { StageStrip } from "@/components/admin/stage-strip";
import { loadPipeline } from "./load";
import { aiEnabled } from "@/lib/server/ai/claude";
import { AdviceBanner } from "./advice";

export const metadata = { title: "초안 생성 현황 · 속초고 쌤기부" };

const GATE_TONE = { 통과: "bg-ok-soft text-ok", 진행: "bg-wait-soft text-wait", 대기: "bg-wait-soft text-wait" } as const;

// A4 초안 생성 현황 (Figma 75:1117 / 75:1295)
export default async function PipelinePage() {
  await requireCan("pipeline.view");
  const [{ per, stageCount, busy }, jobs] = await Promise.all([loadPipeline(), repo.listDraftJobs({})]);
  const done = jobs.filter((j) => j.state === "DONE").length;
  const errors = jobs.filter((j) => j.state === "ERROR");
  const passRate = done + errors.length ? Math.round((done / (done + errors.length)) * 100) : 100;
  const causes = summarizeErrors(errors.map((j) => j.error));

  return (
    <>
      <PageHeader title="초안 생성 현황" eyebrow={`프로그램 ${per.length}개`} actions={<span className="hidden md:block"><ButtonLink href="/admin/pipeline" kind="outline"><RefreshCw size={16} /> 새로고침</ButtonLink></span>} />
      <PageBody>
        <StatTiles items={[
          ["진행 중", `${per.filter((x) => x.stage !== "S5").length}개`],
          ["완료", `${per.filter((x) => x.stage === "S5").length}개`],
          ["검사 통과율", `${passRate}%`],
          ["실패", `${errors.length}건`],
        ]} />
        <AdviceBanner
          title="실패 원인 요약"
          line={causes.length ? causes.map((c) => `${c.cause} ${c.n}건`).join(" · ") : "실패한 초안이 없어요"}
          failed={errors.length}
          aiOn={aiEnabled()}
        />
        <Card title="단계별">
          <StageStrip count={stageCount} busy={busy} />
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
