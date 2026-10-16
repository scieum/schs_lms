import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card, Segmented } from "@/components/ui";
import { schoolYear } from "@/lib/domain/curriculum";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { MembersForm, NewClubForm } from "./club-forms";

export const metadata = { title: "내 동아리 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ club?: string }> };

export default async function ClubPage({ searchParams }: Props) {
  const v = await requireCan("logs.write");
  const q = await searchParams;
  const mine = (await repo.listClubs(schoolYear())).filter((c) => c.advisorId === v.accountId);
  const club = mine.find((c) => c.id === q.club) ?? mine[0];
  const [members, students] = club ? await Promise.all([repo.listClubMembers(club.id), repo.listStudents()]) : [[], []];

  return (
    <>
      <PageHeader title="내 동아리" actions={club ? <ButtonLink href={`/teacher/logs?area=${encodeURIComponent("동아리")}&club=${club.id}`} kind="outline" size="sm">누가기록 쓰기</ButtonLink> : undefined} />
      <PageBody>
        {mine.length > 1 && club && (
          <Segmented active={mine.indexOf(club)} items={mine.map((c) => ({ label: c.name, href: `/teacher/club?club=${c.id}` }))} />
        )}
        <div className="grid gap-4 md:grid-cols-[1fr_320px] md:gap-6">
          <Card title={club ? `${club.name} 부원` : "부원"} action={club ? <span className="text-[13px] text-mute">{members.length}명</span> : undefined}>
            {club ? (
              <MembersForm
                key={club.id}
                clubId={club.id}
                initial={members}
                students={students.map((s) => ({ id: s.id, name: s.name, grade: s.grade, classNo: s.classNo, number: s.number, studentNo: s.studentNo }))}
              />
            ) : (
              <p className="py-6 text-center text-sm text-mute">오른쪽에서 동아리를 먼저 만들어 주세요</p>
            )}
          </Card>
          <Card title="새 동아리">
            <NewClubForm />
          </Card>
        </div>
      </PageBody>
    </>
  );
}
