import { Download } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, ButtonLink, Card, StatTiles, cx } from "@/components/ui";
import { homeroomStudents } from "@/lib/domain/activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { latestRecordByStudent, recordStatus } from "@/lib/domain/writing";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { evidenceLogs } from "@/app/(app)/teacher/write/data";
import { RecordWorkspace } from "@/app/(app)/teacher/write/workspace";
import { classScope } from "@/lib/domain/common-activity";
import { seoulNow } from "@/lib/domain/night";
import { commonActivityRows } from "@/lib/server/common-activity";
import { CommonActivitiesCard } from "@/components/writing/common-activities-card";

export const metadata = { title: "행동특성 및 종합의견 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ student?: string }> };

// 행발: 담임 반 학생별. 담임 관찰 키워드 + 누가기록 → AI 초안 → 수정 → 저장(새 버전) → 확정
export default async function BehaviorPage({ searchParams }: Props) {
  const v = await requireCan("record.write");
  const q = await searchParams;
  const h = v.kind === "teacher" ? v.teacher.homeroom : null;

  if (!h) {
    return (
      <>
        <PageHeader title="행동특성 및 종합의견" />
        <PageBody>
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">담임 반이 있어야 쓸 수 있어요</p>
              <ButtonLink href="/teacher/write" kind="outline">기록 쓰기로</ButtonLink>
            </div>
          </Card>
        </PageBody>
      </>
    );
  }

  const students = homeroomStudents(v, await repo.listStudents());
  const ids = students.map((s) => s.id);
  const [drafts, memos, logs] = await Promise.all([
    repo.listRecordDrafts({ area: "행발", year: schoolYear(), studentIds: ids }),
    repo.listRecordMemos("행발", ids),
    evidenceLogs("행발", ids),
  ]);
  const latest = latestRecordByStudent(drafts);
  const commonKey = classScope("행발", h.grade, h.classNo);
  const commonRows = students.length ? await commonActivityRows(commonKey, ids) : [];
  const counts = { 확정: 0, "작성 중": 0, 미작성: 0 };
  for (const s of students) counts[recordStatus(latest.get(s.id))]++;

  return (
    <>
      <PageHeader
        title="행동특성 및 종합의견"
        actions={
          <>
            <ButtonLink href="/teacher/write" kind="outline" size="sm">기록 쓰기</ButtonLink>
            {/* 일반 a 태그: 미리 불러오기로 내보내기가 실행되지 않게 */}
            <a
              href={`/teacher/write/export?area=${encodeURIComponent("행발")}`}
              download
              aria-disabled={counts.확정 === 0}
              className={cx("inline-flex items-center gap-1.5 rounded-control px-3.5 py-2 text-[13px] font-medium", counts.확정 ? "border border-hair bg-white text-ink hover:bg-soft" : "pointer-events-none border border-hair bg-white text-faint")}
            >
              <Download size={14} /> 나이스로 내보내기
            </a>
          </>
        }
      />
      <PageBody>
        <StatTiles items={[["우리 반", `${students.length}명`], ["확정", `${counts.확정}명`], ["작성 중", `${counts["작성 중"]}명`], ["미작성", `${counts.미작성}명`]]} />
        {students.length > 0 && <CommonActivitiesCard scope={commonKey} rows={commonRows} detailBase="/teacher/write/activity" today={seoulNow().date} />}
        <AiBanner title="AI 행발 초안" line="담임 관찰 키워드와 누가기록으로 초안을 만들어요. 확정은 선생님이 해요" />
        <RecordWorkspace
          area="행발"
          listTitle={`${h.grade}학년 ${h.classNo}반 ${students.length}`}
          students={students}
          selectedId={q.student}
          drafts={drafts}
          memos={memos}
          logs={logs}
          href={(id) => `/homeroom/behavior?student=${id}`}
        />
      </PageBody>
    </>
  );
}
