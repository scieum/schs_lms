import Link from "next/link";
import { Plus } from "lucide-react";
import { Bar } from "@/components/programs/meters";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, ButtonLink, Card, StatTiles, Tag } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { isAdmin } from "@/lib/domain/policy";
import { AREA_LABEL, ddayLabel, effectiveStatus, latestVersion, md, responseRate, reviewStatus, SOURCE_LABEL } from "@/lib/domain/program";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";

export const metadata = { title: "프로그램·자료 · 속초고등학교 학생관리시스템" };

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const v = await requireCan("program.manage");
  const showAll = (await searchParams).all === "1" && isAdmin(v);
  const programs = await repo.listPrograms(showAll ? undefined : { ownerId: v.accountId });
  const ids = programs.map((p) => p.id);
  const [jobs, versions, responses] = await Promise.all([
    repo.listDraftJobs({ programIds: ids }),
    repo.listDraftVersions({ programIds: ids }),
    Promise.all(programs.map((p) => repo.listResponses(p.id))),
  ]);
  const t = today();

  const summary = programs.map((p, i) => {
    const submitted = responses[i].filter((r) => r.submittedAt && p.targetIds.includes(r.studentId)).length;
    const pj = jobs.filter((j) => j.programId === p.id);
    const st = pj.map((j) => reviewStatus(j, latestVersion(versions, j.id)));
    return {
      p, submitted, rate: responseRate(p.targetIds.length, submitted), status: effectiveStatus(p, t),
      review: st.filter((s) => s === "검토 대기").length, done: st.filter((s) => s === "확정").length, failed: st.filter((s) => s === "생성 실패").length,
    };
  });
  const open = summary.filter((s) => s.status === "open");
  const avg = open.length ? Math.round(open.reduce((n, s) => n + s.rate, 0) / open.length) : 0;
  const soon = open.filter((s) => { const d = ddayLabel(s.p.endDate, t); return d === "D-day" || /^D-[1-3]$/.test(d); });

  return (
    <>
      <PageHeader
        title="프로그램·자료"
        actions={
          <>
            {isAdmin(v) && <ButtonLink href={showAll ? "/teacher/programs" : "/teacher/programs?all=1"} kind="outline" size="sm">{showAll ? "내 것만" : "전체 보기"}</ButtonLink>}
            <ButtonLink href="/teacher/programs/new" size="sm"><Plus size={14} /> 새 프로그램</ButtonLink>
          </>
        }
      />
      <PageBody>
        <StatTiles items={[["진행 중", `${open.length}개`], ["평균 응답률", `${avg}%`], ["검토 대기", `${summary.reduce((n, s) => n + s.review, 0)}건`], ["생성 실패", `${summary.reduce((n, s) => n + s.failed, 0)}건`]]} />
        {soon.length > 0 && (
          <AiBanner label="자동" title="마감 임박" line={soon.map((s) => `${s.p.title} ${ddayLabel(s.p.endDate, t)} · 미응답 ${s.p.targetIds.length - s.submitted}명`).join(" · ")}
            action={<ButtonLink href={`/teacher/programs/${soon[0].p.id}`} size="sm" className="hidden md:inline-flex">독촉하기</ButtonLink>} />
        )}
        {programs.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">아직 프로그램이 없어요</p>
              <ButtonLink href="/teacher/programs/new">새 프로그램 만들기</ButtonLink>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            {summary.map((s) => (
              <Link key={s.p.id} href={`/teacher/programs/${s.p.id}`} className="rounded-card bg-soft p-5 hover:bg-[#eceef1] md:p-6">
                <div className="flex items-center gap-2">
                  <h2 className="min-w-0 flex-1 truncate text-[17px] font-bold">{s.p.title}</h2>
                  {s.status === "draft" ? <Tag>임시 저장</Tag> : s.status === "closed" ? <Tag tone="bg-white text-mute">마감</Tag> : <Tag>{ddayLabel(s.p.endDate, t)}</Tag>}
                </div>
                <div className="mt-1 text-[13px] text-mute">
                  {AREA_LABEL[s.p.area]}{s.p.subject ? ` ${s.p.subject}` : ""} · {md(s.p.startDate)} ~ {md(s.p.endDate)} · {SOURCE_LABEL[s.p.source]} · {s.p.targetIds.length}명
                </div>
                <div className="mt-4 flex items-center justify-between text-[13px]">
                  <span className="text-sub">응답률</span>
                  <span className="font-bold">{s.rate}% <span className="font-normal text-mute">({s.submitted}/{s.p.targetIds.length})</span></span>
                </div>
                <Bar pct={s.rate} className="mt-1.5" />
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {s.review > 0 && <Tag>{`검토 대기 ${s.review}`}</Tag>}
                  {s.done > 0 && <Tag>{`확정 ${s.done}`}</Tag>}
                  {s.failed > 0 && <Tag>{`생성 실패 ${s.failed}`}</Tag>}
                  {s.review + s.done + s.failed === 0 && <Tag tone="bg-white text-mute">초안 전</Tag>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
