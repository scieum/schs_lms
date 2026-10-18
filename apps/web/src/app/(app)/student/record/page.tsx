import { ChevronDown, Lock } from "lucide-react";
import { RecordCompetency } from "@/components/writing/record-competency";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { TabLinks } from "@/components/counsel/tab-links";
import { Card, Segmented, StatTiles, Tag } from "@/components/ui";
import { countByArea, gradeTabs, isRecordArea, RECORD_AREAS, yearOfGrade, type PastRecord, type RecordArea } from "@/lib/domain/counsel";
import { schoolYear } from "@/lib/domain/curriculum";
import { aiEnabled } from "@/lib/server/ai/claude";
import { fmtDate, loadMyRecords, shortDate } from "@/lib/server/counsel";
import { requireCan } from "@/lib/server/viewer";
import { CorrectionForm, PrintButton, RecordAi } from "./client";

export const metadata = { title: "내 생활기록부 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ grade?: string; area?: string }> };

const MAX: Record<RecordArea, number> = { 자율활동: 500, 동아리활동: 500, 진로활동: 700, 교과세특: 500 };

function RecordCard({ r }: { r: PastRecord }) {
  return (
    <article className="surface rounded-card p-5 md:p-6">
      <div className="mb-2 flex items-center gap-1.5">
        <Tag tone="bg-white text-sub">{r.area}</Tag>
        <Tag>확정</Tag>
        <span className="flex-1" />
        <span className="text-xs text-mute">{[...r.content].length} / {MAX[r.area]}자</span>
      </div>
      <p className="mb-3 text-[13px] text-mute">{r.title} · {r.teacherName} 선생님 · {shortDate(r.confirmedAt)} 확정</p>
      {/* 역량 보기 (Figma N18): 내 기록이 어느 역량을 보여 주는지 — 색칠만, 글은 바꾸지 않는다 */}
      <RecordCompetency studentId={r.studentId} title="" text={r.content}>
        <p className="whitespace-pre-line text-[15px] leading-7">{r.content}</p>
      </RecordCompetency>
    </article>
  );
}

export default async function MyRecordPage({ searchParams }: Props) {
  const v = await requireCan("student.self");
  if (v.kind !== "student") return null;
  const q = await searchParams;
  const s = v.student;
  const tabs = gradeTabs(s.grade);
  const open = tabs.filter((t) => !t.locked);
  const grade = Number(q.grade) && tabs.some((t) => t.grade === Number(q.grade)) ? Number(q.grade) : (open.at(-1)?.grade ?? s.grade);
  const locked = tabs.find((t) => t.grade === grade)?.locked ?? true;
  const year = yearOfGrade(grade, s.grade, schoolYear());

  // C5: 지난 학년도 확정본만 (loadMyRecords 가 recordsForStudent 로 거른다)
  const records = locked ? [] : (await loadMyRecords(v)).filter((r) => r.grade === grade);
  const counts = countByArea(records);
  const subjects = new Set(records.filter((r) => r.area === "교과세특").map((r) => r.title)).size;
  const area: RecordArea = q.area && isRecordArea(q.area) ? q.area : (RECORD_AREAS.find((a) => counts[a] > 0) ?? "진로활동");
  const shown = records.filter((r) => r.area === area);
  const confirmed = records.map((r) => r.confirmedAt).sort().at(-1);
  const homeroom = records.find((r) => r.area === "자율활동")?.teacherName;
  const href = (g: number, a?: string) => `/student/record?grade=${g}${a ? `&area=${encodeURIComponent(a)}` : ""}`;

  return (
    <>
      <PageHeader title="내 생활기록부" actions={!locked && records.length > 0 && <PrintButton />} />
      <PageBody>
        <StatTiles items={[
          ["자율활동", `${counts.자율활동}건`],
          ["동아리활동", `${counts.동아리활동}건`],
          ["진로활동", `${counts.진로활동}건`],
          ["교과세특", `${subjects}과목`],
        ]} />
        <div className="print:hidden">
          <Segmented active={tabs.findIndex((t) => t.grade === grade)} items={tabs.map((t) => ({ label: `${t.grade}학년`, href: href(t.grade) }))} />
        </div>

        {locked ? (
          <Card>
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Lock size={22} className="text-mute" />
              <p className="font-bold">{grade}학년 기록은 아직 볼 수 없어요</p>
              <p className="text-sm text-sub">학년도가 끝나고 확정되면 열려요</p>
            </div>
          </Card>
        ) : (
          <>
            <RecordAi grade={grade} disabled={!records.length} aiOn={aiEnabled()} />
            <div className="grid gap-4 md:grid-cols-[1fr_300px] md:gap-6">
              <div className="flex min-w-0 flex-col gap-4">
                <div className="print:hidden">
                  <TabLinks tone="none" active={area} items={RECORD_AREAS.map((a) => ({ key: a, label: a, href: href(grade, a) }))} />
                </div>
                {shown.length === 0 ? (
                  <Card><p className="py-6 text-center text-sm text-mute">{area} 확정 기록이 없어요</p></Card>
                ) : (
                  shown.map((r) => <RecordCard key={r.id} r={r} />)
                )}
                <div className="flex flex-col">
                  {RECORD_AREAS.filter((a) => a !== area).map((a) => {
                    const list = records.filter((r) => r.area === a);
                    return (
                      <details key={a} className="group border-b border-line">
                        <summary className="flex cursor-pointer list-none items-center py-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
                          <span className="flex-1">{a} · {a === "교과세특" ? `${new Set(list.map((r) => r.title)).size}과목` : `${list.length}건`}</span>
                          <ChevronDown size={18} className="text-mute transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="flex flex-col gap-3 pb-4">
                          {list.length ? list.map((r) => <RecordCard key={r.id} r={r} />) : <p className="text-sm text-mute">기록이 없어요</p>}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>

              <Card title="이 기록은요" className="h-full">
                <dl className="flex flex-col gap-2.5 text-sm">
                  <div className="flex justify-between"><dt className="text-mute">학년도</dt><dd className="font-medium">{year}</dd></div>
                  <div className="flex justify-between"><dt className="text-mute">확정일</dt><dd className="font-medium">{confirmed ? fmtDate(confirmed) : "—"}</dd></div>
                  <div className="flex justify-between"><dt className="text-mute">담임</dt><dd className="font-medium">{homeroom ? `${homeroom} 선생님` : "—"}</dd></div>
                </dl>
                <p className="my-4 text-[13px] leading-5 text-sub">생활기록부는 선생님만 고칠 수 있어요. 사실과 다른 내용이 있으면 담임 선생님께 요청하세요.</p>
                <CorrectionForm records={records.map((r) => ({ id: r.id, label: `${r.area} · ${r.title}` }))} />
              </Card>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
