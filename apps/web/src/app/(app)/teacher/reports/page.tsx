import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card } from "@/components/ui";
import { schoolYear } from "@/lib/domain/curriculum";
import { parseItems, parseTerm, TERM_LABEL } from "@/lib/domain/report";
import { semesterOf } from "@/lib/domain/writing";
import { aiEnabled } from "@/lib/server/ai/claude";
import { loadReports, reportScopes } from "@/lib/server/report";
import { requireCan } from "@/lib/server/viewer";
import { PrintButton, ReportBoard } from "./board";

export const metadata = { title: "학생 리포트 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ scope?: string; term?: string; items?: string }> };

const ROLE_WORD = { homeroom: "담임", course: "교과", club: "동아리 지도" } as const;

// 학생 리포트 (Figma N55 a · b): 왼쪽 만들기 칸(대상 · 학기 · 넣을 것 · 한마디 칸) · 오른쪽 한 학생 미리보기 → 인쇄하면 학생마다 A4 한 장.
// 대상은 이 교사가 볼 수 있는 범위만(우리 반 · 내 분반 · 내 동아리). 주소에는 내부 id 만 (C3).
export default async function ReportsPage({ searchParams }: Props) {
  const v = await requireCan("record.write");
  const q = await searchParams;
  const scopes = await reportScopes(v);
  if (!scopes.length || v.kind !== "teacher") {
    return (
      <>
        <PageHeader title="학생 리포트" />
        <PageBody>
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">리포트로 뽑을 학생이 아직 없어요</p>
              <p className="text-[13px] text-sub">담임 반 · 담당 수업 · 동아리가 있으면 여기서 골라요</p>
              <ButtonLink href="/teacher/subjects">내 수업 정하기</ButtonLink>
            </div>
          </Card>
        </PageBody>
      </>
    );
  }
  const scope = scopes.find((s) => s.key === q.scope) ?? scopes[0];
  const term = parseTerm(q.term, semesterOf());
  const reports = (await loadReports(v, scope, term)) ?? [];
  const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" }).format(new Date());

  return (
    <>
      <PageHeader title="학생 리포트" actions={reports.length ? <PrintButton count={reports.length} className="hidden md:inline-flex" /> : undefined} />
      <PageBody>
    <ReportBoard
      scopes={scopes.map(({ key, kind, label, count }) => ({ key, kind, label, count }))}
      scope={scope.key}
      kind={scope.kind}
      term={term}
      items={parseItems(q.items, scope.kind)}
      reports={reports}
      head={`학생 리포트 · ${schoolYear()}학년도 ${TERM_LABEL(term)}`}
      byLine={`${ROLE_WORD[scope.kind]} ${v.teacher.name} · ${date}`}
      nowTerm={semesterOf()}
      aiOn={aiEnabled()}
    />
      </PageBody>
    </>
  );
}
