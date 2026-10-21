import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card } from "@/components/ui";
import { homeroomStudents } from "@/lib/domain/activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { classScope } from "@/lib/domain/common-activity";
import { HOMEROOM_TABS, homeroomTab } from "@/lib/domain/compose";
import { libraryAreaOf } from "@/lib/domain/library";
import { DEFAULT_MENU, mergeMenu } from "@/lib/domain/behavior-keywords";
import { seoulNow } from "@/lib/domain/night";
import { repo } from "@/lib/server/repo";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireCan } from "@/lib/server/viewer";
import { commonActivityRows } from "@/lib/server/common-activity";
import { WorkspaceProvider } from "@/components/writing/workspace";
import { ClassCheckPanel } from "@/components/writing/class-check-panel";
import { ClassWritePanel } from "@/components/writing/class-write-panel";
import { LibraryPanel } from "@/components/writing/library-panel";
import { LibrarySaveProvider } from "@/components/writing/library-save";
import { ClassMaterials } from "@/components/writing/class-materials";
import { ComposePanels } from "@/components/writing/compose-workspace";
import { RecordCompose } from "@/components/writing/compose-adapters";
import { recordComposeData } from "@/app/(app)/teacher/write/compose-data";
import { evidenceLogs } from "@/app/(app)/teacher/write/data";

export const metadata = { title: "담임 글 짓기 · 속초고등학교 학생관리시스템" };
/** 반 전체 글 쓰기 (N42) */
export const maxDuration = 60;

type Props = { searchParams: Promise<{ tab?: string; student?: string; check?: string; mode?: string }> };

// 담임 · 글 짓기 (Figma N52 (e) 598:16829): 탭 행발 | 자율·자치 | 진로 — 같은 틀, 조각 = 누가기록 + 관찰 메모(listRecordPieces).
// 행발은 900B("850~900B 유지" · 빠른 요청 "생활 장면 더"), 자율·자치 · 진로는 1,500B. 머리 버튼은 [누가기록](→ /homeroom/logs). 주소는 id만 (C3).
export default async function HomeroomComposePage({ searchParams }: Props) {
  const v = await requireCan("record.write");
  const q = await searchParams;
  const h = v.kind === "teacher" ? v.teacher.homeroom : null;

  if (!h) {
    return (
      <>
        <PageHeader title="글 짓기" />
        <PageBody>
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">담임 반이 있어야 쓸 수 있어요</p>
              <ButtonLink href="/teacher" kind="outline">홈으로</ButtonLink>
            </div>
          </Card>
        </PageBody>
      </>
    );
  }

  const tab = homeroomTab(q.tab);
  const area = tab.area;
  const students = homeroomStudents(v, await repo.listStudents());
  const data = await recordComposeData(area, students, q.student);
  const base = `/homeroom/compose?tab=${tab.key}`;
  const label = `${h.grade}학년 ${h.classNo}반 · ${students.length}명`;

  if (!data.selected) {
    return (
      <>
        <PageHeader title="글 짓기" actions={<ButtonLink href="/homeroom/logs" kind="outline" size="sm">누가기록</ButtonLink>} />
        <PageBody>
          <Card><p className="py-6 text-center text-sm text-mute">우리 반 학생이 아직 없어요</p></Card>
        </PageBody>
      </>
    );
  }

  const sel = data.selected;
  const ids = students.map((s) => s.id);
  // 행발 키워드 메뉴판 (N35 ④): 기본 메뉴판 + 내가 고친 것 · 이 학생 고른 키워드 · 누가기록(세 영역)
  const behavior = area === "행발"
    ? await (async () => {
      const [savedMenu, picks, logs] = await Promise.all([repo.getKeywordMenu(v.accountId), repo.listBehaviorPicks([sel.id], schoolYear()), evidenceLogs("행발", [sel.id])]);
      const p = picks.find((x) => x.studentId === sel.id);
      return {
        menu: mergeMenu(DEFAULT_MENU, savedMenu),
        pick: { keywords: p?.keywords ?? [], memo: p?.memo ?? "", useLogs: p?.useLogs ?? true },
        logs: logs.map((l) => ({ id: l.id, date: l.date, area: l.area, content: l.content })),
      };
    })()
    : undefined;
  const commonKey = classScope(area, h.grade, h.classNo);
  const commonRows = await commonActivityRows(commonKey, ids);
  // 차시별 활동 (N43): 자율·자치 · 진로만 (행발은 없음)

  return (
    <WorkspaceProvider key={area} scope={{ kind: "record", area, clubId: null }}>
      <ComposePanels check={<ClassCheckPanel />} write={<ClassWritePanel hrefBase={base} word={`${area === "자율·자치" ? "자율" : area} 글`} />} library={<LibraryPanel />}>
        <LibrarySaveProvider area={libraryAreaOf(area)} studentId={sel.id} who={{ name: sel.name, studentNo: sel.studentNo }}>
          <RecordCompose
            key={`${area}-${sel.id}`}
            area={area}
            behavior={behavior}
            students={data.list}
            current={sel.id}
            hrefBase={base}
            classes={[{ label, href: base, on: true }]}
            classLabel={label}
            tabs={HOMEROOM_TABS.map((t) => ({ label: t.label, href: `/homeroom/compose?tab=${t.key}&student=${sel.id}`, on: t.key === tab.key }))}
            collectHref={`/homeroom/logs?student=${sel.id}`}
            collectLabel="누가기록"
            {...data.editor}
            aiOn={aiEnabled()}
            openCheck={q.check === "1" && q.student === sel.id}
            startMode={q.mode === "append" ? "append" : "new"}
            today={seoulNow().date}
            // 공통 활동 · 차시별 활동은 조각 모으기(누가기록)에 — 행발은 누가기록 영역이 없어 여기 공통 활동만 (N62)
            after={area === "행발" ? <ClassMaterials common={{ scope: commonKey, rows: commonRows, detailBase: "/teacher/write/activity", today: seoulNow().date }} /> : undefined}
          />
        </LibrarySaveProvider>
      </ComposePanels>
    </WorkspaceProvider>
  );
}
