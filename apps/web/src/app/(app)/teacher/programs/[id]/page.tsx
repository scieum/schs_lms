import Link from "next/link";
import { ChevronRight, ClipboardList, Download, Pencil, Search, Upload } from "lucide-react";
import { Bar } from "@/components/programs/meters";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Avatar, Button, ButtonLink, Card, Tag, cx } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { AREA_LABEL, ddayLabel, effectiveStatus, md, responseRate, usesDocs, usesSurvey } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { programRows, requireProgram, type StudentRow } from "../_lib/data";
import { remindOne } from "./actions";
import { isAdmin } from "@/lib/domain/policy";
import { DeleteBox } from "./delete-box";
import { AnalyzeBox, AutoSelect } from "./parts";
import { NextActions, RemindSheet, StageStepper } from "./stage";
import { StudentRowItem } from "./student-popup";
import { RosterUpload } from "./roster-upload";
import { programStage } from "@/lib/domain/program-stage";

export const metadata = { title: "프로그램 상세 · 속초고등학교 학생관리시스템" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; cls?: string; q?: string; src?: string; st?: string; page?: string; remind?: string }> };

// 학생별 현황 거르기: 받는 중·마감에는 응답 기준, 초안부터는 초안 기준 (Figma N16)
const TABS_EARLY = [["all", "전체"], ["missing", "미응답"], ["resp", "응답"], ["reason", "사유"]] as const;
const TABS_LATE = [["all", "전체"], ["review", "검토 대기"], ["running", "만드는 중"], ["failed", "실패"]] as const;
type TabKey = (typeof TABS_EARLY)[number][0] | (typeof TABS_LATE)[number][0];
const PER_PAGE = 10;

/** 초안 상태 이름 (태그·거르기 공통) */
function statusName(r: StudentRow): string {
  if (!r.hasEvidence) return r.missingReason ? "사유 있음" : "미제출";
  if (r.review === "검토 대기") return "생성 완료";
  if (r.review === "대기") return "초안 전";
  return r.review;
}

function statusTag(r: StudentRow) {
  const n = statusName(r);
  if (n === "사유 있음" || n === "초안 전") return <Tag tone="bg-white text-mute">{n}</Tag>;
  if (n === "미제출") return <Tag tone="bg-bad-soft text-bad">{n}</Tag>;
  return <Tag>{n}</Tag>;
}

const pair = (o: string): [string, string] => [o, o];

