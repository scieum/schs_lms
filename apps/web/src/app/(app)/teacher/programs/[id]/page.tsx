import Link from "next/link";
import { ClipboardList, Download, Pencil, FileText, Search, Send, Upload } from "lucide-react";
import { Bar, Ring } from "@/components/programs/meters";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Avatar, Button, ButtonLink, Card, Tag, cx } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { AREA_LABEL, ddayLabel, effectiveStatus, md, responseRate, usesDocs, usesSurvey } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { programRows, requireProgram, type StudentRow } from "../_lib/data";
import { remindOne, setProgramStatus } from "./actions";
import { AnalyzeBox, AutoSelect, GenerateButton, RemindBox } from "./parts";

export const metadata = { title: "프로그램 상세 · 속초고등학교 학생관리시스템" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; cls?: string; q?: string; src?: string; st?: string; page?: string }> };

const TABS = [["all", "전체"], ["resp", "응답"], ["missing", "미제출"], ["failed", "생성 실패"]] as const;
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

/** T2 프로그램 상세 (Figma 45:1636 PC · 45:1963 Mobile) */
export default async function ProgramDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const { program: p } = await requireProgram(id);
  const t = today();
  const [{ rows, materials, responses }, reminders] = await Promise.all([programRows(p), repo.listReminders({ programId: p.id })]);
  const status = effectiveStatus(p, t);
  const survey = usesSurvey(p.source);
  const docs = usesDocs(p.source);

  const submitted = responses.filter((r) => r.submittedAt && p.targetIds.includes(r.studentId)).length;
  const withDocs = rows.filter((r) => r.materials.length > 0).length;
  const withEvidence = rows.filter((r) => r.hasEvidence).length;
  const rate = responseRate(rows.length, survey ? submitted : withEvidence);
  const missing = rows.filter((r) => !r.hasEvidence && !r.missingReason);
  const count = (s: string) => rows.filter((r) => r.review === s).length;
  const ready = rows.filter((r) => r.hasEvidence && (!r.job || r.job.state === "PENDING")).length;
  const failed = rows.filter((r) => r.review === "생성 실패");

  const classes = [...new Set(rows.map((r) => `${r.student.grade}-${r.student.classNo}`))].sort();
  const tab = TABS.some(([k]) => k === q.tab) ? q.tab! : "all";
  const term = (q.q ?? "").trim();
  const shown = rows.filter((r) => {
    if (tab === "resp" && !r.hasEvidence) return false;
    if (tab === "missing" && r.hasEvidence) return false;
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
  const tabCount = { all: rows.length, resp: withEvidence, missing: rows.length - withEvidence, failed: failed.length };
  const qs = (over: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const all: Record<string, string | undefined> = { tab, cls: q.cls, src: q.src, st: q.st, q: term || undefined, ...over };
    for (const [k, v] of Object.entries(all)) if (v) u.set(k, v);
    return `/teacher/programs/${p.id}?${u.toString()}#status`;
  };
  const lastReminder = reminders[0] ? new Date(reminders[0].createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  const bundles = materials.filter((m) => m.status === "bundle").length;
  const needs = materials.filter((m) => m.status === "needs_review").length;
  const qLabel = (i: number) => (p.questions[i].fixed ? `${p.questions[i].title} — ${p.questions[i].prompt}` : p.questions[i].prompt);

  return (
    <>
      <PageHeader
        title={p.title}
        actions={
          <div className="hidden gap-2 md:flex">
            <ButtonLink href={`/teacher/programs/${p.id}/edit`} kind="outline" size="sm"><Pencil size={14} /> 수정</ButtonLink>
            <ButtonLink href={`/teacher/programs/${p.id}/materials`} kind="outline" size="sm"><ClipboardList size={14} /> 자료 관리</ButtonLink>
            <ButtonLink href={`/teacher/drafts?program=${p.id}`} size="sm"><FileText size={14} /> 초안 검토하기</ButtonLink>
          </div>
        }
      />
      <PageBody>
        <div className="-mt-3 flex flex-wrap items-center gap-1.5 text-[13px] text-mute md:-mt-6 md:text-sm md:text-sub">
          <span>{AREA_LABEL[p.area]}{p.subject ? ` ${p.subject}` : ""}<span className="hidden md:inline"> · {md(p.startDate)} ~ {md(p.endDate)}</span> · 대상 {rows.length}명</span>
          {status === "draft" ? <Tag>임시 저장</Tag> : status === "closed" ? <Tag tone="bg-soft text-mute">마감</Tag> : <Tag>{ddayLabel(p.endDate, t)}</Tag>}
          {p.coOwnerIds.length > 0 && <span>· 담당 {1 + p.coOwnerIds.length}명</span>}
          <ButtonLink href={`/teacher/programs/${p.id}/edit`} kind="outline" size="sm" className="ml-auto md:hidden"><Pencil size={14} /> 수정</ButtonLink>
        </div>

        {status === "draft" && (
          <form action={setProgramStatus} className="flex items-center gap-3 rounded-inner bg-wait-soft px-4 py-3">
            <input type="hidden" name="programId" value={p.id} />
            <input type="hidden" name="to" value="open" />
            <span className="flex-1 text-[14px] font-medium">아직 발행 전이에요. 발행하면 대상 학생 화면에 설문·제출이 열려요</span>
            <Button size="sm" disabled={rows.length === 0}>발행하기</Button>
          </form>
        )}

        {/* 숫자 타일 4개: 응답률 고리 · 미응답 · 초안 상태 목록 · 근거 자료 목록 */}
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
          <div className="flex flex-col surface rounded-card p-4 md:px-5 md:py-5">
            <div className="text-[13px] text-mute">{survey ? "응답률" : "제출률"}</div>
            <div className="mt-3 flex items-center gap-4">
              <Ring pct={rate} size={76} />
              <div className="hidden md:block">
                <div className="text-lg font-bold">{survey ? submitted : withEvidence} / {rows.length}명</div>
                <div className="text-[12px] text-mute">{survey ? "설문 제출" : "자료 제출"} 기준</div>
              </div>
            </div>
          </div>
          <div className="flex flex-col surface rounded-card p-4 md:px-5 md:py-5">
            <div className="text-[13px] text-mute">미응답</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-[28px] font-bold leading-tight md:text-[32px]">{missing.length}</span>
              <span className="text-[15px] font-medium text-sub">명 · {status === "open" ? ddayLabel(p.endDate, t) : status === "closed" ? "마감" : "발행 전"}</span>
            </div>
            <div className="mt-auto hidden pt-3 md:block"><ButtonLink href="#remind" kind="outline" size="sm" className="w-full"><Send size={14} /> 알림 보내기</ButtonLink></div>
          </div>
          <div className="flex flex-col surface rounded-card p-4 md:px-5 md:py-5">
            <div className="text-[13px] text-mute">초안 상태</div>
            <dl className="mt-2 flex flex-col gap-1.5 text-[13px] md:text-sm">
              <div className="flex"><dt className="flex-1 text-sub">생성 완료</dt><dd className="font-bold">{count("검토 대기") + count("확정") + count("반려")}건</dd></div>
              <div className="flex"><dt className="flex-1 text-sub">생성 중</dt><dd className="font-bold">{count("생성 중")}건</dd></div>
              <div className="flex"><dt className={cx("flex-1", failed.length ? "font-bold text-bad" : "text-sub")}>생성 실패</dt><dd className={cx("font-bold", failed.length > 0 && "text-bad")}>{failed.length}건</dd></div>
            </dl>
            <div className="mt-auto pt-3"><GenerateButton programId={p.id} ready={ready} disabled={status === "draft"} /></div>
          </div>
          <div className="flex flex-col surface rounded-card p-4 md:px-5 md:py-5">
            <div className="text-[13px] text-mute">근거 자료</div>
            <dl className="mt-2 flex flex-col gap-1.5 text-[13px] md:text-sm">
              {survey && <div className="flex"><dt className="flex-1 text-sub">설문 응답</dt><dd className="font-bold">{submitted}명</dd></div>}
              {docs && <div className="flex"><dt className="flex-1 text-sub">제출 서류</dt><dd className="font-bold">{withDocs}명</dd></div>}
            </dl>
            <Link href={`/teacher/programs/${p.id}/materials`} className="mt-auto hidden pt-3 text-[13px] font-medium text-sub md:block">자료 관리 ›</Link>
          </div>
        </div>

        <RemindBox programId={p.id} missing={status === "open" ? missing.length : 0} aiOn={aiEnabled()} last={lastReminder} />
        {survey && <AnalyzeBox programId={p.id} submitted={submitted} aiOn={aiEnabled()} />}

        <div id="status" className="scroll-mt-6" />
        <Card
          title="학생별 현황"
          action={<a href={`/teacher/programs/${p.id}/export`} download className="hidden items-center gap-1 text-[13px] font-medium text-sub md:inline-flex"><Download size={14} /> 엑셀 내보내기</a>}
        >
          <nav className="-mt-1 mb-3 flex gap-4 border-b border-line text-[14px]">
            {TABS.map(([k, label]) => (
              <Link key={k} href={qs({ tab: k, page: undefined })} aria-current={tab === k ? "page" : undefined}
                className={cx("-mb-px border-b-2 pb-2", tab === k ? "border-key font-bold text-ink" : "border-transparent text-mute", k === "failed" && "hidden md:block")}>
                {label} {tabCount[k]}
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

          <div className="hidden grid-cols-[minmax(0,1fr)_96px_72px_88px_168px_88px] items-center gap-3 rounded-inner bg-white px-4 py-2.5 text-[13px] text-mute md:grid">
            <span>학생</span><span className="text-center">근거 자료</span><span className="text-center">응답일</span><span className="text-center">초안 상태</span><span className="text-center">글자수</span><span />
          </div>
          {paged.length === 0 ? (
            <p className="py-8 text-center text-sm text-mute">해당하는 학생이 없어요</p>
          ) : (
            <ul>
              {paged.map((r, i) => {
                const s = r.student;
                const max = r.job?.max ?? p.max;
                const unit = (r.job?.unit ?? p.unit) === "bytes" ? "B" : "자";
                const draftHref = r.job ? `/teacher/drafts?d=${r.job.id}` : null;
                return (
                  <li key={s.id} className={cx("flex items-center gap-3 py-3.5 md:grid md:grid-cols-[minmax(0,1fr)_96px_72px_88px_168px_88px] md:px-4", i < paged.length - 1 && "border-b border-line")}>
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
                    <div className="hidden flex-col items-center md:flex">
                      {r.review === "생성 실패" ? (
                        <span className="text-[12px] font-medium text-bad">{r.job?.attempts ?? 3}회 재시도 실패</span>
                      ) : r.review === "생성 중" ? (
                        <span className="text-[12px] text-wait">생성 중</span>
                      ) : (
                        <span className="text-[12px] text-sub">{r.length !== null ? `${r.length.toLocaleString()} / ${max.toLocaleString()}${unit}` : "—"}</span>
                      )}
                      <Bar pct={r.length !== null ? (r.length / max) * 100 : r.review === "생성 중" ? 30 : 0} tone={r.review === "생성 중" ? "wait" : "key"} className="mt-1 w-28" />
                    </div>
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
                  </li>
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

        <Card title="초안 근거 자료" action={<Link href={`/teacher/programs/${p.id}/materials`} className="text-[13px] font-medium text-sub">자료 관리 ›</Link>}>
          <div className={cx("grid gap-3", survey && docs && "md:grid-cols-2")}>
            {survey && (
              <div className="flex flex-col gap-2.5 rounded-inner bg-white p-4">
                <div className="flex items-center gap-2 font-bold"><ClipboardList size={16} /> <span className="flex-1">설문 응답</span><span>{submitted} / {rows.length}명</span></div>
                <Bar pct={responseRate(rows.length, submitted)} />
                <ol className="hidden flex-col gap-1.5 text-[13px] text-sub md:flex">
                  {p.questions.map((qq, i) => <li key={qq.id}>{i + 1}. {qLabel(i)}</li>)}
                </ol>
                {p.questions.length > 0 && (
                  <div className="flex flex-col gap-1.5 text-[13px] text-sub md:hidden">
                    <span>1. {qLabel(0)}</span>
                    {p.questions.length > 1 && (
                      <span>{p.questions.slice(1, 4).map((qq, i) => `${i + 2}. ${qq.fixed ? qq.title : qq.prompt.slice(0, 10)}`).join(" · ")}{p.questions.length > 4 ? ` 외 ${p.questions.length - 4}문항` : ""}</span>
                    )}
                  </div>
                )}
              </div>
            )}
            {docs && (
              <div className="flex flex-col gap-2.5 rounded-inner bg-white p-4">
                <div className="flex items-center gap-2 font-bold"><Upload size={16} /> <span className="flex-1">학생 제출 서류</span><span>{withDocs} / {rows.length}명</span></div>
                <Bar pct={responseRate(rows.length, withDocs)} />
                <ul className="flex flex-col gap-1.5 text-[13px] text-sub">
                  <li>올린 파일 {materials.length}개{p.docKinds.length ? ` · ${p.docKinds.join("·")}` : ""}</li>
                  {bundles > 0 && <li>합본 PDF {bundles}개 → 나누기 전</li>}
                  {needs > 0 && <li className="text-wait">학생 지정이 필요한 파일 {needs}개</li>}
                  <li>미제출 {rows.length - withDocs}명{rows.length - withDocs > 0 ? ` · ${rows.filter((r) => !r.materials.length).slice(0, 3).map((r) => r.student.name).join(", ")}${rows.length - withDocs > 3 ? " 외" : ""}` : ""}</li>
                </ul>
                <ButtonLink href={`/teacher/programs/${p.id}/materials`} kind="outline" size="sm" className="self-start"><Upload size={14} /> 서류 올리기</ButtonLink>
              </div>
            )}
          </div>
        </Card>

        {status === "open" && (
          <form action={setProgramStatus} className="flex justify-end">
            <input type="hidden" name="programId" value={p.id} />
            <input type="hidden" name="to" value="closed" />
            <Button size="sm" kind="ghost">지금 마감하기</Button>
          </form>
        )}
      </PageBody>
    </>
  );
}
