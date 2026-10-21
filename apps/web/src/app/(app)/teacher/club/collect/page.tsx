import Link from "next/link";
import { PencilLine } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card, cx } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { makeStudentNo } from "@/lib/domain/roster";
import { recentPieces } from "@/lib/domain/collect";
import { repo } from "@/lib/server/repo";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireCan } from "@/lib/server/viewer";
import { CollectBoard } from "@/components/writing/collect-board";
import { clubScope } from "@/lib/domain/common-activity";
import { commonActivityRows } from "@/lib/server/common-activity";
import { lessonView } from "@/lib/server/lessons";
import { ClassMaterials } from "@/components/writing/class-materials";

export const metadata = { title: "동아리 조각 모으기 · 속초고 쌤기부" };

type Props = { searchParams: Promise<{ club?: string; student?: string }> };

// 동아리 · 조각 모으기 (Figma N52 a 틀, 반 탭 = 동아리 이름): 조각 = 그 동아리 누가기록 (addLogs 그대로).
// 학생마다 다른 글로 한꺼번에 쓰기(N28) · 파일로 쓰기는 /teacher/logs 에 그대로 있다 — 머리 [여러 명 따로 쓰기].
export default async function ClubCollectPage({ searchParams }: Props) {
  const v = await requireCan("logs.write");
  const q = await searchParams;
  const myClubs = (await repo.listClubs(schoolYear())).filter((c) => c.advisorId === v.accountId);
  const club = myClubs.find((c) => c.id === q.club) ?? myClubs[0];

  if (!club) {
    return (
      <>
        <PageHeader title="조각 모으기" />
        <PageBody>
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">지도하는 동아리가 없어요</p>
              <p className="text-sm text-sub">동아리를 만들고 부원을 넣으면 조각을 모을 수 있어요</p>
              <ButtonLink href="/teacher/club">동아리 만들기</ButtonLink>
            </div>
          </Card>
        </PageBody>
      </>
    );
  }

  const memberSets = await Promise.all(myClubs.map(async (c) => ({ c, ids: await repo.listClubMembers(c.id) })));
  const ids = new Set(memberSets.find((m) => m.c.id === club.id)!.ids);
  const students = (await repo.listStudents()).filter((s) => ids.has(s.id)).sort((a, b) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number);
  const logs = (await repo.listActivityLogs("동아리", students.map((s) => s.id))).filter((l) => l.clubId === club.id);
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const compose = `/teacher/club/compose?club=${club.id}`;
  // 공통 활동 · 차시별 활동 (N26 · N43): 글 짓기 아래와 같은 카드
  const commonKey = clubScope(club.id);
  const [commonRows, lesson] = await Promise.all([commonActivityRows(commonKey, students.map((s) => s.id)), lessonView(commonKey, students, club.name)]);

  return (
    <>
      <PageHeader title="조각 모으기" actions={<>
        <ButtonLink href={`/teacher/logs?area=${encodeURIComponent("동아리")}&club=${club.id}`} kind="outline" size="sm" className="hidden md:inline-flex">여러 명 따로 쓰기</ButtonLink>
        <ButtonLink href={q.student ? `${compose}&student=${q.student}` : compose} kind="outline" size="sm"><PencilLine size={14} /> 글 짓기</ButtonLink>
      </>} />
      <PageBody>
        {myClubs.length > 1 && (
          <nav className="flex gap-1 overflow-x-auto rounded-card border border-line bg-[#fff] p-1 [scrollbar-width:none]">
            {memberSets.map(({ c, ids: m }) => {
              const on = c.id === club.id;
              return (
                <Link key={c.id} href={`/teacher/club/collect?club=${c.id}`} aria-current={on ? "page" : undefined}
                  className={cx("flex h-11 min-w-[120px] flex-1 flex-col items-center justify-center whitespace-nowrap rounded-control px-3 md:h-[37px] md:flex-row md:gap-1",
                    on ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub hover:bg-soft")}>
                  <span className="text-[13px] md:text-[14px]">{c.name}</span>
                  <span className="text-[11px] md:text-[14px]"><span className="hidden md:inline">· </span>{m.length}명</span>
                </Link>
              );
            })}
          </nav>
        )}
        <ClassMaterials year={schoolYear()} lesson={lesson} common={{ scope: commonKey, rows: commonRows, detailBase: "/teacher/write/activity", today: today() }} />
        <CollectBoard
          key={club.id}
          target={{ kind: "log", area: "동아리", clubId: club.id }}
          students={students.map((s) => ({ id: s.id, no: makeStudentNo(s.grade, s.classNo, s.number), name: s.name, count: logs.filter((l) => l.studentId === s.id).length }))}
          recent={recentPieces(logs.map((l) => ({ studentId: l.studentId, date: l.date, content: l.content })), (id) => nameOf.get(id))}
          composeHref={compose}
          today={today()}
          withDate
          preselect={q.student ? [q.student] : []}
          aiOn={aiEnabled()}
        />
      </PageBody>
    </>
  );
}
