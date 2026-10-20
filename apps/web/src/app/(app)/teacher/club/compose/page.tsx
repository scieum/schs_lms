import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card } from "@/components/ui";
import { schoolYear } from "@/lib/domain/curriculum";
import { clubScope } from "@/lib/domain/common-activity";
import { libraryAreaOf } from "@/lib/domain/library";
import { seoulNow } from "@/lib/domain/night";
import { repo } from "@/lib/server/repo";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireCan } from "@/lib/server/viewer";
import { commonActivityRows } from "@/lib/server/common-activity";
import { lessonView } from "@/lib/server/lessons";
import { WorkspaceProvider } from "@/components/writing/workspace";
import { ClassCheckPanel } from "@/components/writing/class-check-panel";
import { ClassWritePanel } from "@/components/writing/class-write-panel";
import { LibraryPanel } from "@/components/writing/library-panel";
import { LibrarySaveProvider } from "@/components/writing/library-save";
import { ClassMaterials } from "@/components/writing/class-materials";
import { ComposePanels } from "@/components/writing/compose-workspace";
import { RecordCompose } from "@/components/writing/compose-adapters";
import { recordComposeData } from "@/app/(app)/teacher/write/compose-data";

export const metadata = { title: "동아리 글 짓기 · 속초고등학교 학생관리시스템" };
/** 반 전체 글 쓰기 (N42) */
export const maxDuration = 60;

type Props = { searchParams: Promise<{ club?: string; student?: string; check?: string; mode?: string }> };

// 동아리 · 글 짓기 (Figma N52 (d) 598:16449): 세특과 같은 틀 · 조각 = 그 동아리 누가기록 + 관찰 메모. 주소는 id만 (C3).
export default async function ClubComposePage({ searchParams }: Props) {
  const v = await requireCan("record.write");
  const q = await searchParams;
  const myClubs = (await repo.listClubs(schoolYear())).filter((c) => c.advisorId === v.accountId);
  const club = myClubs.find((c) => c.id === q.club) ?? myClubs[0];

  if (!club) {
    return (
      <>
        <PageHeader title="글 짓기" />
        <PageBody>
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">지도하는 동아리가 없어요</p>
              <ButtonLink href="/teacher/club">동아리 만들기</ButtonLink>
            </div>
          </Card>
        </PageBody>
      </>
    );
  }

  const ids = new Set(await repo.listClubMembers(club.id));
  const students = (await repo.listStudents()).filter((s) => ids.has(s.id)).sort((a, b) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number);
  const data = await recordComposeData("동아리", students, q.student, club.id);
  const base = `/teacher/club/compose?club=${club.id}`;
  const collect = `/teacher/club/collect?club=${club.id}`;
  const label = `${club.name} · ${students.length}명`;

  if (!data.selected) {
    return (
      <>
        <PageHeader title="글 짓기" actions={<ButtonLink href={collect} kind="outline" size="sm">조각 모으기</ButtonLink>} />
        <PageBody>
          <Card><p className="py-6 text-center text-sm text-mute">이 동아리에 부원이 아직 없어요</p></Card>
        </PageBody>
      </>
    );
  }

  const commonKey = clubScope(club.id);
  const commonRows = await commonActivityRows(commonKey, students.map((s) => s.id));
  const lesson = await lessonView(commonKey, students, club.name);
  const sel = data.selected;

  return (
    <WorkspaceProvider key={club.id} scope={{ kind: "record", area: "동아리", clubId: club.id }}>
      <ComposePanels check={<ClassCheckPanel />} write={<ClassWritePanel hrefBase={base} word="동아리 글" />} library={<LibraryPanel />}>
        <LibrarySaveProvider area={libraryAreaOf("동아리")} studentId={sel.id} who={{ name: sel.name, studentNo: sel.studentNo }}>
          <RecordCompose
            key={`${club.id}-${sel.id}`}
            area="동아리"
            clubId={club.id}
            students={data.list}
            current={sel.id}
            hrefBase={base}
            classes={myClubs.map((c) => ({ label: c.id === club.id ? label : c.name, href: `/teacher/club/compose?club=${c.id}`, on: c.id === club.id }))}
            classLabel={label}
            collectHref={`${collect}&student=${sel.id}`}
            {...data.editor}
            aiOn={aiEnabled()}
            openCheck={q.check === "1" && q.student === sel.id}
            startMode={q.mode === "append" ? "append" : "new"}
            today={seoulNow().date}
            after={<ClassMaterials year={schoolYear()} lesson={lesson} common={{ scope: commonKey, rows: commonRows, detailBase: "/teacher/write/activity", today: seoulNow().date }} />}
          />
        </LibrarySaveProvider>
      </ComposePanels>
    </WorkspaceProvider>
  );
}
