import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, ButtonLink, Card, Segmented } from "@/components/ui";
import { areasFor, homeroomStudents, isAreaOf, today, type ActivityArea } from "@/lib/domain/activity";
import { schoolYear } from "@/lib/domain/curriculum";
import type { Student } from "@/lib/domain/types";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { LogBoard } from "./log-board";

export const metadata = { title: "누가기록 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ area?: string; club?: string }> };

export default async function LogsPage({ searchParams }: Props) {
  const v = await requireCan("logs.write");
  const q = await searchParams;
  const areas = areasFor(v);
  const myClubs = (await repo.listClubs(schoolYear())).filter((c) => c.advisorId === v.accountId);
  // 기본 영역: 담임이면 자율·자치, 아니면 동아리
  const fallback: ActivityArea = areas.includes("자율·자치") && !myClubs.length ? "자율·자치" : "동아리";
  const area: ActivityArea = q.area && isAreaOf(q.area) && areas.includes(q.area) ? q.area : fallback;
  const club = area === "동아리" ? myClubs.find((c) => c.id === q.club) ?? myClubs[0] : undefined;

  const all = await repo.listStudents();
  let students: Student[] = [];
  if (area === "동아리" && club) {
    const ids = new Set(await repo.listClubMembers(club.id));
    students = all.filter((s) => ids.has(s.id)).sort((a, b) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number);
  } else if (area !== "동아리") {
    students = homeroomStudents(v, all);
  }
  const logs = await repo.listActivityLogs(area, students.map((s) => s.id));
  const count = (id: string) => logs.filter((l) => l.studentId === id).length;

  return (
    <>
      <PageHeader title="누가기록" actions={<ButtonLink href="/teacher/club" kind="outline" size="sm">내 동아리</ButtonLink>} />
      <PageBody>
        {areas.length > 1 && (
          <Segmented active={areas.indexOf(area)} items={areas.map((a) => ({ label: a, href: `/teacher/logs?area=${encodeURIComponent(a)}` }))} />
        )}
        {area === "동아리" && myClubs.length > 1 && club && (
          <Segmented active={myClubs.indexOf(club)} items={myClubs.map((c) => ({ label: c.name, href: `/teacher/logs?area=${encodeURIComponent("동아리")}&club=${c.id}` }))} />
        )}
        <AiBanner title="AI 특기사항 초안" line="쌓인 누가기록을 모아 학기말에 특기사항 초안으로 만들어요" />

        {area === "동아리" && !club ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">지도하는 동아리가 없어요</p>
              <p className="text-sm text-sub">동아리를 만들고 부원을 넣으면 동아리 누가기록을 쓸 수 있어요</p>
              <ButtonLink href="/teacher/club">동아리 만들기</ButtonLink>
            </div>
          </Card>
        ) : (
          <LogBoard
            key={`${area}-${club?.id ?? ""}`}
            area={area}
            clubId={club?.id}
            today={today()}
            students={students.map((s) => ({ id: s.id, name: s.name, classNo: s.classNo, number: s.number, count: count(s.id) }))}
            logs={logs.map((l) => ({ id: l.id, studentId: l.studentId, date: l.date, content: l.content }))}
          />
        )}
      </PageBody>
    </>
  );
}
