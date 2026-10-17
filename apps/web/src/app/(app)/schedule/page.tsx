import { after } from "next/server";
import { MealCard } from "@/components/school-info";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { seoulNow } from "@/lib/domain/night";
import { isAdmin } from "@/lib/domain/policy";
import { monthGrid } from "@/lib/domain/program";
import { forGrade } from "@/lib/domain/school-info";
import { syncIfStale } from "@/lib/server/notion-sync";
import { getEvents } from "@/lib/server/school-info";
import { requireViewer } from "@/lib/server/viewer";
import { EventCalendar } from "./event-calendar";

export const metadata = { title: "학사일정 · 속초고등학교 학생관리시스템" };

/** 학사일정 (Figma N1): 나이스 + 직접 추가한 일정. 학생은 자기 학년 일정만 */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const v = await requireViewer();
  // 노션 학사일정: 마지막으로 가져온 지 10분이 지났으면 화면을 띄운 뒤 뒤에서 가져온다
  after(() => syncIfStale());
  const today = seoulNow().date;
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const weeks = monthGrid(month);
  const { events, neisOk } = await getEvents(weeks[0][0], weeks.at(-1)!.at(-1)!);
  const grade = v.kind === "student" ? v.student.grade : undefined;

  return (
    <>
      <PageHeader title="학사일정" />
      <PageBody>
        <div className="grid gap-4 md:gap-6 xl:grid-cols-[1fr_360px] xl:items-start">
          <EventCalendar events={forGrade(events, grade)} month={month} today={today} me={v.accountId} admin={isAdmin(v)} neisOk={neisOk} />
          <MealCard today={today} />
        </div>
      </PageBody>
    </>
  );
}
