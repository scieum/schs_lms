import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, Check, ChevronRight, FileText, Plus, Send, Shield, Sparkles, Users } from "lucide-react";
import { Ring } from "@/components/programs/meters";
import { PageBody, PageHeader, todayLabel } from "@/components/shell/app-shell";
import { Avatar, ButtonLink, cx } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { counselStats, weekStart } from "@/lib/domain/counsel";
import { addDays, daysLeft, ddayLabel, effectiveStatus, latestVersion, md, reviewStatus, usesDocs } from "@/lib/domain/program";
import { briefingRule } from "@/lib/domain/teacher-assist";
import { aiEnabled } from "@/lib/server/ai/claude";
import { loadAssigned, loadCounsel } from "@/lib/server/counsel";
import { greeting } from "@/lib/domain/greeting";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";
import { TodayBriefing } from "./briefing";
import { SchoolInfoRow } from "@/components/school-info";
import { NewsPopup } from "@/components/news-popup";

/** 학생 제출 서류 → 학생마다 한 번 "제출" (처음 낸 때) — 예전 설문 응답과 같은 모양이라 아래 계산을 그대로 쓴다 */
function submissionsOf(mats: { studentId: string | null; createdAt: string }[]): { studentId: string; submittedAt: string }[] {
  const first = new Map<string, string>();
  for (const m of mats) if (m.studentId && (!first.has(m.studentId) || m.createdAt < first.get(m.studentId)!)) first.set(m.studentId, m.createdAt);
  return [...first].map(([studentId, submittedAt]) => ({ studentId, submittedAt }));
}
import { seoulNow } from "@/lib/domain/night";

export const metadata = { title: "홈 · 속초고 쌤기부" };

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

