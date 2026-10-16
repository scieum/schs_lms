import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Avatar, ButtonLink, Card, Tag, cx } from "@/components/ui";
import { measure } from "@/lib/domain/length";
import { isAdmin } from "@/lib/domain/policy";
import { buildEvidence, latestVersion, reviewStatus, SOURCE_LABEL, type ReviewStatus } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { DraftEditor } from "./editor";

export const metadata = { title: "초안 검토·확정 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ program?: string; d?: string; tab?: string }> };

const TABS: [string, string, ReviewStatus[]][] = [
  ["wait", "대기", ["검토 대기", "생성 실패", "생성 중"]],
  ["done", "확정", ["확정"]],
  ["rejected", "반려", ["반려"]],
];

export default async function DraftsPage({ searchParams }: Props) {
  const v = await requireCan("draft.review");
  const q = await searchParams;
  let programs = await repo.listPrograms({ ownerId: v.accountId });
  // 관리자는 다른 교사 프로그램도 열 수 있다 (오류 처리에서 넘어올 때)
  if (q.program && isAdmin(v) && !programs.some((p) => p.id === q.program)) {
    const extra = await repo.getProgram(q.program);
    if (extra) programs = [...programs, extra];
  }
  if (q.d && isAdmin(v)) {
    const j = await repo.getDraftJob(q.d);
    if (j && !programs.some((p) => p.id === j.programId)) {
      const extra = await repo.getProgram(j.programId);
      if (extra) programs = [...programs, extra];
    }
  }
  const scope = q.program ? programs.filter((p) => p.id === q.program) : programs;
  const ids = scope.map((p) => p.id);
  const [jobs, versions, students] = await Promise.all([
    repo.listDraftJobs({ programIds: ids }),
    repo.listDraftVersions({ programIds: ids }),
    repo.listStudents(),
  ]);
  const sById = new Map(students.map((s) => [s.id, s]));
  const pById = new Map(programs.map((p) => [p.id, p]));

  const items = jobs
    .map((j) => {
      const latest = latestVersion(versions, j.id);
      return { job: j, latest, status: reviewStatus(j, latest), student: sById.get(j.studentId), program: pById.get(j.programId)! };
    })
    .filter((x) => x.student && x.program)
    .sort((a, b) => a.program.title.localeCompare(b.program.title, "ko") || a.student!.classNo - b.student!.classNo || a.student!.number - b.student!.number);
  const count = (k: string) => items.filter((x) => TABS.find((t) => t[0] === k)![2].includes(x.status)).length;

  const picked = items.find((x) => x.job.id === q.d);
  const tabKey = TABS.some((t) => t[0] === q.tab) ? q.tab! : picked ? TABS.find((t) => t[2].includes(picked.status))?.[0] ?? "wait" : "wait";
  const list = items.filter((x) => TABS.find((t) => t[0] === tabKey)![2].includes(x.status));
  const sel = picked ?? list[0];
  const idx = sel ? list.indexOf(sel) : -1;
  const base = (extra: string) => `/teacher/drafts?${q.program ? `program=${q.program}&` : ""}${extra}`;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : list[0] !== sel ? list[0] : undefined;

  // 선택한 학생의 근거·버전
  let detail: ReactNode = null;
  if (sel && sel.student) {
    const s = sel.student;
    const p = sel.program;
    const [response, materials] = await Promise.all([repo.getResponse(p.id, s.id), repo.listMaterials(p.id)]);
    const mats = materials.filter((m) => m.studentId === s.id && m.status === "matched");
    const evidence = buildEvidence(p, response, mats);
    const jobVersions = versions.filter((x) => x.jobId === sel.job.id);
    const answered = p.questions.filter((qq) => response?.submittedAt && (response.answers[qq.id] ?? "").trim());
    const initial = sel.latest?.content ?? "";

    detail = (
      <>
        <Card className="h-full min-w-0">
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={s.name} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] font-bold">{s.name} · {s.grade}학년 {s.classNo}반 {s.number}번</div>
              <div className="truncate text-[13px] text-mute">{p.title}</div>
            </div>
            <span className="hidden text-[13px] text-mute md:inline">{idx + 1} / {list.length}</span>
            {idx > 0 && <Link href={base(`tab=${tabKey}&d=${list[idx - 1].job.id}`)} aria-label="이전" className="flex size-8 items-center justify-center rounded-control border border-hair bg-white"><ChevronLeft size={16} /></Link>}
            {next && <Link href={base(`tab=${tabKey}&d=${next.job.id}`)} aria-label="다음" className="flex size-8 items-center justify-center rounded-control border border-hair bg-white"><ChevronRight size={16} /></Link>}
          </div>
          {sel.status === "생성 중" ? (
            <p className="py-10 text-center text-sm text-wait">초안을 만드는 중이에요. 잠시 뒤 새로고침해 주세요</p>
          ) : (
            <>
              {sel.status === "생성 실패" && (
                <p className="mb-3 rounded-inner bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad">{sel.job.error ?? "생성 실패"} — 직접 써서 저장하거나 분량을 바꿔 다시 만들어 주세요</p>
              )}
              {sel.latest?.status === "rejected" && (
                <p className="mb-3 rounded-inner bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad">반려 사유: {sel.latest.reason}</p>
              )}
              <DraftEditor
                key={`${sel.job.id}-${sel.latest?.id ?? "none"}`}
                jobId={sel.job.id}
                initial={initial}
                unit={sel.job.unit}
                max={sel.job.max}
                area={p.area}
                people={[{ name: s.name, studentNo: s.studentNo }]}
                evidence={evidence}
                peers={items
                  .filter((x) => x.program.id === p.id && x.job.id !== sel.job.id && x.latest && x.latest.status !== "rejected")
                  .map((x) => ({ label: x.student!.name, text: x.latest!.content }))}
                aiOn={aiEnabled()}
                finalized={sel.status === "확정"}
                tags={[`근거: ${SOURCE_LABEL[p.source]}`, `버전 ${jobVersions.length}`, ...(sel.latest?.source === "sample" ? ["예시"] : sel.latest?.source === "ai" ? ["AI 초안"] : [])]}
              />
            </>
          )}
        </Card>

        <Card title="근거 자료" className="h-full min-w-0 md:col-start-2 xl:col-start-auto">
          {evidence.length === 0 && <p className="text-[13px] text-mute">근거 자료가 없어요</p>}
          {mats.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              <span className="text-[13px] font-medium text-sub">제출 서류 {mats.length}</span>
              {mats.map((m) => (
                <a key={m.id} href={`/teacher/programs/${p.id}/materials/file/${m.id}`} target="_blank" rel="noreferrer" className="flex flex-col gap-2 rounded-inner bg-white p-3 hover:bg-key-soft">
                  <span className="flex items-center gap-1.5 truncate text-[13px] font-medium"><FileText size={14} className="shrink-0" /> {m.fileName}{m.pages ? ` · ${m.pages}쪽` : ""}</span>
                  {m.text ? <span className="rounded-field bg-soft p-2.5 text-[13px] leading-6 text-sub">&quot;{m.text.length > 160 ? `${m.text.slice(0, 160)}…` : m.text}&quot;</span> : <span className="text-[12px] text-mute">글을 아직 읽지 않았어요 (자료 등록에서 AI로 읽기)</span>}
                </a>
              ))}
            </div>
          )}
          {answered.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-sub">설문 응답 {answered.length}</span>
              {answered.map((qq) => (
                <div key={qq.id} className="rounded-inner bg-white p-3">
                  <div className="text-[13px] font-bold">Q{p.questions.indexOf(qq) + 1} {qq.fixed ? qq.title : qq.prompt}</div>
                  <p className="mt-1 text-[13px] leading-6 text-sub">{response!.answers[qq.id]}</p>
                </div>
              ))}
            </div>
          )}
          {jobVersions.length > 1 && (
            <details className="mt-4 text-[13px]">
              <summary className="cursor-pointer text-sub">이전 버전 {jobVersions.length - 1}개</summary>
              <ul className="mt-2 flex flex-col gap-2">
                {[...jobVersions].reverse().slice(1).map((x) => (
                  <li key={x.id} className="rounded-inner bg-white p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[12px] text-mute">
                      {new Date(x.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      <Tag tone="bg-soft text-sub">{x.status === "finalized" ? "확정" : x.status === "rejected" ? "반려" : x.source === "manual" ? "수정" : "초안"}</Tag>
                    </div>
                    <p className="line-clamp-3 text-sub">{x.content}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="초안 검토·확정"
        actions={
          <>
            {q.program && <ButtonLink href={`/teacher/programs/${q.program}`} kind="outline" size="sm">{pById.get(q.program)?.title ?? "프로그램"}</ButtonLink>}
            {next && <ButtonLink href={base(`tab=${tabKey}&d=${next.job.id}`)} kind="outline" size="sm"><ChevronRight size={14} /> 다음 초안</ButtonLink>}
          </>
        }
      />
      <PageBody>
        <p className="-mt-2 text-[13px] text-mute md:-mt-4">검토 대기 {items.filter((x) => x.status === "검토 대기").length}건 · 확정 {count("done")}건 · 반려 {count("rejected")}건{items.some((x) => x.status === "생성 실패") ? ` · 생성 실패 ${items.filter((x) => x.status === "생성 실패").length}건` : ""}</p>
        {programs.length > 1 && (
          <nav className="flex flex-wrap gap-1.5">
            <Link href="/teacher/drafts" className={cx("rounded-chip px-3 py-1.5 text-[13px]", !q.program ? "bg-key font-bold text-white" : "bg-soft text-sub")}>전체</Link>
            {programs.map((p) => (
              <Link key={p.id} href={`/teacher/drafts?program=${p.id}`} className={cx("rounded-chip px-3 py-1.5 text-[13px]", q.program === p.id ? "bg-key font-bold text-white" : "bg-soft text-sub")}>{p.title}</Link>
            ))}
          </nav>
        )}
        {items.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">검토할 초안이 아직 없어요</p>
              <p className="text-sm text-sub">프로그램 상세에서 &quot;초안 만들기&quot;를 눌러 주세요</p>
              <ButtonLink href="/teacher/programs">프로그램 보기</ButtonLink>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)] md:gap-6 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
            <Card title={`검토 ${TABS.find((t) => t[0] === tabKey)![1]} ${list.length}`} className="order-2 h-full md:order-none">
              <nav className="mb-3 flex gap-1.5">
                {TABS.map(([k, label]) => (
                  <Link key={k} href={base(`tab=${k}`)} className={cx("rounded-chip px-2.5 py-1.5 text-[13px]", tabKey === k ? "bg-key font-bold text-white" : "bg-white text-sub")}>{label} {count(k)}</Link>
                ))}
              </nav>
              {list.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-mute">없어요</p>
              ) : (
                <ul className="-mx-2 flex max-h-[620px] flex-col overflow-y-auto">
                  {list.map((x) => {
                    const on = x.job.id === sel?.job.id;
                    const len = x.latest ? measure(x.latest.content, x.job.unit) : null;
                    return (
                      <li key={x.job.id}>
                        <Link href={base(`tab=${tabKey}&d=${x.job.id}`)} aria-current={on ? "true" : undefined} className={cx("flex items-center gap-3 rounded-inner px-2 py-2.5", on ? "bg-white" : "hover:bg-white/60")}>
                          <Avatar name={x.student!.name} size={34} />
                          <span className="min-w-0 flex-1">
                            <span className={cx("block truncate text-[14px]", on && "font-bold")}>{x.student!.name}</span>
                            <span className="block truncate text-[12px] text-mute">{x.program.title}{len !== null ? ` · ${len.toLocaleString()}${x.job.unit === "bytes" ? "B" : "자"}` : ""}</span>
                          </span>
                          {x.status !== "검토 대기" && x.status !== "확정" && x.status !== "반려" && <Tag>{x.status === "생성 실패" && x.job.manualRequestedAt ? "수동 작성 요청" : x.status}</Tag>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            {detail ?? <Card><p className="py-10 text-center text-sm text-mute">왼쪽에서 학생을 골라 주세요</p></Card>}
          </div>
        )}
      </PageBody>
    </>
  );
}
