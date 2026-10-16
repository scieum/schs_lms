import { ConfirmButton } from "@/components/admin/confirm-button";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Plus } from "lucide-react";
import { AiBanner, ButtonLink, Card, Segmented, StatTiles, Tag, cx } from "@/components/ui";
import { schoolYear } from "@/lib/domain/curriculum";
import { deadlineLabel, isClosed, offeringStats, seatState, sectionSuggestions } from "@/lib/domain/offering";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { addSections, archiveOffering } from "./actions";
import { NewOfferingForm, OpenRoundForm, RoundSettingsForm } from "./forms";

export const metadata = { title: "과목 개설 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ grade?: string }> };

export default async function OfferingsPage({ searchParams }: Props) {
  await requireCan("offering.manage");
  const { grade: g } = await searchParams;
  const grade = ["1", "2", "3"].includes(g ?? "") ? Number(g) : 2;
  const year = schoolYear();
  const round = await repo.offeringRound(year, grade);
  const tabs = <Segmented active={grade - 1} items={[1, 2, 3].map((n) => ({ label: `${n}학년`, href: `/admin/offerings?grade=${n}` }))} />;

  if (!round) {
    const today = new Date();
    const in2w = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
    return (
      <>
        <PageHeader title="과목 개설" />
        <PageBody>
          {tabs}
          <Card title={`${grade}학년 과목 신청 열기`} className="md:max-w-[520px]">
            <OpenRoundForm grade={grade} defaultDeadline={in2w} />
          </Card>
        </PageBody>
      </>
    );
  }

  const [offerings, counts, applicants, students, courses] = await Promise.all([
    repo.offeringList(round.id), repo.offeringCounts(round.id), repo.offeringApplicants(round.id), repo.listStudents(), repo.listCourses(year),
  ]);
  const eligible = students.filter((s) => s.grade === round.grade).length;
  const stats = offeringStats(offerings, counts, applicants, eligible);
  const suggest = sectionSuggestions(offerings, counts);
  const closed = isClosed(round.deadline, new Date());
  const courseNames = [...new Set(courses.filter((c) => c.grade === grade).map((c) => c.subject))];
  const oneEach = suggest.every((x) => x.add === 1);

  return (
    <>
      <PageHeader title="과목 개설" actions={<ButtonLink href="#new-offering" kind="outline" size="sm"><Plus size={16} />과목 열기</ButtonLink>} />
      <PageBody>
        {tabs}
        <StatTiles
          items={[
            ["개설 과목", `${stats.total}개`],
            ["신청률", `${stats.rate}%`],
            ["정원 초과", `${stats.over}개`],
            [closed ? "마감됨" : "마감", deadlineLabel(round.deadline)],
          ]}
        />
        <AiBanner
          label="자동"
          title="신청 예측"
          line={
            suggest.length
              ? `${suggest.map((x) => x.offering.subject).join("·")} 반을 ${oneEach ? "하나씩" : "더"} 늘리면 모두 들을 수 있어요`
              : "정원을 넘은 과목이 없어요"
          }
          action={
            suggest.length ? (
              <form action={addSections}>
                <input type="hidden" name="roundId" value={round.id} />
                <ConfirmButton
                  kind="outline"
                  size="sm"
                  message={`${suggest.map((x) => `${x.offering.subject} 반 +1`).join(", ")} — 늘릴까요?`}
                >
                  반 늘리기
                </ConfirmButton>
              </form>
            ) : undefined
          }
        />

        <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
          <Card title="과목별 신청" action={<span className="text-[13px] text-mute">{round.semester}학기 · 최대 {round.maxCredits}학점</span>}>
            {offerings.length === 0 ? (
              <p className="py-4 text-center text-sm text-mute">아직 연 과목이 없어요</p>
            ) : (
              offerings.map((o, i) => {
                const s = seatState(o, counts[o.id] ?? 0);
                const pct = Math.min(100, Math.round((s.count / Math.max(1, s.seats)) * 100));
                return (
                  <div key={o.id} className={cx("flex items-center gap-3 py-3", i < offerings.length - 1 && "border-b border-line")}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 truncate text-[15px] font-medium">{o.subject}</span>
                        <span className={cx("shrink-0 text-[13px] tabular-nums", s.over ? "font-medium text-bad" : "text-mute")}>
                          {s.count} / {s.seats}
                        </span>
                      </div>
                      <div className="mt-1 text-[12px] text-mute">{o.field} · {o.credits}학점{o.sections > 1 ? ` · ${o.sections}반` : ""}</div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-key-soft">
                        <div className={cx("h-full rounded-full", s.over ? "bg-bad" : "bg-key")} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <Tag>{s.over ? "초과" : s.full ? "마감" : "여유"}</Tag>
                    <form action={archiveOffering}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="roundId" value={round.id} />
                      <ConfirmButton kind="ghost" size="sm" message={`${o.subject}을(를) 내릴까요? 신청한 학생 ${s.count}명의 신청도 빠져요`}>
                        내리기
                      </ConfirmButton>
                    </form>
                  </div>
                );
              })
            )}
          </Card>
          <div className="flex flex-col gap-4 md:gap-6">
            <div id="new-offering">
              <Card title="새 과목">
                <NewOfferingForm roundId={round.id} courseNames={courseNames} />
              </Card>
            </div>
            <Card title="신청 설정">
              <RoundSettingsForm id={round.id} deadline={round.deadline} maxCredits={round.maxCredits} />
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