/** T1 교사 홈 (Figma 45:420 PC · 45:673 Mobile) — D2 벤토 그리드 */
export default async function TeacherHome() {
  const v = await requireViewer();
  if (v.kind !== "teacher") redirect("/");
  const now = today();
  const programs = (await repo.listPrograms({ ownerId: v.accountId })).filter((p) => p.status !== "draft");
  const ids = programs.map((p) => p.id);
  const [waiting, jobs, versions, responses, students] = await Promise.all([
    repo.countDraftReviewQueue(v.accountId),
    ids.length ? repo.listDraftJobs({ programIds: ids }) : Promise.resolve([]),
    ids.length ? repo.listDraftVersions({ programIds: ids }) : Promise.resolve([]),
    // 설문은 2026-10-22 뺐다 — "제출" = 학생이 낸 서류 (학생마다 처음 낸 때)
    Promise.all(programs.map(async (p) => submissionsOf(await repo.listMaterials(p.id)))),
    repo.listStudents(),
  ]);
  const name = new Map(students.map((s) => [s.id, s]));
  const title = new Map(programs.map((p) => [p.id, p.title]));

  // 제출률: 서류를 받는 열린 프로그램만 (전체 대상 중 서류를 낸 학생)
  const open = programs.map((p, i) => ({ p, submitted: responses[i].filter((r) => r.submittedAt && p.targetIds.includes(r.studentId)).length }))
    .filter(({ p }) => effectiveStatus(p, now) === "open" && usesDocs(p.source) && p.requestDocs);
  const targets = open.reduce((a, o) => a + o.p.targetIds.length, 0);
  const submittedAll = open.reduce((a, o) => a + o.submitted, 0);
  const rate = targets ? Math.round((100 * submittedAll) / targets) : null;
  const dueSoon = open.filter(({ p }) => daysLeft(p.endDate, now) <= 7).sort((a, b) => a.p.endDate.localeCompare(b.p.endDate));

  // 초안 상태
  const latest = new Map(jobs.map((j) => [j.id, latestVersion(versions, j.id)]));
  const failed = jobs.filter((j) => j.state === "ERROR" && !latest.get(j.id));
  const pending = jobs.filter((j) => reviewStatus(j, latest.get(j.id)) === "검토 대기");
  const newToday = pending.filter((j) => latest.get(j.id)?.createdAt.slice(0, 10) === now).length;
  const pendingNames = [...new Set(pending.map((j) => name.get(j.studentId)?.name).filter((n): n is string => !!n))];

  // 이번 주 제출 (월~일)
  const mon = weekStart(new Date());
  const week = DAYS.map((_, i) => addDays(mon, i));
  const weekCount = week.map((d) => responses.flat().filter((r) => r.submittedAt?.slice(0, 10) === d).length);
  const weekTotal = weekCount.reduce((a, b) => a + b, 0);
  const weekMax = Math.max(1, ...weekCount);

  // 생기부 진행 현황
  const totalTargets = programs.reduce((a, p) => a + p.targetIds.length, 0);
  const collected = programs.reduce((a, p, i) => a + responses[i].filter((r) => r.submittedAt && p.targetIds.includes(r.studentId)).length, 0);
  const generated = jobs.filter((j) => latest.get(j.id)).length;
  const checked = jobs.filter((j) => j.state === "DONE" && latest.get(j.id)).length;
  const finalized = jobs.filter((j) => latest.get(j.id)?.status === "finalized");
  const exportable = new Set(finalized.map((j) => j.programId)).size;
  const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

  const assigned = await loadAssigned(v);
  const counsel = await loadCounsel(v, assigned);
  const noCounsel = counselStats(assigned.map((s) => s.id), counsel).none;
  const rule = briefingRule({
    failed: failed.length, waiting, noCounsel,
    dueSoon: dueSoon.map(({ p, submitted }) => ({ id: p.id, title: p.title, dday: ddayLabel(p.endDate, now), missing: p.targetIds.length - submitted })),
  });
  const firstDue = dueSoon[0];
  const firstFail = failed[0];

  const steps: { icon: typeof Users; label: string; short: string; value: number; unit: string; line: string; todo?: number }[] = [
    { icon: Users, label: "서류 수집", short: "제출", value: collected, unit: "명", line: `${totalTargets}명 중` },
    { icon: Sparkles, label: "초안 생성", short: "초안", value: generated, unit: "건", line: `제출 대비 ${pct(generated, collected)}%` },
    { icon: Shield, label: "자동 검사", short: "검사", value: checked, unit: "건", line: `통과율 ${pct(checked, generated)}%` },
    { icon: Check, label: "교사 확정", short: "확정", value: finalized.length, unit: "건", line: "", todo: waiting },
    { icon: Send, label: "담임 전달", short: "전달", value: exportable, unit: "개", line: "내보낼 프로그램" },
  ];

  return (
    <>
      <NewsPopup />
      <PageHeader
        eyebrow={todayLabel()}
        title={greeting(`${v.teacher.name} 선생님`)}
        actions={<span className="hidden md:block"><ButtonLink href="/teacher/programs/new" kind="outline" size="sm"><Plus size={16} /> 프로그램 등록</ButtonLink></span>}
      />
      <PageBody>
        <TodayBriefing line={rule[0]?.text ?? "오늘 먼저 볼 일이 없어요"} first={rule[0] ?? null} aiOn={aiEnabled()} />

        <div className="grid grid-cols-2 gap-3 [grid-template-areas:'hero_hero'_'ring_due'_'fail_fail'_'pipe_pipe'] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px] md:gap-5 md:[grid-template-areas:'hero_hero_ring'_'week_due_fail'_'pipe_pipe_counsel']">
          {/* 오늘의 할 일 */}
          <section className="relative overflow-hidden surface rounded-card p-5 [grid-area:hero] md:px-9 md:py-8">
            <span className="hidden rounded-chip bg-white px-3 py-1.5 text-[13px] font-bold md:inline-block">오늘의 할 일</span>
            <div className="text-[15px] text-sub md:mt-4 md:text-lg">검토 대기 초안</div>
            <div className="mt-2 flex items-baseline gap-2 md:mt-3">
              <span className="text-[56px] font-bold leading-none text-key md:text-[88px]">{waiting}</span>
              <span className="text-xl font-bold text-sub md:text-[28px]">건</span>
            </div>
            <div className="mt-4 flex min-w-0 items-center gap-2.5 pr-28 text-[14px] text-sub md:mt-6 md:pr-48">
              {pendingNames.length > 0 && (
                <span className="hidden shrink-0 items-center gap-1 rounded-chip bg-white px-2 py-1 text-[13px] font-bold md:inline-flex">
                  {pendingNames.slice(0, 3).map((n) => <span key={n} className="w-4 text-center">{n.slice(0, 1)}</span>)}
                </span>
              )}
              <span className="truncate">
                <span className="hidden md:inline">{pendingNames.length ? `${pendingNames.slice(0, 2).join(", ")}${pendingNames.length > 2 ? ` 외 ${pendingNames.length - 2}명` : ""} · ` : ""}</span>
                오늘 새로 {newToday}건
              </span>
            </div>
            <div className="mt-4 flex gap-2.5 md:mt-5">
              <ButtonLink href="/teacher/drafts"><FileText size={18} /> 지금 검토하기</ButtonLink>
              <span className="hidden md:block"><ButtonLink href="/teacher/drafts" kind="outline">목록 보기</ButtonLink></span>
            </div>
            <Image src="/char-stand.png" alt="" width={190} height={230} className="pointer-events-none absolute bottom-4 right-4 h-auto w-[100px] md:bottom-3 md:right-10 md:w-[150px]" />
          </section>

          {/* 평균 제출률 */}
          <section className="flex flex-col surface rounded-card p-4 [grid-area:ring] md:p-6">
            <h2 className="text-[13px] text-mute md:text-lg md:font-bold md:text-ink">평균 제출률</h2>
            <div className="mt-3 flex flex-1 flex-col items-center justify-center md:mt-0">
              <span className="md:hidden"><Ring pct={rate ?? 0} size={92} /></span>
              <span className="relative hidden md:block">
                <BigRing pct={rate ?? 0} />
                <span className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[36px] font-bold leading-none">{rate === null ? "–" : `${rate}%`}</span>
                  <span className="mt-1.5 text-[12px] text-mute">{targets}명 중 {submittedAll}명</span>
                </span>
              </span>
              <span className="mt-4 hidden items-center gap-2 text-[13px] text-mute md:flex">
                <span className="rounded-chip bg-white px-2.5 py-1 font-bold text-sub">프로그램 {open.length}개</span> 열린 서류 제출 기준
              </span>
            </div>
          </section>

          {/* 이번 주 제출 (PC) */}
          <section className="hidden flex-col surface rounded-card p-6 [grid-area:week] md:flex">
            <div className="flex items-center">
              <h2 className="flex-1 text-lg font-bold">이번 주 제출</h2>
              <span className="text-[13px] text-mute">{md(mon)} – {md(addDays(mon, 6))}</span>
            </div>
            <div className="mt-3 flex items-baseline gap-1"><span className="text-[36px] font-bold leading-none">{weekTotal}</span><span className="text-[15px] font-medium text-sub">명</span></div>
            <div className="mt-auto grid grid-cols-7 items-end gap-2.5 pt-5">
              {weekCount.map((c, i) => (
                <div key={DAYS[i]} className="flex flex-col items-center gap-2">
                  <div className="flex h-24 w-full items-end">
                    <div className={cx("w-full rounded-[6px]", week[i] === now ? "bg-key" : "bg-white")} style={{ height: `${Math.max(6, (c / weekMax) * 100)}%` }} title={`${c}명`} />
                  </div>
                  <span className={cx("text-[12px]", week[i] === now ? "font-bold text-ink" : "text-mute")}>{DAYS[i]}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 마감 임박 */}
          <section className="flex flex-col surface rounded-card p-4 [grid-area:due] md:p-6">
            <h2 className="text-[13px] text-mute md:text-lg md:font-bold md:text-ink">마감 임박</h2>
            {firstDue ? (
              <>
                <div className="mt-2 md:mt-3 md:flex md:items-center md:gap-3">
                  <span className="block text-[30px] font-bold leading-none md:text-[36px]">{ddayLabel(firstDue.p.endDate, now)}</span>
                  <Link href={`/teacher/programs/${firstDue.p.id}`} className="mt-2 block min-w-0 md:mt-0">
                    <span className="block truncate text-[15px] font-bold">{firstDue.p.title}</span>
                    <span className="block truncate text-[13px] text-mute">미제출 {firstDue.p.targetIds.length - firstDue.submitted}명<span className="hidden md:inline"> · {md(firstDue.p.endDate)} 마감</span></span>
                  </Link>
                </div>
                <div className="mt-4 hidden h-1.5 overflow-hidden rounded-full bg-white md:block" aria-hidden>
                  <div className="h-full rounded-full bg-sub/60" style={{ width: `${pct(firstDue.submitted, firstDue.p.targetIds.length)}%` }} />
                </div>
                {dueSoon[1] && (
                  <Link href={`/teacher/programs/${dueSoon[1].p.id}`} className="mt-3 hidden items-center gap-4 rounded-inner bg-white px-4 py-3 text-[13px] text-sub md:flex">
                    <span className="font-bold text-ink">{ddayLabel(dueSoon[1].p.endDate, now)}</span>
                    <span className="truncate">{dueSoon[1].p.title} · 미제출 {dueSoon[1].p.targetIds.length - dueSoon[1].submitted}명</span>
                  </Link>
                )}
                <div className="mt-auto hidden pt-3 md:block"><ButtonLink href={`/teacher/programs/${firstDue.p.id}#remind`} kind="outline" size="sm" className="w-full"><Send size={15} /> 미제출자에게 알림 보내기</ButtonLink></div>
              </>
            ) : (
              <p className="flex flex-1 items-center justify-center py-4 text-sm text-mute">이번 주 마감이 없어요</p>
            )}
          </section>

          {/* 초안 생성 실패 */}
          <section className="surface rounded-card [grid-area:fail]">
            {firstFail ? (
              <>
                <Link href={`/teacher/drafts?d=${firstFail.id}`} className="flex items-center gap-3 p-4 md:hidden">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-field bg-key text-white"><AlertCircle size={20} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold">초안 생성 실패 {failed.length}건</span>
                    <span className="block truncate text-[13px] text-sub">{name.get(firstFail.studentId)?.name ?? "학생"} · 직접 작성 필요</span>
                  </span>
                  <ChevronRight size={18} className="text-mute" />
                </Link>
                <div className="hidden h-full flex-col p-6 md:flex">
                  <span className="flex size-10 items-center justify-center rounded-field bg-key text-white"><AlertCircle size={20} /></span>
                  <h2 className="mt-4 text-lg font-bold">초안 생성 실패 {failed.length}건</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-sub">
                    {name.get(firstFail.studentId)?.name ?? "학생"} · {title.get(firstFail.programId) ?? ""}<br />
                    자동 재시도 {firstFail.attempts}회 후에도 기준을 통과하지 못했어요.
                  </p>
                  <ButtonLink href={`/teacher/drafts?d=${firstFail.id}`} kind="soft" className="mt-auto w-full">직접 작성하기</ButtonLink>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center gap-3 p-4 md:flex-col md:items-start md:p-6">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-field bg-ok-soft text-ok"><Check size={20} /></span>
                <span className="text-[15px] font-bold md:mt-4 md:text-lg">초안 생성 실패 없음</span>
              </div>
            )}
          </section>

          {/* 생기부 진행 현황 */}
          <section className="surface rounded-card p-4 [grid-area:pipe] md:p-6">
            <div className="mb-3 flex items-center md:mb-4">
              <h2 className="flex-1 text-[17px] font-bold md:text-lg">생기부 진행 현황</h2>
              <Link href="/teacher/programs" className="hidden text-[13px] text-mute md:inline">자세히 ›</Link>
            </div>
            <div className="grid grid-cols-5 gap-1.5 md:gap-3">
              {steps.map((s) => {
                const on = s.todo !== undefined;
                const Icon = s.icon;
                return (
                  <div key={s.label} className={cx("min-w-0 rounded-inner px-2 py-2.5 md:p-4", on ? "bg-key text-white" : "bg-white")}>
                    <div className={cx("flex items-center gap-1.5 text-[12px] md:text-[13px]", on ? "text-white/85" : "text-sub")}>
                      <Icon size={14} className="hidden md:block" /><span className="md:hidden">{s.short}</span><span className="hidden md:inline">{s.label}</span>
                    </div>
                    <div className="mt-1 whitespace-nowrap md:mt-3"><span className="text-[18px] font-bold md:text-[26px]">{s.value}</span><span className={cx("ml-0.5 text-[12px] md:text-[13px]", on ? "text-white/85" : "text-sub")}>{s.unit}</span></div>
                    <div className="mt-1 hidden md:block">
                      {on ? <span className="rounded-chip bg-white px-2 py-0.5 text-[11px] font-bold text-key-strong">할 일 {s.todo}건</span> : <span className="text-[12px] text-mute">{s.line}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 최근 상담 기록 (PC) */}
          <section className="hidden flex-col surface rounded-card p-6 [grid-area:counsel] md:flex">
            <div className="mb-3 flex items-center">
              <h2 className="flex-1 text-lg font-bold">최근 상담 기록</h2>
              <Link href="/teacher/counseling" className="text-[13px] text-mute">전체 ›</Link>
            </div>
            {counsel.length === 0 ? (
              <p className="flex flex-1 items-center justify-center text-sm text-mute">아직 상담 기록이 없어요</p>
            ) : (
              <ul className="flex flex-col gap-3.5">
                {counsel.slice(0, 2).map((r) => {
                  const s = name.get(r.studentId);
                  return (
                    <li key={r.id} className="flex gap-3">
                      <Avatar name={s?.name ?? "?"} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-bold">{s?.name ?? "학생"} <span className="ml-1 text-[12px] font-normal text-mute">{md(r.date)} · {r.area}</span></div>
                        <p className="mt-0.5 line-clamp-2 text-[13px] text-sub">{r.content}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-auto flex items-center gap-1.5 pt-3 text-[12px] text-mute"><Shield size={13} /> 볼 수 있는 기록만 보여요</p>
          </section>
        </div>
        <SchoolInfoRow today={seoulNow().date} />
      </PageBody>
    </>
  );
}

/** PC 제출률 큰 고리 (글자는 위에 겹친다) */
function BigRing({ pct }: { pct: number }) {
  const size = 168;
  const r = (size - 22) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f2f4f6" strokeWidth={20} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#536dfe" strokeWidth={20}
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}
