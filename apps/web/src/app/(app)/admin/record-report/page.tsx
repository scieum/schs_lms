import type { ReactNode } from "react";
import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { IssuePill, LockNote, Meter, N39Head, SummaryCard } from "@/components/admin/n39";
import { ButtonLink, cx } from "@/components/ui";
import {
  AREA_PARAM, AREA_TAB, ISSUE_KEYS, ISSUE_LABEL, issueChips, pct, progressTone, readArea, type ClassRow, type Counts, type GroupRow, type ReportAreaFilter,
} from "@/lib/domain/record-report";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { GradeSelect, PrintFrame } from "./controls";
import { listHref, loadReport, type ReportData } from "./load";

export const metadata = { title: "학생부 점검 보고서 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ grade?: string; area?: string; print?: string; all?: string }> };

const AREAS: ReportAreaFilter[] = ["all", "세특", "자율·자치", "동아리", "진로", "행발", "프로그램 초안"];
const kst = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...o }).format(d);
const atLabel = (d: Date) => `${kst(d, { month: "numeric", day: "numeric" }).replace(/\.\s?/g, ".").replace(/\.$/, "")} ${kst(d, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
const fullAt = (d: Date) => `${kst(d, { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\.\s?/g, "-").replace(/-$/, "")} ${kst(d, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
const toneBar = (p: number) => progressTone(p);

// 학생부 점검 보고서 (Figma N39 d PC 471:25124 · M 473:24769 · 인쇄 미리보기 e 472:9085). 관리자만, 건수만.
export default async function RecordReportPage({ searchParams }: Props) {
  const v = await requireCan("report.view");
  const q = await searchParams;
  const area = readArea(q.area);
  const d = await loadReport(q.grade, area);
  const qs = (p: Record<string, string>) => `/admin/record-report?${new URLSearchParams({ grade: String(d.grade), area: d.areaParam, ...p })}`;
  const line = `${d.year}학년도 ${d.semester}학기 · ${atLabel(d.at)} 기준`;

  if (q.print === "1") {
    await repo.audit(v.accountId, "record_report.print", JSON.stringify({ grade: d.grade, area: d.areaParam, rows: d.summary.total }));
    const me = v.kind === "teacher" ? v.teacher.name : "";
    return (
      <PrintFrame back={qs({})} title="인쇄용 보고서 미리보기" line="A4 세로 · 2쪽 · 흑백으로 인쇄해도 읽히게">
        <PrintPages d={d} me={me} />
      </PrintFrame>
    );
  }

  const s = d.summary;
  const rows: (ClassRow | GroupRow)[] = area === "세특" ? d.groups : d.classes;
  const sortedClasses = [...d.classes].filter((c) => c.counts.total).sort((a, b) => a.counts.progress - b.counts.progress);
  const shownCards = q.all === "1" ? sortedClasses : sortedClasses.slice(0, 4);

  return (
    <>
      <N39Head
        crumb="학생부 점검" title="학생부 점검 보고서" mobileTitle="학생부 점검"
        line={<>{line} · <span className="hidden md:inline">글은 보이지 않고 </span>건수만 세요</>}
        actions={<>
          <a href={`/admin/record-report/export?grade=${d.grade}&area=${d.areaParam}`} className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-control border border-hair bg-[#fff] px-5 text-[15px] font-bold hover:bg-soft"><Download size={17} />엑셀 내보내기</a>
          <ButtonLink href={qs({ print: "1" })} className="h-11 font-bold"><FileText size={17} />인쇄용 보고서</ButtonLink>
        </>}
      />
      <div className="flex flex-col gap-4 px-4 pb-10 pt-3 md:gap-5 md:px-10 md:pb-16 md:pt-5">
        {/* 거르기 줄: 학년 · 영역 · 마감 */}
        <div className="flex items-center gap-2 md:gap-3">
          <GradeSelect grades={d.grades} grade={d.grade} area={d.areaParam} />
          <nav className="flex min-w-0 gap-1 overflow-x-auto rounded-full border border-hair bg-[#fff] p-1 [scrollbar-width:none] max-md:border-0 max-md:p-0 max-md:gap-1.5">
            {AREAS.map((a) => (
              <Link key={a} href={qs({ area: AREA_PARAM[a] })} aria-current={a === area ? "page" : undefined}
                className={cx("whitespace-nowrap rounded-full px-3.5 py-2 text-[14px] max-md:border max-md:border-hair max-md:py-1.5",
                  a === area ? "bg-key-soft font-bold text-key-strong max-md:border-key-soft" : "text-sub hover:bg-soft")}>{AREA_TAB[a]}</Link>
            ))}
          </nav>
          <span className="ml-auto hidden whitespace-nowrap text-[14px] font-bold text-due md:block">마감 {d.deadline} (D-{Math.max(0, d.dday)})</span>
        </div>

        {/* 요약 카드 4개 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <SummaryCard label="확정" value={s.confirmed} unit={`/ ${s.total.toLocaleString()}건 · ${s.progress}%`} pct={s.progress} tone="ok" />
          <SummaryCard label="작성 중" value={s.writing} unit={`건 · ${pct(s.writing, s.total)}%`} pct={pct(s.writing, s.total)} tone="wait" />
          <SummaryCard label="미작성" value={s.empty} unit={`건 · ${pct(s.empty, s.total)}%`} pct={pct(s.empty, s.total)} tone="mute" />
          <SummaryCard label="확인 필요" value={s.check} unit="건 · 아래 5가지 합" pct={s.check ? Math.max(8, pct(s.check, s.total)) : 0} tone="bad" />
        </div>

        {/* 확인 필요 칩 5개 */}
        {/* 모바일은 줄을 꺾지 않고 옆으로 밀어 본다 (모바일 전수 점검 규칙) */}
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
          <span className="hidden text-[14px] font-bold md:inline">확인 필요</span>
          {ISSUE_KEYS.map((k) => (
            <span key={k} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-hair bg-[#fff] px-3 py-1.5 text-[13px] md:text-[14px]">
              {k === "ungrounded" ? <><span className="md:hidden">근거 없음</span><span className="hidden md:inline">{ISSUE_LABEL[k].chip}</span></> : k === "forbidden" ? <><span className="md:hidden">금칙어·실명</span><span className="hidden md:inline">{ISSUE_LABEL[k].chip}</span></> : ISSUE_LABEL[k].chip}
              <b className="text-bad">{s[k].toLocaleString()}</b>
            </span>
          ))}
        </div>

        {/* PC: 반별(세특은 과목·분반) 현황 표 */}
        <section className="surface hidden rounded-[16px] p-6 md:block">
          <div className="mb-4 flex items-baseline gap-2">
            <h2 className="text-[18px] font-bold">{area === "세특" ? "과목·분반별 현황" : "반별 현황"}</h2>
            <span className="text-[13px] text-mute">{d.grade}학년 · {area === "세특" ? `${d.groups.length}개 과목·분반` : `${d.classes.length}개 반`} · 기록 {s.total.toLocaleString()}건</span>
            <span className="ml-auto text-[12px] text-mute">숫자를 누르면 맡은 선생님 목록으로 가요</span>
          </div>
          <CountTable area={area} rows={rows} total={s} teacherName={d.teacherName} />
          <p className="mt-3 text-[12px] text-mute">
            세특을 고르면 반 대신 과목·분반으로 줄을 나눠요. 담임 미전달은 프로그램 초안을 확정했지만 담임에게 보내지 않은 건수예요. 맞춤법·근거 없는 문장은 N38 검사 결과가 남은 기록을 세요.
          </p>
        </section>

        {/* 모바일: 반 카드 (진행률 낮은 순) */}
        <section className="flex flex-col gap-3 md:hidden">
          <h2 className="flex items-baseline gap-2 text-[17px] font-bold">반별 현황 <span className="text-[13px] font-normal text-mute">{sortedClasses.length}개 반</span></h2>
          {shownCards.length === 0 && <p className="rounded-card bg-soft py-6 text-center text-[13px] text-mute">이 영역 기록이 없어요</p>}
          {shownCards.map((c) => (
            <div key={c.key} className="surface rounded-[16px] p-4">
              <div className="flex items-baseline gap-2">
                <b className="text-[16px]">{c.key}반</b>
                <span className="truncate text-[13px] text-mute">담임 {c.homeroom ?? "—"}</span>
                <b className="ml-auto text-[15px]">{c.counts.progress}%</b>
              </div>
              <Meter pct={c.counts.progress} tone={toneBar(c.counts.progress)} className="mt-2" />
              <p className="mt-2 text-[13px] text-sub">미작성 {c.counts.empty} · 작성 중 {c.counts.writing} · 확정 {c.counts.confirmed}</p>
              {issueChips(c.counts).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {issueChips(c.counts).map((x) => <span key={x.key} className="rounded-chip bg-bad-soft px-2 py-0.5 text-[12px] font-bold text-bad">{x.label} {x.n}</span>)}
                </div>
              )}
            </div>
          ))}
          {sortedClasses.length > 4 && q.all !== "1" && (
            <ButtonLink href={qs({ all: "1" })} kind="outline" className="w-full font-bold">{sortedClasses.length - 4}개 반 더 보기 (진행률 낮은 순)</ButtonLink>
          )}
        </section>

        {/* PC: 선생님별 진행률 */}
        <section className="surface hidden rounded-[16px] p-6 md:block">
          <div className="mb-4 flex items-baseline gap-2">
            <h2 className="text-[18px] font-bold">선생님별 진행률</h2>
            <span className="text-[13px] text-mute">맡은 기록 기준 · 낮은 순</span>
          </div>
          {d.teachers.length === 0 ? <p className="py-6 text-center text-sm text-mute">맡은 기록이 없어요</p> : (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[13px] text-sub [&>th]:bg-bg [&>th]:px-2 [&>th]:py-2.5 [&>th]:font-bold [&>th:first-child]:rounded-l-control [&>th:last-child]:rounded-r-control">
                  <th className="w-[110px]">선생님</th><th>맡은 것</th><th className="w-[64px] text-right">기록</th><th className="w-[64px] text-right">확정</th><th className="w-[250px] pl-6">진행률</th><th className="w-[90px] text-center">확인 필요</th><th className="w-[90px]">마지막 작성</th>
                </tr>
              </thead>
              <tbody>
                {d.teachers.map((t) => (
                  <tr key={t.teacherId} className="border-b border-line last:border-0 [&>td]:px-2 [&>td]:py-4">
                    <td className="font-bold">{t.name}</td>
                    <td className="max-w-0 truncate text-sub" title={t.scopes.join(" · ")}>{t.scopes.join(" · ")}</td>
                    <td className="text-right tabular-nums">{t.records.toLocaleString()}</td>
                    <td className="text-right font-bold tabular-nums">{t.confirmed.toLocaleString()}</td>
                    <td className="pl-6"><div className="flex items-center gap-2.5"><Meter pct={t.progress} tone={toneBar(t.progress)} className="w-[180px]" /><b className="text-[13px]">{t.progress}%</b></div></td>
                    <td className="text-center"><IssuePill n={t.check} /></td>
                    <td className="text-[13px] text-mute">{t.last ? kst(new Date(t.last), { month: "numeric", day: "numeric" }).replace(/\.\s?/g, ".").replace(/\.$/, "") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <LockNote>
          <span className="hidden md:inline">보고서에는 학생 이름과 기록 글이 없어요. 숫자를 누르면 그 기록을 맡은 선생님만 학생 목록(학번)을 볼 수 있어요. 인쇄·엑셀 내보내기는 감사 로그에 건수만 남아요.</span>
          <span className="md:hidden">학생 이름과 글은 없어요. 인쇄용 보고서·엑셀 내보내기·선생님별 진행률은 컴퓨터에서 볼 수 있어요.</span>
        </LockNote>
      </div>
    </>
  );
}

const NUM = "text-right tabular-nums";

/** 반별 / 과목·분반별 표 (PC) */
function CountTable({ area, rows, total, teacherName }: { area: ReportAreaFilter; rows: (ClassRow | GroupRow)[]; total: Counts; teacherName: (id: string | null) => string }) {
  const isGroup = area === "세특";
  const link = (r: ClassRow | GroupRow, f: string, n: number) => {
    if (!n) return <span className="text-faint">0</span>;
    const href = "courseId" in r ? listHref(area, f, { courseId: r.courseId, section: r.section }) : listHref(area, f, { classKey: r.key });
    return <Link href={href} className="underline underline-offset-4 hover:text-key-strong">{n.toLocaleString()}</Link>;
  };
  return (
    <table className="w-full text-[14px]">
      <thead>
        <tr className="text-[13px] text-sub [&>th]:bg-bg [&>th]:px-2 [&>th]:py-2.5 [&>th]:font-bold [&>th:first-child]:rounded-l-control [&>th:last-child]:rounded-r-control">
          <th className={cx("text-left", isGroup ? "w-[180px]" : "w-[56px]")}>{isGroup ? "과목·분반" : "반"}</th>
          <th className="w-[80px] text-left">{isGroup ? "선생님" : "담임"}</th>
          <th className={NUM}>학생</th><th className={NUM}>미작성</th><th className={NUM}>작성 중</th><th className={NUM}>확정</th>
          {ISSUE_KEYS.map((k) => <th key={k} className="text-center">{ISSUE_LABEL[k].head}</th>)}
          <th className="w-[170px] pl-3 text-left">진행률</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={13} className="py-8 text-center text-mute">이 영역 기록이 없어요</td></tr>}
        {rows.map((r) => {
          const c = r.counts;
          return (
            <tr key={r.key} className="border-b border-line [&>td]:px-2 [&>td]:py-4">
              <td className="truncate font-bold">{"label" in r ? r.label : r.key}</td>
              <td className="truncate text-sub">{"label" in r ? teacherName(r.teacherId) : r.homeroom ?? "—"}</td>
              <td className={cx(NUM, "text-sub")}>{r.students.toLocaleString()}</td>
              <td className={NUM}>{link(r, "empty", c.empty)}</td>
              <td className={NUM}>{link(r, "writing", c.writing)}</td>
              <td className={cx(NUM, "font-bold")}>{link(r, "confirmed", c.confirmed)}</td>
              {ISSUE_KEYS.map((k) => <td key={k} className="text-center"><IssuePill n={c[k]} /></td>)}
              <td className="pl-3"><div className="flex items-center gap-2.5"><Meter pct={c.progress} tone={toneBar(c.progress)} className="w-[110px]" /><b className="text-[13px]">{c.progress}%</b></div></td>
            </tr>
          );
        })}
        <tr className="font-bold [&>td]:bg-bg [&>td]:px-2 [&>td]:py-3.5 [&>td:first-child]:rounded-l-control [&>td:last-child]:rounded-r-control">
          <td>합계</td><td />
          <td className={NUM}>{rows.reduce((n, r) => n + r.students, 0).toLocaleString()}</td>
          <td className={NUM}>{total.empty.toLocaleString()}</td><td className={NUM}>{total.writing.toLocaleString()}</td><td className={NUM}>{total.confirmed.toLocaleString()}</td>
          {ISSUE_KEYS.map((k) => <td key={k} className="text-center text-bad">{total[k].toLocaleString()}</td>)}
          <td className="pl-3">{total.progress}%</td>
        </tr>
      </tbody>
    </table>
  );
}

// ---------- 인쇄 (A4 794×1123, 흑백) ----------

const P_TABLE = "w-full border-collapse text-[10px] text-[#111] [&_a]:text-[#111] [&_th]:whitespace-nowrap [&_td]:text-[#111] [&_td]:border-[0.5pt] [&_td]:border-[#333] [&_th]:border-[0.5pt] [&_th]:border-[#333] [&_th]:bg-[#f2f2f2] [&_th]:px-1.5 [&_th]:py-1 [&_th]:text-left [&_th]:font-bold [&_td]:px-1.5 [&_td]:py-1";

function PrintPages({ d, me }: { d: ReportData; me: string }) {
  const s = d.summary;
  const at = fullAt(d.at);
  const foot = (n: number) => (
    <div className="absolute inset-x-[56px] bottom-[40px] flex justify-between text-[9px] text-[#666]"><span>SCHS 학생관리시스템 · {at} 출력</span><span>{n} / 2</span></div>
  );
  const classTable = (rows: (ClassRow | GroupRow)[], total: Counts, group: boolean) => (
    <table className={P_TABLE}>
      <thead><tr><th>{group ? "과목·분반" : "반"}</th><th>{group ? "선생님" : "담임"}</th><th>학생</th><th>미작성</th><th>작성 중</th><th>확정</th><th>진행률</th>{ISSUE_KEYS.map((k) => <th key={k}>{ISSUE_LABEL[k].head}</th>)}</tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="[&>td:nth-child(n+3)]:text-right">
            <td className="font-bold">{"label" in r ? r.label : r.key}</td><td>{"label" in r ? d.teacherName(r.teacherId) : r.homeroom ?? ""}</td>
            <td>{r.students}</td><td>{r.counts.empty}</td><td>{r.counts.writing}</td><td className="font-bold">{r.counts.confirmed}</td><td>{r.counts.progress}%</td>
            {ISSUE_KEYS.map((k) => <td key={k}>{r.counts[k]}</td>)}
          </tr>
        ))}
        <tr className="font-bold [&>td]:bg-[#f2f2f2] [&>td:nth-child(n+3)]:text-right">
          <td>합계</td><td /><td>{rows.reduce((n, r) => n + r.students, 0)}</td><td>{total.empty}</td><td>{total.writing}</td><td>{total.confirmed}</td><td>{total.progress}%</td>
          {ISSUE_KEYS.map((k) => <td key={k}>{total[k]}</td>)}
        </tr>
      </tbody>
    </table>
  );
  return (
    <>
      <article className="print-paper relative min-h-[1123px] w-[794px] bg-[#fff] px-[56px] pb-[80px] pt-[56px] text-[#111] shadow-[0_2px_8px_rgba(0,0,0,.08)]">
        <div className="flex items-start gap-6">
          <div className="min-w-0 flex-1">
            <div className="text-[11px]">속초고등학교</div>
            <h2 className="text-[22px] font-bold leading-tight">학생부 점검 보고서</h2>
            <div className="mt-1 text-[10px] text-[#444]">{d.year}학년도 {d.semester}학기 · {d.grade}학년 · {d.area === "all" ? "전체 영역" : AREA_TAB[d.area]} · {at} 기준</div>
            <div className="text-[10px] text-[#444]">출력 {me}(관리자) · 학생 이름과 기록 글은 넣지 않음</div>
          </div>
          <table className="p-sign border-collapse text-[9px] [&_td]:border-[0.75pt] [&_td]:border-[#111] [&_th]:border-[0.75pt] [&_th]:border-[#111]">
            <thead><tr>{["담당", "부장", "교감", "교장"].map((x) => <th key={x} className="w-[56px] py-0.5 font-bold">{x}</th>)}</tr></thead>
            <tbody><tr>{[0, 1, 2, 3].map((i) => <td key={i} className="h-[40px]" />)}</tr></tbody>
          </table>
        </div>
        <hr className="mb-4 mt-4 border-t-[1.5pt] border-[#111]" />
        <h3 className="mb-2 text-[12px] font-bold">1. 요약</h3>
        <div className="grid grid-cols-5 border-[0.5pt] border-[#333] text-[9px]">
          {([["전체 기록", s.total, `${d.classes.length}개 반 · ${d.studentCount}명`], ["확정", s.confirmed, `${s.progress}%`], ["작성 중", s.writing, `${pct(s.writing, s.total)}%`], ["미작성", s.empty, `${pct(s.empty, s.total)}%`], ["확인 필요", s.check, "아래 표 오른쪽 5칸"]] as const).map(([k, n, sub], i) => (
            <div key={k} className={cx("px-2.5 py-2", i > 0 && "border-l-[0.5pt] border-[#333]")}>
              <div>{k}</div><div className="text-[15px] font-bold">{n.toLocaleString()}건</div><div className="text-[8px] text-[#555]">{sub}</div>
            </div>
          ))}
        </div>
        <h3 className="mb-2 mt-5 text-[12px] font-bold">2. 반별 현황 (건)</h3>
        {classTable(d.classes, s, false)}
        <div className="p-teachers">
          <h3 className="mb-2 mt-5 text-[12px] font-bold">3. 선생님별 진행률 (낮은 순)</h3>
          <table className={P_TABLE}>
            <thead><tr><th className="w-[60px]">선생님</th><th>맡은 것</th><th className="w-[40px]">기록</th><th className="w-[40px]">확정</th><th className="w-[48px]">진행률</th><th className="w-[56px]">확인 필요</th><th className="w-[64px]">마지막 작성</th></tr></thead>
            <tbody>
              {d.teachers.map((t) => (
                <tr key={t.teacherId} className="[&>td:nth-child(n+3)]:text-right">
                  <td className="whitespace-nowrap">{t.name}</td><td className="!text-left">{t.scopes.join(" · ")}</td><td>{t.records}</td><td>{t.confirmed}</td><td>{t.progress}%</td><td>{t.check}</td>
                  <td className="!text-left">{t.last ? kst(new Date(t.last), { month: "numeric", day: "numeric" }).replace(/\.\s?/g, ".").replace(/\.$/, "") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[8.5px] leading-relaxed text-[#444]">
          ※ 확인 필요: 바이트 초과(나이스 한도, 2026 기재요령 208쪽 기준) · 금칙어·실명 남음 · 맞춤법 · 근거 없는 문장 · 담임 미전달(프로그램 초안). 숫자는 건수이며 학생을 알아볼 수 있는 정보는 넣지 않았습니다.
        </p>
        {foot(1)}
      </article>
      <article className="print-paper relative min-h-[1123px] w-[794px] bg-[#fff] px-[56px] pb-[80px] pt-[56px] text-[#111] shadow-[0_2px_8px_rgba(0,0,0,.08)]">
        <h3 className="mb-3 text-[12px] font-bold">4. 영역별 현황 (세특 과목·분반 / 자율·자치 / 동아리 / 진로 / 행발 / 프로그램 초안)</h3>
        <PrintAreas d={d} classTable={classTable} />
        {foot(2)}
      </article>
    </>
  );
}

/** 2쪽: 영역마다 표 (세특은 과목·분반) */
function PrintAreas({ d, classTable }: { d: ReportData; classTable: (rows: (ClassRow | GroupRow)[], total: Counts, group: boolean) => ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      {d.perArea.filter((x) => x.summary.total && (d.area === "all" || d.area === x.area)).map((x) => (
        <section key={x.area}>
          <h4 className="mb-1.5 text-[11px] font-bold">{AREA_TAB[x.area]} · 기록 {x.summary.total}건 · 확정 {x.summary.progress}%</h4>
          {x.area === "세특" ? classTable(x.groups, x.summary, true) : classTable(x.classes.filter((c) => c.counts.total), x.summary, false)}
        </section>
      ))}
    </div>
  );
}
