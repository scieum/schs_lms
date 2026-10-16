import { AlertCircle } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, Button, ButtonLink, Card, StatTiles, Tag } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { daysLeft, effectiveStatus, summarizeErrors } from "@/lib/domain/program";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { requestManual, retryDrafts } from "../pipeline/actions";

export const metadata = { title: "오류 처리 · 속초고등학교 학생관리시스템" };

const icon = <span className="flex size-10 shrink-0 items-center justify-center rounded-field bg-white"><AlertCircle size={20} /></span>;

// 오류 처리 큐: 초안 생성 실패(ERROR) + 확인 필요(응답 0건 · 학생 지정 안 된 서류)
export default async function ErrorsPage() {
  await requireCan("pipeline.view");
  const t = today();
  const [failed, programs, students, teachers] = await Promise.all([repo.listDraftJobs({ states: ["ERROR"] }), repo.listPrograms(), repo.listStudents(), repo.listTeachers()]);
  const pById = new Map(programs.map((p) => [p.id, p]));
  const sById = new Map(students.map((s) => [s.id, s]));
  const tName = new Map(teachers.map((x) => [x.id, x.name]));
  const open = programs.filter((p) => effectiveStatus(p, t) === "open");
  const [responses, materials] = await Promise.all([Promise.all(open.map((p) => repo.listResponses(p.id))), Promise.all(open.map((p) => repo.listMaterials(p.id)))]);
  const checks = open.flatMap((p, i) => {
    const out: { key: string; title: string; meta: string; href: string }[] = [];
    const elapsed = daysLeft(p.endDate, t) <= 3;
    if (elapsed && p.source !== "docs" && !responses[i].some((r) => r.submittedAt)) out.push({ key: `${p.id}-r`, title: p.title, meta: `설문 응답 0건 · 마감 ${daysLeft(p.endDate, t)}일 전`, href: `/teacher/programs/${p.id}` });
    const review = materials[i].filter((m) => m.status === "needs_review").length;
    if (review) out.push({ key: `${p.id}-m`, title: p.title, meta: `학생 지정이 필요한 서류 ${review}개`, href: `/teacher/programs/${p.id}/materials` });
    return out;
  });
  const causes = summarizeErrors(failed.map((j) => j.error));

  return (
    <>
      <PageHeader title="오류 처리" />
      <PageBody>
        <StatTiles items={[["생성 실패", `${failed.length}건`], ["수동 작성 요청", `${failed.filter((j) => j.manualRequestedAt).length}건`], ["확인 필요", `${checks.length}건`], ["진행 중 프로그램", `${open.length}개`]]} />
        <AiBanner label="자동" title="오늘 점검" line={causes.length ? `${causes.map((c) => `${c.cause} ${c.n}건`).join(" · ")} — 다시 시도하거나 담당 교사에게 수동 작성을 요청해요` : "생성 실패가 없어요"}
          action={<form action={retryDrafts}><Button size="sm" disabled={failed.length === 0}>모두 다시 시도</Button></form>} />
        <div className="grid gap-4 md:grid-cols-[1fr_360px] md:gap-6">
          <Card title="초안 생성 실패">
            {failed.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">처리할 오류가 없어요</p>
            ) : (
              <ul>
                {failed.map((j, i) => {
                  const p = pById.get(j.programId);
                  const s = sById.get(j.studentId);
                  return (
                    <li key={j.id} className={`flex flex-col gap-2 py-3 md:flex-row md:items-center md:gap-3 ${i < failed.length - 1 ? "border-b border-line" : ""}`}>
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {icon}
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-medium">{s?.name ?? "?"} · {p?.title ?? "?"}</div>
                          <div className="truncate text-[13px] text-mute">{j.error ?? "생성 실패"} · 담당 {tName.get(p?.ownerId ?? "") ?? "?"}</div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 self-end md:self-auto">
                        <span className="flex md:w-[112px] md:justify-end">{j.manualRequestedAt ? <Tag>수동 작성 요청됨</Tag> : <Tag>실패</Tag>}</span>
                        <form action={retryDrafts}><input type="hidden" name="jobId" value={j.id} /><Button size="sm" kind="outline" className="w-[76px] px-0">다시 시도</Button></form>
                        {!j.manualRequestedAt ? <form action={requestManual}><input type="hidden" name="jobId" value={j.id} /><Button size="sm" kind="soft" className="w-[104px] px-0">수동 작성 요청</Button></form> : <span className="hidden w-[104px] md:block" />}
                        <ButtonLink href={`/teacher/drafts?d=${j.id}`} size="sm" kind="outline" className="w-[76px] px-0">보기</ButtonLink>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card title="확인 필요" className="h-full">
            {checks.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">없어요</p>
            ) : (
              <ul>
                {checks.map((c, i) => (
                  <li key={c.key} className={`flex items-center gap-3 py-3 ${i < checks.length - 1 ? "border-b border-line" : ""}`}>
                    {icon}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium">{c.title}</div>
                      <div className="truncate text-[13px] text-mute">{c.meta}</div>
                    </div>
                    <ButtonLink href={c.href} size="sm" kind="outline" className="w-[76px] shrink-0 px-0">보기</ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