/** 프로그램 상세 (Figma N16 285:4342 Mobile · 286:4325 PC): 단계 카드 + 지금 할 일 하나 → 학생별 현황 → 근거 자료 → 관리 */
export default async function ProgramDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const { v, program: p } = await requireProgram(id);
  const canDelete = v.kind === "teacher" && (p.ownerId === v.accountId || isAdmin(v));
  const t = today();
  const [{ rows, materials, responses }, reminders] = await Promise.all([programRows(p), repo.listReminders({ programId: p.id })]);
  const status = effectiveStatus(p, t);
  const survey = usesSurvey(p.source);
  const docs = usesDocs(p.source);

  const submitted = responses.filter((r) => r.submittedAt && p.targetIds.includes(r.studentId)).length;
  const withDocs = rows.filter((r) => r.materials.length > 0).length;
  const withEvidence = rows.filter((r) => r.hasEvidence).length;
  const missing = rows.filter((r) => !r.hasEvidence && !r.missingReason);
  const count = (s: string) => rows.filter((r) => r.review === s).length;
  const ready = rows.filter((r) => r.hasEvidence && (!r.job || r.job.state === "PENDING")).length;
  const failed = rows.filter((r) => r.review === "생성 실패");

  const classes = [...new Set(rows.map((r) => `${r.student.grade}-${r.student.classNo}`))].sort();
  const stage = programStage({
    status, targets: rows.length, evidence: withEvidence, ready,
    running: count("생성 중"), failed: failed.length, review: count("검토 대기"), confirmed: count("확정"),
  }, ddayLabel(p.endDate, t));
  const TABS = stage.index >= 2 ? TABS_LATE : TABS_EARLY;
  const tab: TabKey = (TABS as readonly (readonly [string, string])[]).some(([k]) => k === q.tab) ? (q.tab as TabKey) : "all";
  const stagePct = stage.index <= 1 ? responseRate(rows.length, withEvidence) : stage.index === 2 ? responseRate(withEvidence, count("검토 대기") + count("확정")) : responseRate(Math.max(1, withEvidence), count("확정"));
  const term = (q.q ?? "").trim();
  const shown = rows.filter((r) => {
    if (tab === "resp" && !r.hasEvidence) return false;
    if (tab === "missing" && (r.hasEvidence || r.missingReason)) return false;
    if (tab === "reason" && (r.hasEvidence || !r.missingReason)) return false;
    if (tab === "review" && r.review !== "검토 대기") return false;
    if (tab === "running" && r.review !== "생성 중") return false;
    if (tab === "failed" && r.review !== "생성 실패") return false;
    if (q.cls && `${r.student.grade}-${r.student.classNo}` !== q.cls) return false;
    if (q.src && r.evidenceLabel !== q.src) return false;
    if (q.st && statusName(r) !== q.st) return false;
    if (term && !r.student.name.includes(term)) return false;
    return true;
  });
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(q.page) || 1));
  const paged = shown.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const tabCount: Record<TabKey, number> = {
    all: rows.length, resp: withEvidence, missing: missing.length, reason: rows.filter((r) => !r.hasEvidence && r.missingReason).length,
    review: count("검토 대기"), running: count("생성 중"), failed: failed.length,
  };
  const ctx = { programId: p.id, missing: status === "open" ? missing.length : 0, aiOn: aiEnabled(), last: null as string | null };
  const qs = (over: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const all: Record<string, string | undefined> = { tab, cls: q.cls, src: q.src, st: q.st, q: term || undefined, ...over };
    for (const [k, v] of Object.entries(all)) if (v) u.set(k, v);
    return `/teacher/programs/${p.id}?${u.toString()}#status`;
  };
  ctx.last = reminders[0] ? new Date(reminders[0].createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  const bundles = materials.filter((m) => m.status === "bundle").length;
  const needs = materials.filter((m) => m.status === "needs_review").length;

  const chip = "whitespace-nowrap rounded-chip border border-line bg-[#fff] px-2 py-0.5 text-[12px] text-sub";
  return (
    <>
      <PageHeader
        title={p.title}
        actions={
          <>
            <ButtonLink href={`/teacher/programs/${p.id}/edit`} kind="outline" size="sm" className="hidden md:inline-flex"><Pencil size={14} /> 수정</ButtonLink>
            <Link href={`/teacher/programs/${p.id}/edit`} aria-label="수정" className="p-1 text-sub md:hidden"><Pencil size={20} /></Link>
          </>
        }
      />
      <PageBody>
        <div className="-mt-3 flex flex-wrap items-center gap-1.5 md:-mt-6">
          <span className={chip}>{AREA_LABEL[p.area]}{p.subject ? ` · ${p.subject}` : ""}</span>
          <span className={cx(chip, "hidden md:inline")}>{md(p.startDate)} – {md(p.endDate)}</span>
          <span className={chip}>대상 {rows.length}명</span>
          {p.coOwnerIds.length > 0 && <span className={cx(chip, "hidden md:inline")}>담당 {1 + p.coOwnerIds.length}명</span>}
          {status === "draft" ? <Tag>임시 저장</Tag> : status === "closed" ? <Tag tone="bg-soft text-mute">마감</Tag> : <Tag>{ddayLabel(p.endDate, t)}</Tag>}
        </div>

        {/* 단계 카드: 지금 어디인지 + (PC) 지금 할 일 */}
        <section className="surface flex flex-col gap-4 rounded-card p-4 md:p-6">
          <StageStepper stage={stage} pct={stagePct} actions={<NextActions stage={stage} ctx={ctx} />} />
        </section>
        {/* 모바일: 탭바 바로 위 고정 버튼 */}
        <NextActions stage={stage} ctx={ctx} mobile />
        {q.remind === "1" && ctx.missing > 0 && <RemindSheet ctx={ctx} />}

        <div id="status" className="scroll-mt-6" />
        <div className="grid grid-cols-1 items-start gap-4 pb-24 md:grid-cols-[1fr_360px] md:gap-6 md:pb-0 [&>*]:min-w-0">
        <Card
          title="학생별 현황"
          action={
            <>
              <a href={`/teacher/programs/${p.id}/export`} download className="hidden items-center gap-1 text-[13px] font-medium text-sub md:mr-1 md:inline-flex"><Download size={14} /> 엑셀 내보내기</a>
              {/* 명단 업로드 (Figma N36): 명단_양식.xlsx 로 대상 더하기·바꾸기 */}
              <RosterUpload programId={p.id} />
            </>
          }
        >
          <nav className="-mx-1 -mt-1 mb-3 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]">
            {TABS.map(([k, label]) => (
              <Link key={k} href={qs({ tab: k, page: undefined })} aria-current={tab === k ? "page" : undefined}
                className={cx("shrink-0 whitespace-nowrap rounded-control px-3 py-1.5 text-[13px]", tab === k ? "bg-key-soft font-bold text-key-strong" : "border border-hair bg-[#fff] text-sub")}>
                {label} <span className={tab === k ? "" : "text-mute"}>{tabCount[k as TabKey]}</span>
              </Link>
            ))}
          </nav>
          <form className="mb-3 flex flex-wrap gap-2" action={`/teacher/programs/${p.id}#status`}>
            <input type="hidden" name="tab" value={tab} />
            <div className="hidden gap-2 md:flex">
              <AutoSelect name="cls" value={q.cls ?? ""} label="반" options={[["", "반: 전체"], ...classes.map((c): [string, string] => [c, `${c.replace("-", "학년 ")}반`])]} />
              <AutoSelect name="src" value={q.src ?? ""} label="자료" options={[["", "자료: 전체"], ...[...new Set(rows.map((r) => r.evidenceLabel))].map(pair)]} />
              <AutoSelect name="st" value={q.st ?? ""} label="초안 상태" options={[["", "초안 상태: 전체"], ...[...new Set(rows.map(statusName))].map(pair)]} />
            </div>
            <label className="flex h-9 min-w-40 flex-1 items-center gap-2 rounded-field bg-white px-3 md:max-w-64 md:flex-none md:w-64">
              <Search size={15} className="text-mute" />
              <input name="q" defaultValue={term} placeholder="학생 이름 검색" className="w-full bg-transparent text-[13px] outline-none" />
            </label>
          </form>

          <div className="hidden grid-cols-[minmax(0,1fr)_88px_64px_88px_80px] items-center gap-3 rounded-inner bg-white px-4 py-2.5 text-[13px] text-mute md:grid">
            <span>학생</span><span className="text-center">근거 자료</span><span className="text-center">응답일</span><span className="text-center">상태</span><span />
          </div>
          {paged.length === 0 ? (
            <p className="py-8 text-center text-sm text-mute">해당하는 학생이 없어요</p>
          ) : (
            <ul>
              {paged.map((r, i) => {
                const s = r.student;
                const draftHref = r.job ? `/teacher/drafts?d=${r.job.id}` : null;
                return (
                  <StudentRowItem key={s.id} programId={p.id} student={{ id: s.id, name: s.name, sub: `${s.studentNo} · ${s.grade}학년 ${s.classNo}반 ${s.number}번` }}
                    className={cx("relative flex items-center gap-3 py-3.5 md:grid md:grid-cols-[minmax(0,1fr)_88px_64px_88px_80px] md:px-4", i < paged.length - 1 && "border-b border-line")}>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={s.name} size={36} />
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-medium">{s.name}</div>
                        <div className="truncate text-[12px] text-mute">{s.grade}학년 {s.classNo}반 {s.number}번<span className="md:hidden"> · {r.evidenceLabel}</span>{r.missingReason ? ` · ${r.missingReason}` : ""}</div>
                      </div>
                    </div>
                    <span className="hidden text-center text-[13px] text-sub md:block">{r.evidenceLabel}</span>
                    <span className="hidden text-center text-[13px] text-sub md:block">{r.response?.submittedAt ? md(r.response.submittedAt.slice(0, 10)) : "—"}</span>
                    <span className="md:flex md:justify-center">{statusTag(r)}</span>
                    <div className="hidden justify-end md:flex">
                      {r.review === "생성 실패" && draftHref ? (
                        <ButtonLink href={draftHref} size="sm" kind="soft" className="w-[76px] whitespace-nowrap px-0">직접 작성</ButtonLink>
                      ) : draftHref && r.latest ? (
                        <ButtonLink href={draftHref} size="sm" kind="outline" className="w-[76px] px-0">보기</ButtonLink>
                      ) : !r.hasEvidence && !r.missingReason && status === "open" ? (
                        <form action={remindOne}>
                          <input type="hidden" name="programId" value={p.id} />
                          <input type="hidden" name="studentId" value={s.id} />
                          <Button size="sm" kind="outline" className="w-[76px] px-0">알림</Button>
                        </form>
                      ) : null}
                    </div>
                  </StudentRowItem>
                );
              })}
            </ul>
          )}
          {pages > 1 && (
            <nav className="mt-4 flex items-center justify-center gap-1 text-[13px]" aria-label="쪽 넘기기">
              {page > 1 && <Link href={qs({ page: String(page - 1) })} className="px-2 py-1 text-mute" aria-label="앞 쪽">‹</Link>}
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <Link key={n} href={qs({ page: String(n) })} aria-current={n === page ? "page" : undefined}
                  className={cx("flex size-8 items-center justify-center rounded-full", n === page ? "bg-key font-bold text-white" : "text-sub hover:bg-white")}>{n}</Link>
              ))}
              {page < pages && <Link href={qs({ page: String(page + 1) })} className="px-2 py-1 text-mute" aria-label="다음 쪽">›</Link>}
            </nav>
          )}
        </Card>

        <div className="flex flex-col gap-4 md:gap-6">
          <Card title="근거 자료" action={<Link href={`/teacher/programs/${p.id}/materials`} className="whitespace-nowrap text-[13px] font-medium text-sub">자료 관리 ›</Link>}>
            <div className="flex flex-col gap-2.5">
              {survey && (
                <div className="flex flex-col gap-2 rounded-inner bg-bg p-3.5">
                  <div className="flex items-center gap-2.5"><ClipboardList size={16} className="text-sub" /><span className="flex-1"><b className="block text-[15px]">설문 응답</b><span className="text-[12px] text-mute">문항 {p.questions.length}개</span></span><b className="tabular-nums">{submitted}/{rows.length}</b></div>
                  <Bar pct={responseRate(rows.length, submitted)} />
                </div>
              )}
              {docs && (
                <div className="flex flex-col gap-2 rounded-inner bg-bg p-3.5">
                  <div className="flex items-center gap-2.5"><Upload size={16} className="text-sub" /><span className="flex-1"><b className="block text-[15px]">학생 제출 서류</b><span className="text-[12px] text-mute">파일 {materials.length}개{bundles ? ` · 나누기 ${bundles}` : ""}{needs ? ` · 지정 필요 ${needs}` : ""}</span></span><b className="tabular-nums">{withDocs}/{rows.length}</b></div>
                  <Bar pct={responseRate(rows.length, withDocs)} />
                </div>
              )}
              {docs && <ButtonLink href={`/teacher/programs/${p.id}/materials`} kind="soft" size="sm" className="w-full"><Upload size={14} /> 서류 올리기</ButtonLink>}
            </div>
          </Card>
          {survey && submitted > 0 && <AnalyzeBox programId={p.id} submitted={submitted} aiOn={aiEnabled()} />}
          <section className="surface rounded-card px-5 py-4">
            <h3 className="pb-1 text-[12px] font-bold text-mute">관리</h3>
            {[
              [`/teacher/programs/${p.id}/edit`, <Pencil key="i" size={16} />, "프로그램 수정"],
              [`/teacher/programs/${p.id}/export`, <Download key="i" size={16} />, "엑셀 내보내기"],
            ].map(([href, icon, label]) => (
              <Link key={label as string} href={href as string} className="flex h-11 items-center gap-2.5 text-[14px] text-ink">
                <span className="text-sub">{icon}</span><span className="flex-1">{label}</span><ChevronRight size={16} className="text-faint" />
              </Link>
            ))}
            {canDelete && <DeleteBox programId={p.id} title={p.title} counts={`응답 ${responses.length}건 · 서류 ${materials.length}개 · 초안`} />}
          </section>
        </div>
        </div>
      </PageBody>
    </>
  );
}
