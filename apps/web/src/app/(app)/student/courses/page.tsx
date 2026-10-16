import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Card } from "@/components/ui";
import { schoolYear } from "@/lib/domain/curriculum";
import { deadlineLabel, isClosed } from "@/lib/domain/offering";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { CoursePicker } from "./picker";

export const metadata = { title: "과목 신청 · 속초고등학교 학생관리시스템" };

export default async function StudentCoursesPage() {
  const v = await requireCan("student.self");
  if (v.kind !== "student") redirect("/");
  const round = await repo.offeringRound(schoolYear(), v.student.grade);

  if (!round) {
    return (
      <>
        <PageHeader title="과목 신청" />
        <PageBody>
          <Card><p className="py-6 text-center text-sm text-mute">지금 열린 과목 신청이 없어요</p></Card>
        </PageBody>
      </>
    );
  }

  const [offerings, counts, mine] = await Promise.all([
    repo.offeringList(round.id), repo.offeringCounts(round.id), repo.offeringChoicesOf(round.id, v.student.id),
  ]);

  return (
    <>
      <PageHeader title="과목 신청" />
      <PageBody>
        <p className="-mt-2 text-[13px] text-mute md:hidden">{deadlineLabel(round.deadline)} 마감</p>
        <CoursePicker
          semester={round.semester}
          deadline={deadlineLabel(round.deadline)}
          closed={isClosed(round.deadline, new Date())}
          maxCredits={round.maxCredits}
          offerings={offerings}
          counts={counts}
          mine={mine}
          careerGoal={v.student.careerGoal}
        />
      </PageBody>
    </>
  );
}
