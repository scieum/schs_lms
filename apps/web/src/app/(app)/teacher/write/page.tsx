import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, ButtonLink, Card, StatTiles, Tag } from "@/components/ui";
import { homeroomStudents } from "@/lib/domain/activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { NEIS_MAX_BYTES } from "@/lib/domain/length";
import { latestByStudent, statusLabel, studentsInCourse } from "@/lib/domain/setuk";
import type { Student, Viewer } from "@/lib/domain/types";
import { latestRecordByStudent, RECORD_LABEL, RECORD_MAX_BYTES, recordStatus, type RecordArea } from "@/lib/domain/writing";
import { writeRedirect } from "@/lib/domain/compose";
import { repo } from "@/lib/server/repo";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireCan } from "@/lib/server/viewer";

export const metadata = { title: "AI 기록 쓰기 · 속초고등학교 학생관리시스템" };
/** 반 전체 글 쓰기 (N42) */
export const maxDuration = 60;

type Props = { searchParams: Promise<Record<string, string | undefined>> };

type Counts = { total: number; 확정: number; "작성 중": number; 미작성: number };
type Space = { key: string; title: string; sub: string; href: string; limit: string; counts: Counts };

const blank = (): Counts => ({ total: 0, 확정: 0, "작성 중": 0, 미작성: 0 });

async function recordCounts(area: RecordArea, students: Student[]): Promise<Counts> {
  const latest = latestRecordByStudent(await repo.listRecordDrafts({ area, year: schoolYear(), studentIds: students.map((s) => s.id) }));
  const c = blank();
  for (const s of students) {
    c.total++;
    c[recordStatus(latest.get(s.id))]++;
  }
  return c;
}

const limitLabel = (bytes: number) => `NEIS ${Math.floor(bytes / 3)}자`;

/** 이 교사가 쓸 수 있는 기록 공간과 작성 현황 */
async function spacesFor(v: Viewer): Promise<Space[]> {
  if (v.kind !== "teacher") return [];
  const y = schoolYear();
  const [mine, offered, clubs, all, rosters] = await Promise.all([repo.listTeacherCourses(v.accountId), repo.listCourses(y), repo.listClubs(y), repo.listStudents(), repo.listCourseRosters(v.accountId)]);
  const out: Space[] = [];

  // 교과 세특: 내 과목 전체
  const myCourses = offered.filter((c) => mine.some((a) => a.courseId === c.id));
  if (myCourses.length) {
    const c = blank();
    for (const course of myCourses) {
      const latest = latestByStudent(await repo.listSetuk(course.id));
      for (const s of studentsInCourse(all, course, mine.find((a) => a.courseId === course.id), rosters.filter((r) => r.courseId === course.id))) {
        c.total++;
        c[statusLabel(latest.get(s.id))]++;
      }
    }
    out.push({ key: "setuk", title: "교과 세특", sub: myCourses.map((x) => x.subject).join("·"), href: "/teacher/setuk/compose", limit: limitLabel(NEIS_MAX_BYTES["세특"]), counts: c });
  }

  // 동아리 특기사항: 내가 지도하는 동아리마다
  for (const club of clubs.filter((c) => c.advisorId === v.accountId)) {
    const ids = new Set(await repo.listClubMembers(club.id));
    const members = all.filter((s) => ids.has(s.id));
    out.push({
      key: `club-${club.id}`, title: RECORD_LABEL.동아리, sub: club.name,
      href: `/teacher/club/compose?club=${club.id}`, limit: limitLabel(RECORD_MAX_BYTES.동아리), counts: await recordCounts("동아리", members),
    });
  }

  // 담임: 자율·자치·진로 특기사항 + 행발
  const h = v.teacher.homeroom;
  if (h) {
    const kids = homeroomStudents(v, all);
    const cls = `${h.grade}학년 ${h.classNo}반`;
    for (const area of ["자율·자치", "진로"] as const) {
      out.push({ key: area, title: RECORD_LABEL[area], sub: cls, href: `/homeroom/compose?tab=${area === "진로" ? "career" : "autonomy"}`, limit: limitLabel(RECORD_MAX_BYTES[area]), counts: await recordCounts(area, kids) });
    }
    out.push({ key: "행발", title: RECORD_LABEL.행발, sub: cls, href: "/homeroom/compose?tab=behavior", limit: limitLabel(RECORD_MAX_BYTES.행발), counts: await recordCounts("행발", kids) });
  }
  return out;
}

export default async function WritePage({ searchParams }: Props) {
  const v = await requireCan("record.write");
  const q = await searchParams;
  // N52: 영역 작업 화면은 글 짓기로 넘긴다 (쿼리 그대로) — 동아리 → /teacher/club/compose · 자율·자치 · 진로 · 행발 → /homeroom/compose?tab=
  const to = writeRedirect(q);
  if (to) redirect(to);

  const spaces = await spacesFor(v);
  const sum = spaces.reduce((a, s) => ({ 확정: a.확정 + s.counts.확정, "작성 중": a["작성 중"] + s.counts["작성 중"], 미작성: a.미작성 + s.counts.미작성 }), { 확정: 0, "작성 중": 0, 미작성: 0 });

  return (
    <>
      <PageHeader title="AI 기록 쓰기" actions={<ButtonLink href="/teacher/logs" kind="outline" size="sm">누가기록</ButtonLink>} />
      <PageBody>
        <StatTiles items={[["쓸 기록", `${spaces.length}곳`], ["확정", `${sum.확정}건`], ["작성 중", `${sum["작성 중"]}건`], ["미작성", `${sum.미작성}건`]]} />
        <AiBanner title="AI로 쓰기" label={aiEnabled() ? "AI" : "자동"} line="활동 메모를 남기고 AI로 글 쓰기를 누르면 글이 채워져요. 고치고 확정은 선생님이 해요" />
        {spaces.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">쓸 수 있는 기록이 아직 없어요</p>
              <p className="text-sm text-sub">담당 과목을 고르거나 동아리를 만들면 여기에 나타나요</p>
              <div className="flex gap-2">
                <ButtonLink href="/teacher/subjects" kind="outline">내 과목</ButtonLink>
                <ButtonLink href="/teacher/club">동아리 만들기</ButtonLink>
              </div>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {spaces.map((s) => {
              const pct = s.counts.total ? Math.round((s.counts.확정 / s.counts.total) * 100) : 0;
              return (
                <Link key={s.key} href={s.href} className="group flex flex-col gap-4 surface rounded-card p-5 hover:bg-line md:p-6">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[17px] font-bold">{s.title}</div>
                      <div className="truncate text-[13px] text-mute">{s.sub} · {s.limit}</div>
                    </div>
                    <ChevronRight size={18} className="mt-1 text-mute group-hover:text-ink" />
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-[28px] font-bold leading-none">{s.counts.확정}</span>
                    <span className="pb-0.5 text-sm text-mute">/ {s.counts.total}명 확정</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                    <div className="h-full rounded-full bg-key" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.counts["작성 중"] > 0 && <Tag tone="bg-wait-soft text-wait">{`작성 중 ${s.counts["작성 중"]}`}</Tag>}
                    {s.counts.미작성 > 0 && <Tag tone="bg-white text-mute">{`미작성 ${s.counts.미작성}`}</Tag>}
                    {s.counts.total > 0 && s.counts.확정 === s.counts.total && <Tag>모두 확정</Tag>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </PageBody>
    </>
  );
}
