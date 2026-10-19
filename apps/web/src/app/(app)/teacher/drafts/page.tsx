import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Avatar, ButtonLink, Card, Tag, cx } from "@/components/ui";
import { isAdmin } from "@/lib/domain/policy";
import { buildEvidence, latestVersion, reviewStatus, SOURCE_LABEL, type ReviewStatus } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { DraftEditor } from "./editor";
import { EvidenceDocs } from "./evidence-docs";
import { similarCount, similarPairs, type SimilarPair } from "@/lib/domain/similar";
import { SimilarBadge } from "@/components/writing/similar-sheet";
import { makeStudentNo } from "@/lib/domain/roster";
import { CheckSwap, CheckStatus, WorkspaceProvider } from "@/components/writing/workspace";
import { ClassCheckButton, ClassCheckPanel } from "@/components/writing/class-check-panel";
import { EditRatioChip } from "@/components/writing/edit-ratio-chip";
import { editRatio } from "@/lib/domain/provenance";
import { draftPool, provView } from "@/lib/server/provenance";

export const metadata = { title: "초안 검토·확정 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ program?: string; d?: string; tab?: string; check?: string }> };

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
  // 비슷한 문장 (Figma N34 ④): 프로그램마다 최신 초안(반려 빼고)끼리 여섯 어절 넘게 겹친 곳 (규칙, AI 없음)
  const pairsByProgram = new Map<string, SimilarPair[]>();
  for (const pid of new Set(items.map((x) => x.program.id))) {
    const texts = items.filter((x) => x.program.id === pid && x.latest && x.latest.status !== "rejected" && x.latest.content.trim()).map((x) => ({ id: x.job.id, text: x.latest!.content }));
    pairsByProgram.set(pid, similarPairs(texts));
  }
  const simOf = (x: (typeof items)[number]) => similarCount(pairsByProgram.get(x.program.id) ?? [], x.job.id);
  // 반 전체 검사 (N35 ①): 프로그램 하나를 볼 때만 (프로그램 머리 = 검토 목록 카드 머리)
  const checkProgram = q.program && programs.some((p) => p.id === q.program) ? q.program : programs.length === 1 ? programs[0].id : null;
  const count = (k: string) => items.filter((x) => TABS.find((t) => t[0] === k)![2].includes(x.status)).length;

  // N38: AI 원안에서 고친 비율 (최신 버전 기준). 원안이 없는 초안(마이그레이션 전 · 직접 쓴 글)은 모름 → 칩 없음
  const [originals, settings] = await Promise.all([repo.listAiOriginals(items.map((x) => x.latest?.aiOriginalId ?? "").filter(Boolean)), repo.getProvenanceSettings()]);
  const origOf = new Map(originals.map((o) => [o.id, o]));
  const ratioOf = (x: (typeof items)[number]): number | undefined => {
    const o = x.latest?.aiOriginalId ? origOf.get(x.latest.aiOriginalId) : undefined;
    return o && x.latest ? x.latest.editRatio ?? editRatio(o.content, x.latest.content) : undefined;
  };
  const ratios = new Map(items.map((x) => [x.job.id, ratioOf(x)]));

  const picked = items.find((x) => x.job.id === q.d);
  const tabKey = TABS.some((t) => t[0] === q.tab) ? q.tab! : picked ? TABS.find((t) => t[2].includes(picked.status))?.[0] ?? "wait" : "wait";
  // 목록: 수정 적은 순 (같으면 지금 순서 · 모르는 초안과 초안 없음은 뒤로)
  const list = items.filter((x) => TABS.find((t) => t[0] === tabKey)![2].includes(x.status))
    .map((x, i) => ({ x, i, r: ratios.get(x.job.id) }))
    .sort((a, b) => (a.r ?? 101) - (b.r ?? 101) || a.i - b.i)
    .map((y) => y.x);
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
    // N38: 원안 · 근거 표 (설문 문항 · 서류, 이름·학번 가림)
    const set = new Set(p.targetIds);
    const people = students.filter((x) => set.has(x.id) || x.id === s.id).map((x) => ({ name: x.name, studentNo: x.studentNo }));
    const pv = await provView(sel.latest);
    const pool = draftPool(p, response, mats, people);

    detail = (
      <>
        <Card className="pane-draft h-full min-w-0">
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
                studentId={sel.job.studentId}
                initial={initial}
                unit={sel.job.unit}
                max={sel.job.max}
                area={p.area}
                people={[{ name: s.name, studentNo: s.studentNo }]}
                evidence={evidence}
                peers={items
                  .filter((x) => x.program.id === p.id && x.job.id !== sel.job.id && x.latest && x.latest.status !== "rejected")
                  .map((x) => ({ label: x.student!.name, text: x.latest!.content }))}
                similarPeers={{
                  self: { id: sel.job.id, name: s.name, no: makeStudentNo(s.grade, s.classNo, s.number), href: base(`tab=${tabKey}&d=${sel.job.id}`) },
                  peers: (pairsByProgram.get(p.id) ?? []).filter((x) => x.a === sel.job.id || x.b === sel.job.id).map((x) => (x.a === sel.job.id ? x.b : x.a))
                    .map((id) => items.find((x) => x.job.id === id)).filter((x): x is (typeof items)[number] => !!x && !!x.latest)
                    .map((x) => ({ id: x.job.id, name: x.student!.name, no: makeStudentNo(x.student!.grade, x.student!.classNo, x.student!.number), text: x.latest!.content, href: base(`d=${x.job.id}`) })),
                }}
                aiOn={aiEnabled()}
                openCheck={q.check === "1"}
                prov={{ original: pv.original, pins: pv.pins, pool, editRatioMin: settings.editRatioMin, who: s.name }}
                finalized={sel.status === "확정"}
                tags={[`근거: ${SOURCE_LABEL[p.source]}`, `버전 ${jobVersions.length}`, ...(sel.latest?.source === "sample" ? ["예시"] : sel.latest?.source === "ai" ? ["AI 초안"] : [])]}
              />
            </>
          )}
        </Card>

        <Card title="근거 자료" className="pane-ev h-full min-w-0 md:col-start-2 xl:col-start-auto">
          {evidence.length === 0 && <p className="text-[13px] text-mute">근거 자료가 없어요</p>}
          <EvidenceDocs key={`${p.id}-${s.id}`} programId={p.id} docs={mats.map((m) => ({ id: m.id, fileName: m.fileName, pages: m.pages, text: m.text }))} />
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
          <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&>*]:shrink-0 [&>*]:whitespace-nowrap">
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
          <WorkspaceProvider key={checkProgram ?? "none"} scope={{ kind: "drafts", programId: checkProgram ?? "" }}>
          <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)] md:gap-6 xl:grid-cols-[260px_minmax(0,1fr)_300px] max-md:[&:has(#pane-ev:checked)_.pane-draft]:hidden max-md:[&:has(#pane-draft:checked)_.pane-ev]:hidden">
            {/* 모바일: 대기 줄 + 초안/근거 자료 전환 (Figma 45:3106) */}
            {sel && (
              <div className="flex flex-col gap-2.5 md:hidden">
                <div className="flex items-center text-[13px]">
                  <a href="#queue" className="flex-1 truncate font-medium text-sub">{sel.student?.name ?? "학생"}{list.length > 1 ? ` 외 ${list.length - 1}명` : ""} {TABS.find((t) => t[0] === tabKey)![1]}</a>
                  <span className="font-bold">{idx + 1} / {list.length}</span>
                </div>
                {/* 검토 대기 목록 카드 (N38 (f) 모바일): 수정 적은 순 4명 + 더 보기 */}
                <div className="flex flex-col gap-1 rounded-card border border-line bg-white px-4 py-3.5">
                  <div className="flex items-center pb-1">
                    <span className="flex-1 text-[14px] font-bold">검토 {TABS.find((t) => t[0] === tabKey)![1]} {list.length}</span>
                    <span className="text-[11px] font-medium text-mute">AI 원안에서 수정 ↓</span>
                  </div>
                  {list.slice(0, 4).map((x) => (
                    <Link key={x.job.id} href={base(`tab=${tabKey}&d=${x.job.id}`)} aria-current={x.job.id === sel.job.id ? "true" : undefined}
                      className={cx("flex items-center gap-2 rounded-inner px-2.5 py-2", x.job.id === sel.job.id ? "bg-bg" : "")}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-bold">{x.student!.name}</span>
                        <span className="block truncate text-[12px] text-mute">{x.program.title}</span>
                      </span>
                      {!x.latest ? <span className="text-[11px] text-faint">초안 없음</span> : <EditRatioChip ratio={ratios.get(x.job.id)} min={settings.editRatioMin} />}
                    </Link>
                  ))}
                  <div className="flex items-center gap-2 pt-1 text-[12px]">
                    {list.length > 4 ? <a href="#queue" className="font-medium text-sub">+ {list.length - 4}명 더 보기</a> : <span />}
                    <span className="ml-auto text-mute">{settings.editRatioMin}% 미만은 확정 전에 한 번 더 물어봐요</span>
                  </div>
                </div>
                <div className="flex gap-1 rounded-full bg-soft p-1 text-sm" role="radiogroup">
                  <label className="flex-1 cursor-pointer rounded-full py-2.5 text-center text-mute has-[:checked]:bg-white has-[:checked]:font-bold has-[:checked]:text-ink">
                    <input type="radio" name="pane" id="pane-draft" defaultChecked className="sr-only" />초안
                  </label>
                  <label className="flex-1 cursor-pointer rounded-full py-2.5 text-center text-mute has-[:checked]:bg-white has-[:checked]:font-bold has-[:checked]:text-ink">
                    <input type="radio" name="pane" id="pane-ev" className="sr-only" />근거 자료
                  </label>
                </div>
              </div>
            )}
            <div id="queue" className="order-2 h-full scroll-mt-4 md:order-none"><Card title={`검토 ${TABS.find((t) => t[0] === tabKey)![1]} ${list.length}`} className="h-full">
              {checkProgram && <div className="-mt-1 mb-3"><ClassCheckButton /></div>}
              <nav className="mb-3 flex gap-1.5">
                {TABS.map(([k, label]) => (
                  <Link key={k} href={base(`tab=${k}`)} className={cx("rounded-chip px-2.5 py-1.5 text-[13px]", tabKey === k ? "bg-key font-bold text-white" : "bg-white text-sub")}>{label} {count(k)}</Link>
                ))}
              </nav>
              {list.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-mute">없어요</p>
              ) : (
                <>
                <div className="mb-1 flex items-center px-0 text-[11px] font-medium text-mute">
                  <span className="flex-1">학생</span><span>AI 원안에서 수정 ↓</span>
                </div>
                <ul className="-mx-2 flex max-h-[620px] flex-col overflow-y-auto">
                  {list.map((x) => {
                    const on = x.job.id === sel?.job.id;
                    const ratio = ratios.get(x.job.id);
                    return (
                      <li key={x.job.id}>
                        <Link href={base(`tab=${tabKey}&d=${x.job.id}`)} aria-current={on ? "true" : undefined} className={cx("flex items-center gap-3 rounded-inner px-2 py-2.5", on ? "bg-white" : "hover:bg-white/60")}>
                          <Avatar name={x.student!.name} size={34} />
                          <span className="min-w-0 flex-1">
                            <span className={cx("block truncate text-[14px]", on && "font-bold")}>{x.student!.name}</span>
                            <span className="block truncate text-[12px] text-mute">{x.program.title}</span>
                            {simOf(x) > 0 && <span className="mt-0.5 block"><SimilarBadge n={simOf(x)} /></span>}
                          </span>
                          <CheckStatus id={x.job.id}>
                            {x.status !== "검토 대기" && x.status !== "확정" && x.status !== "반려"
                              ? <Tag>{x.status === "생성 실패" && x.job.manualRequestedAt ? "수동 작성 요청" : x.status}</Tag>
                              : !x.latest ? <span className="shrink-0 whitespace-nowrap text-[11px] text-faint">초안 없음</span>
                              : <EditRatioChip ratio={ratio} min={settings.editRatioMin} />}
                          </CheckStatus>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 rounded-inner bg-bg px-3 py-2.5 text-[12px] leading-[18px] text-sub">수정 {settings.editRatioMin}% 미만은 노란 칩 · 확정 전에 한 번 더 물어봐요</p>
                </>
              )}
            </Card></div>
            <CheckSwap panel={<ClassCheckPanel />} className="order-1 md:order-none xl:col-span-2">
              {detail ?? <Card><p className="py-10 text-center text-sm text-mute">왼쪽에서 학생을 골라 주세요</p></Card>}
            </CheckSwap>
          </div>
          </WorkspaceProvider>
        )}
      </PageBody>
    </>
  );
}
