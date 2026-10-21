import { scoresEnabled } from "@/lib/server/features";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card, Tag } from "@/components/ui";
import { addDays, seoulNow } from "@/lib/domain/night";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";
import { Briefing } from "./briefing";
import { briefingInputs } from "./briefing-data";
import { ClassGlance, type GlanceStudent } from "./class-glance";
import { SchoolInfoRow } from "@/components/school-info";

export const metadata = { title: "우리 반 · 속초고 쌤기부" };

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const md = (ymd: string) => ymd.slice(5).replace("-", ".");
const dow = (ymd: string) => DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()];

export default async function HomeroomHome() {
  const v = await requireViewer();
  if (v.kind !== "teacher" || !v.teacher.homeroom) redirect("/forbidden");
  const { grade, classNo } = v.teacher.homeroom;
  const mine = (await repo.listStudents()).filter((s) => s.grade === grade && s.classNo === classNo).sort((a, b) => a.number - b.number);
  const ids = mine.map((s) => s.id);
  const [drafts, scores, night, brief, counsel, programs] = await Promise.all([
    repo.listDraftsForStudents(ids),
    scoresEnabled() ? repo.scoresClassSummary(ids) : Promise.resolve([]),
    repo.nightClassToday(ids),
    briefingInputs(mine),
    repo.listCounsel({ studentIds: ids }),
    repo.listPrograms(),
  ]);
  const verdict = new Map(scores.map((r) => [r.studentId, r.verdict]));
  const met = scores.filter((r) => r.verdict === "충족").length;
  const nightSigned = Math.max(0, ...Object.values(night).map((p) => p.signed));
  const care = new Set(brief.picks.map((p) => p.studentId));
  const byName = new Map(mine.map((s) => [s.id, s.name]));

  const glance: GlanceStudent[] = mine.map((s) => ({
    id: s.id,
    name: s.name,
    number: s.number,
    drafts: drafts.filter((d) => d.studentId === s.id).length,
    counsels: counsel.filter((c) => c.studentId === s.id).length,
    miss: verdict.get(s.id) === "미충족",
    care: care.has(s.id),
  }));

  // 받은 생기부 초안: 프로그램별로 묶어 최근 순
  const today = seoulNow().date;
  const fresh = addDays(today, -7);
  const groups = new Map<string, { title: string; count: number; last: string }>();
  for (const d of drafts) {
    const g = groups.get(d.programId) ?? { title: d.programTitle, count: 0, last: "" };
    g.count++;
    if (d.finalizedAt > g.last) g.last = d.finalizedAt;
    groups.set(d.programId, g);
  }
  const inbox = [...groups.entries()].sort((a, b) => b[1].last.localeCompare(a[1].last)).slice(0, 3);

  // 이번 주 일정: 우리 반 학생이 대상인 프로그램의 시작·마감 (오늘부터 7일)
  const until = addDays(today, 7);
  const week = programs
    .filter((p) => p.status !== "draft" && p.targetIds.some((id) => byName.has(id)))
    .flatMap((p) => [
      { date: p.startDate, text: `${p.title} 시작` },
      { date: p.endDate, text: `${p.title} ${p.source === "survey" ? "설문" : "제출"} 마감` },
    ])
    .filter((e) => e.date >= today && e.date <= until)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  const tiles: [string, string][] = [["우리 반", `${mine.length}명`], ["받은 초안", `${drafts.length}건`], scoresEnabled() ? ["최저 충족 예상", `${met}명`] : ["상담 필요", `${care.size}명`], ["오늘 야자", `${nightSigned}명`]];

  return (
    <>
      <PageHeader title={`${grade}학년 ${classNo}반`} actions={<ButtonLink href="/homeroom/students" kind="outline" size="sm" className="max-md:hidden">학생 기록</ButtonLink>} />
      <PageBody>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
          {tiles.map(([k, val], i) => (
            <div key={k} className="flex flex-col surface rounded-card p-4 md:px-[22px] md:py-5">
              <div className="text-[13px] text-mute">{k}</div>
              <div className="mt-1.5 text-[22px] font-bold md:text-[28px]">{val}</div>
              {i === 0 && (
                <ButtonLink href="/homeroom/drafts" size="sm" className="mt-2.5 w-fit max-md:hidden">
                  <FileText size={15} /> 받은 초안 확인
                </ButtonLink>
              )}
            </div>
          ))}
        </div>
        <ButtonLink href="/homeroom/drafts" className="w-full md:hidden">
          <FileText size={17} /> 받은 초안 확인
        </ButtonLink>
        <Briefing line={brief.line} ai={aiEnabled()} names={Object.fromEntries(byName)} />
        <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
          <Card title="학생 한눈에" action={<Link href="/homeroom/students" className="hidden text-[13px] text-sub hover:text-key-strong md:inline">{mine.length}명 전체 보기</Link>}>
            {mine.length === 0 ? <p className="py-6 text-center text-sm text-mute">아직 등록된 학생이 없어요</p> : <ClassGlance students={glance} scores={scoresEnabled()} />}
          </Card>
          <div className="flex flex-col gap-4 md:gap-6">
            <div id="drafts" className="scroll-mt-6">
              <Card title="받은 생기부 초안" action={<Link href="/homeroom/students" className="text-[13px] text-sub hover:text-key-strong">전체</Link>}>
                {inbox.length === 0 ? (
                  <p className="py-6 text-center text-sm text-mute">아직 받은 초안이 없어요</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {inbox.map(([pid, g]) => (
                      <li key={pid} className="flex items-center gap-3 rounded-inner bg-white px-3.5 py-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-soft text-sub"><FileText size={16} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-bold">{g.title}</div>
                          <div className="text-xs text-mute">{g.count}명 · {md(g.last.slice(0, 10))}</div>
                        </div>
                        {g.last.slice(0, 10) >= fresh && <Tag tone="bg-new-soft text-new">새로 도착</Tag>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            <Card title="이번 주 일정" className="flex-1">
              {week.length === 0 ? (
                <p className="py-4 text-center text-sm text-mute">이번 주 일정이 없어요</p>
              ) : (
                <ul className="flex flex-col gap-3.5">
                  {week.map((e) => (
                    <li key={e.date + e.text} className="flex gap-2.5 text-sm">
                      <span className="w-[68px] shrink-0 font-bold">{md(e.date)} ({dow(e.date)})</span>
                      <span className="min-w-0 truncate text-sub">{e.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
        <SchoolInfoRow today={seoulNow().date} />
      </PageBody>
    </>
  );
}
