import Link from "next/link";
import { Check, ChevronDown, ChevronRight, RefreshCw, ShieldCheck } from "lucide-react";
import { LockNote, N39Head } from "@/components/admin/n39";
import { Button, cx } from "@/components/ui";
import {
  dueChip, dueDate, kstToday, optionValue, RETENTION_LABEL, RETENTION_OPTIONS, termEndDate, termOf, type RetentionKey,
} from "@/lib/domain/retention";
import { repo } from "@/lib/server/repo";
import { NEED21 } from "@/lib/server/repo/modules/retention";
import { loadRetentionBundles, nextDue, sweepIfStale } from "@/lib/server/retention-sweep";
import { requireCan } from "@/lib/server/viewer";
import { holdRetention, runRetentionNow, saveRetention } from "./actions";

export const metadata = { title: "자료 보존 · 파기 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ tab?: string; msg?: string }> };

const kst = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
};
const TRIGGER = { cron: "자동", visit: "자동", admin: "관리자" } as const;

// 자료 보존 · 파기 (Figma N39 f PC 473:9090 · M 473:25198). 관리자만. 파일 이름·학생 이름은 보이지 않고 개수만.
export default async function RetentionPage({ searchParams }: Props) {
  const v = await requireCan("retention.manage");
  const q = await searchParams;
  const today = kstToday();
  // 크론이 빠져도: 마지막 확인이 24시간 넘었으면 화면을 열 때 한 번 돌린다
  await sweepIfStale(v.accountId, today);
  const [{ settings, termEnds, bundles }, runs, teachers] = await Promise.all([loadRetentionBundles(), repo.listRetentionRuns(30), repo.listTeachers()]);
  const tName = new Map(teachers.map((t) => [t.id, t.name]));
  const pending = bundles
    .map((b) => ({ b, nd: nextDue(b) }))
    .filter((x): x is { b: typeof x.b; nd: NonNullable<typeof x.nd> } => !!x.nd)
    .sort((a, c) => (a.nd.due ?? "9999").localeCompare(c.nd.due ?? "9999"));
  const done = runs.flatMap((r) => r.items.map((it, i) => ({ key: `${r.id}-${i}`, ...it, at: r.ranAt, trigger: r.trigger, actor: r.actorId ? tName.get(r.actorId) ?? null : null })));
  const lastRun = runs[0];
  const tab = q.tab === "done" ? "done" : "todo";
  const t = termOf(today);
  const t1 = termEndDate(t.year, 1, termEnds);
  const t2 = termEndDate(t.year, 2, termEnds);
  const nextOf = (key: RetentionKey) => dueDate({ refDate: today, setting: settings[key], termEnds });
  const dbMissing = q.msg === NEED21;

  return (
    <>
      <N39Head crumb="자료 보존" title="자료 보존 · 파기" line="학생 자료는 필요한 만큼만 두고, 정한 날에 저절로 지워요" />
      <div className="flex flex-col gap-4 px-4 pb-10 pt-3 md:gap-5 md:px-10 md:pb-16 md:pt-5">
        {q.msg && <p className={cx("rounded-card px-4 py-3 text-[14px]", dbMissing ? "bg-bad-soft text-bad" : "bg-key-soft text-key-strong")} role="status">{q.msg}</p>}

        {/* 자료 보존 기간 */}
        <form action={saveRetention} className="surface rounded-[16px] p-4 md:p-6">
          <div className="mb-1 flex flex-wrap items-baseline gap-2">
            <h2 className="flex-1 text-[17px] font-bold md:text-[18px]">자료 보존 기간</h2>
            <span className="hidden text-[12px] text-mute md:inline">학기 마감: 1학기 {t1} · 2학기 {t2} (학사일정)</span>
          </div>
          {(["raw_files", "extracted_text"] as RetentionKey[]).map((key) => {
            const nd = nextOf(key);
            return (
              <div key={key} className="flex flex-col gap-2 border-b border-line py-4 md:flex-row md:items-center md:gap-6">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold">{RETENTION_LABEL[key].title}</div>
                  <div className="text-[13px] text-mute"><span className="md:hidden">{RETENTION_LABEL[key].short}</span><span className="hidden md:inline">{RETENTION_LABEL[key].desc}</span></div>
                </div>
                <label className="relative block md:w-[220px]">
                  <span className="sr-only">{RETENTION_LABEL[key].title} 보존 기간</span>
                  <select name={key} defaultValue={optionValue(settings[key])} className="h-11 w-full appearance-none rounded-control border border-hair bg-[#fff] pl-3.5 pr-10 text-[15px] outline-none focus:ring-2 focus:ring-key">
                    {RETENTION_OPTIONS[key].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute" />
                </label>
                <span className="text-[12px] font-medium text-key-strong md:w-[140px] md:text-right">{nd ? `다음 파기 ${nd}` : "초안 확정 뒤"}</span>
              </div>
            );
          })}
          <div className="flex flex-col gap-2 py-4 md:flex-row md:items-center md:gap-6">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold">나이스 입력용 임시 자료</div>
              <div className="text-[13px] text-mute"><span className="md:hidden">북마클릿 창 · 클립보드. 서버에 두지 않아요</span><span className="hidden md:inline">복사한 확정본 · 북마클릿 창 · 클립보드. 서버에 두지 않아요</span></div>
            </div>
            <div className="relative flex h-11 items-center rounded-control bg-soft pl-3.5 text-[15px] text-mute md:w-[220px]" aria-disabled>창을 닫으면 바로<ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2" /></div>
            <span className="text-[12px] text-mute md:w-[140px] md:text-right">저장하지 않음</span>
          </div>
          <div className="flex items-start gap-2.5 rounded-inner bg-soft px-4 py-3 text-[13px] text-sub">
            <ShieldCheck size={16} className="mt-0.5 hidden shrink-0 md:block" />
            <p>지우지 않는 것: 확정한 초안 · 담임에게 보낸 기록 · 감사 로그(건수만).<span className="hidden md:inline"> 학생부 자료는 학교 업무에만 써요 (초·중등교육법 제25조의2).</span></p>
          </div>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
            <p className="flex-1 text-[12px] text-mute">기간을 줄이면 다음 확인(매일 새벽 3시) 때 바로 지워져요</p>
            <Button className="w-full font-bold md:w-auto">저장</Button>
          </div>
        </form>

        {/* 파기 예정 · 파기 완료 */}
        <section className="surface rounded-[16px] p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[17px] font-bold md:text-[18px]"><span className="md:hidden">{tab === "done" ? "파기 완료" : "파기 예정"} <span className="text-key-strong">{tab === "done" ? done.length : pending.length}</span></span><span className="hidden md:inline">파기 예정 · 파기 완료</span></h2>
            <nav className="hidden gap-1 rounded-full border border-hair p-1 md:flex">
              <Link href="/admin/retention" aria-current={tab === "todo" ? "page" : undefined} className={cx("rounded-full px-3.5 py-1.5 text-[14px]", tab === "todo" ? "bg-key-soft font-bold text-key-strong" : "text-sub hover:bg-soft")}>파기 예정 {pending.length}</Link>
              <Link href="/admin/retention?tab=done" aria-current={tab === "done" ? "page" : undefined} className={cx("rounded-full px-3.5 py-1.5 text-[14px]", tab === "done" ? "bg-key-soft font-bold text-key-strong" : "text-sub hover:bg-soft")}>파기 완료 {done.length}</Link>
            </nav>
            <span className="flex-1" />
            <Link href={tab === "done" ? "/admin/retention" : "/admin/retention?tab=done"} className="flex items-center gap-0.5 text-[13px] font-bold text-sub md:hidden">{tab === "done" ? `예정 ${pending.length}` : `완료 ${done.length}`}<ChevronRight size={15} /></Link>
            <form action={runRetentionNow} className="hidden md:block"><button className="flex items-center gap-1.5 text-[14px] font-bold text-key-strong"><RefreshCw size={15} />지금 확인하기</button></form>
          </div>
          <p className="mt-1.5 text-[12px] text-mute">
            마지막 확인 {lastRun ? `${kst(lastRun.ranAt).date} ${kst(lastRun.ranAt).time}` : "아직 없음"} (매일 새벽 자동)<span className="hidden md:inline"> · 파일 이름·학생 이름은 보이지 않고 개수만 보여요</span>
          </p>

          {tab === "todo" && (
            <>
              {/* PC 표 */}
              <table className="mt-4 hidden w-full text-[14px] md:table">
                <thead>
                  <tr className="text-left text-[13px] text-sub [&>th]:bg-bg [&>th]:px-2 [&>th]:py-2.5 [&>th]:font-bold [&>th:first-child]:rounded-l-control [&>th:last-child]:rounded-r-control">
                    <th>프로그램 · 자료</th><th className="w-[130px]">맡은 선생님</th><th className="w-[90px] text-right">원본 파일</th><th className="w-[90px] text-right">읽은 글</th><th className="w-[120px] pl-4">지울 날</th><th className="w-[160px]">남은 날</th><th className="w-[150px]" />
                  </tr>
                </thead>
                <tbody>
                  {pending.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-mute">지울 예정인 자료가 없어요</td></tr>}
                  {pending.map(({ b, nd }) => {
                    const chip = dueChip(nd.due, today);
                    return (
                      <tr key={b.target} className="border-b border-line [&>td]:px-2 [&>td]:py-4">
                        <td className="font-bold">{b.label}{nd.textOnly ? " (읽은 글)" : ""}</td>
                        <td className="text-sub">{b.teacherId ? tName.get(b.teacherId) ?? "—" : "담임"}</td>
                        <td className="text-right tabular-nums">{nd.textOnly ? "—" : `${b.files}개`}</td>
                        <td className="text-right tabular-nums">{b.kind === "service" ? "—" : `${b.texts}건`}</td>
                        <td className="pl-4 tabular-nums">{nd.due ?? "확정 뒤"}</td>
                        <td><span className={cx("rounded-chip px-2 py-0.5 text-[12px] font-bold", chip.soon ? "bg-wait-soft text-[#9a6400]" : "bg-soft text-sub")}>{chip.label}</span></td>
                        <td className="text-right">
                          {b.holdUntil ? <span className="text-[13px] text-mute">미룸 · {b.holdUntil}</span> : nd.due ? (
                            <form action={holdRetention}><input type="hidden" name="target" value={b.target} /><button className="whitespace-nowrap text-[14px] font-bold text-key-strong">한 번 미루기 (30일)</button></form>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* 모바일 카드 */}
              <div className="mt-3 flex flex-col gap-3 md:hidden">
                {pending.length === 0 && <p className="rounded-inner bg-soft py-6 text-center text-[13px] text-mute">지울 예정인 자료가 없어요</p>}
                {pending.map(({ b, nd }) => {
                  const chip = dueChip(nd.due, today);
                  return (
                    <div key={b.target} className="rounded-inner border border-line p-4">
                      <div className="flex items-start gap-2">
                        <b className="min-w-0 flex-1 text-[15px]">{b.label}{nd.textOnly ? " (읽은 글)" : ""}</b>
                        <span className={cx("shrink-0 whitespace-nowrap rounded-chip px-2 py-0.5 text-[12px] font-bold", chip.soon ? "bg-wait-soft text-[#9a6400]" : "bg-soft text-sub")}>{chip.label}</span>
                      </div>
                      <p className="mt-1 text-[13px] text-sub">{b.teacherId ? tName.get(b.teacherId) ?? "—" : "담임"}{nd.textOnly ? "" : ` · 원본 ${b.files}개`}{b.kind === "service" ? "" : ` · 글 ${b.texts}건`}</p>
                      <div className="mt-1 flex items-center">
                        <span className="flex-1 text-[13px] text-mute">지울 날 {nd.due ?? "확정 뒤"}</span>
                        {b.holdUntil ? <span className="text-[13px] text-mute">미룸</span> : nd.due ? (
                          <form action={holdRetention}><input type="hidden" name="target" value={b.target} /><button className="text-[14px] font-bold text-key-strong">한 번 미루기</button></form>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {(tab === "done" || done.length > 0) && (
            <div className={cx(tab === "todo" && "mt-6 hidden md:block")}>
              {tab === "todo" && <h3 className="mb-2 text-[15px] font-bold">최근 파기 완료</h3>}
              <ul className="mt-3 flex flex-col gap-2">
                {done.length === 0 && <li className="rounded-inner bg-soft py-6 text-center text-[13px] text-mute">아직 지운 자료가 없어요</li>}
                {(tab === "todo" ? done.slice(0, 3) : done).map((x) => (
                  <li key={x.key} className="flex flex-col gap-1 rounded-inner bg-bg px-4 py-3 md:flex-row md:items-center md:gap-3">
                    <span className="flex min-w-0 flex-1 items-center gap-2.5 text-[14px] font-bold md:max-w-[300px]"><Check size={15} className="shrink-0 text-ok" /><span className="truncate">{x.label}</span></span>
                    <span className="flex-1 text-[13px] text-sub">{[x.files ? `원본 ${x.files}개` : null, x.texts ? `읽은 글 ${x.texts}건` : null].filter(Boolean).join(" · ")}</span>
                    <span className="text-[13px] text-sub tabular-nums">{kst(x.at).date}</span>
                    <span className="text-[12px] text-mute">{x.trigger === "admin" ? `관리자 ${x.actor ?? ""} · 지금 확인` : TRIGGER[x.trigger]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <form action={runRetentionNow} className="mt-4 md:hidden"><Button kind="outline" className="w-full font-bold"><RefreshCw size={15} />지금 확인하기</Button></form>
        </section>

        <LockNote>지운 기록은 감사 로그에 &apos;프로그램 1개 · 원본 48개 · 글 48건 파기&apos;처럼 건수만 남아요. 지운 파일은 되살릴 수 없어요.</LockNote>
      </div>
    </>
  );
}
