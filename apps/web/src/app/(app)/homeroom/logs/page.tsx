import { redirect } from "next/navigation";
import { PencilLine } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/ui";
import { homeroomStudents, today } from "@/lib/domain/activity";
import { makeStudentNo } from "@/lib/domain/roster";
import { recentPieces } from "@/lib/domain/collect";
import { repo } from "@/lib/server/repo";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireCan } from "@/lib/server/viewer";
import { CollectBoard } from "@/components/writing/collect-board";
import { classScope } from "@/lib/domain/common-activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { commonActivityRows } from "@/lib/server/common-activity";
import { lessonView } from "@/lib/server/lessons";
import { ClassMaterials } from "@/components/writing/class-materials";

export const metadata = { title: "누가기록 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ area?: string; student?: string }> };

const AREAS = [{ value: "자율·자치", label: "자율·자치" }, { value: "진로", label: "진로" }];

// 담임 · 누가기록 (Figma N52 — 담임의 조각 모으기): 같은 조각 남기기 카드, 반 탭 없음, 받는 학생 = 우리 반.
// 남길 때 영역(자율·자치 | 진로)을 고른다. 남긴 누가기록은 행발 · 자율·자치 · 진로 글 짓기 왼쪽 칸에 "누가기록"으로 들어간다.
export default async function HomeroomLogsPage({ searchParams }: Props) {
  const v = await requireCan("logs.write");
  if (v.kind !== "teacher" || !v.teacher.homeroom) redirect("/teacher/club/collect");
  const q = await searchParams;
  const students = homeroomStudents(v, await repo.listStudents());
  const ids = students.map((s) => s.id);
  const logs = (await Promise.all(AREAS.map((a) => repo.listActivityLogs(a.value as "자율·자치" | "진로", ids)))).flat();
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const first = AREAS.find((a) => a.value === q.area) ?? AREAS[0];
  const areas = [first, ...AREAS.filter((a) => a !== first)];
  // 공통 활동 · 차시별 활동 (N26 · N43): 주소의 영역(처음은 자율·자치) 반 단위 카드 — 글 짓기 아래와 같은 카드
  const h = v.teacher.homeroom;
  const commonKey = classScope(first.value as "자율·자치" | "진로", h.grade, h.classNo);
  const [commonRows, lesson] = await Promise.all([commonActivityRows(commonKey, ids), lessonView(commonKey, students, `${h.grade}학년 ${h.classNo}반 ${first.value}`)]);

  return (
    <>
      <PageHeader title="누가기록" actions={<>
        <ButtonLink href={`/teacher/logs?area=${encodeURIComponent(first.value)}`} kind="outline" size="sm" className="hidden md:inline-flex">여러 명 따로 쓰기</ButtonLink>
        <ButtonLink href={q.student ? `/homeroom/compose?student=${q.student}` : "/homeroom/compose"} kind="outline" size="sm"><PencilLine size={14} /> 글 짓기</ButtonLink>
      </>} />
      <PageBody>
        <ClassMaterials year={schoolYear()} lesson={lesson} common={{ scope: commonKey, rows: commonRows, detailBase: "/teacher/write/activity", today: today() }} />
        <CollectBoard
          target={{ kind: "log", area: first.value }}
          areas={areas}
          students={students.map((s) => ({ id: s.id, no: makeStudentNo(s.grade, s.classNo, s.number), name: s.name, count: logs.filter((l) => l.studentId === s.id).length }))}
          recent={recentPieces(logs.map((l) => ({ studentId: l.studentId, date: l.date, content: l.content })), (id) => nameOf.get(id))}
          composeHref="/homeroom/compose?tab=behavior"
          today={today()}
          withDate
          preselect={q.student ? [q.student] : []}
          aiOn={aiEnabled()}
        />
      </PageBody>
    </>
  );
}
