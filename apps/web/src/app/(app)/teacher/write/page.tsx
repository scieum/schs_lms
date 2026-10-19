import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Download } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, ButtonLink, Card, Segmented, StatTiles, Tag, cx } from "@/components/ui";
import { areasFor, homeroomStudents } from "@/lib/domain/activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { NEIS_MAX_BYTES } from "@/lib/domain/length";
import { latestByStudent, statusLabel, studentsInCourse } from "@/lib/domain/setuk";
import type { Student, Viewer } from "@/lib/domain/types";
import { isRecordArea, latestRecordByStudent, RECORD_LABEL, RECORD_MAX_BYTES, recordStatus, type RecordArea } from "@/lib/domain/writing";
import { repo } from "@/lib/server/repo";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireCan } from "@/lib/server/viewer";
import { evidenceLogs } from "./data";
import { RecordWorkspace } from "./workspace";
import { classScope, clubScope } from "@/lib/domain/common-activity";
import { seoulNow } from "@/lib/domain/night";
import { commonActivityRows } from "@/lib/server/common-activity";
import { CommonActivitiesCard } from "@/components/writing/common-activities-card";

export const metadata = { title: "AI 기록 쓰기 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ area?: string; club?: string; student?: string }> };

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
    out.push({ key: "setuk", title: "교과 세특", sub: myCourses.map((x) => x.subject).join("·"), href: "/teacher/setuk", limit: limitLabel(NEIS_MAX_BYTES["세특"]), counts: c });
  }

  // 동아리 특기사항: 내가 지도하는 동아리마다
  for (const club of clubs.filter((c) => c.advisorId === v.accountId)) {
    const ids = new Set(await repo.listClubMembers(club.id));
    const members = all.filter((s) => ids.has(s.id));
    out.push({
      key: `club-${club.id}`, title: RECORD_LABEL.동아리, sub: club.name,
      href: `/teacher/write?area=${encodeURIComponent("동아리")}&club=${club.id}`, limit: limitLabel(RECORD_MAX_BYTES.동아리), counts: await recordCounts("동아리", members),
    });
  }

  // 담임: 자율·자치·진로 특기사항 + 행발
  const h = v.teacher.homeroom;
  if (h) {
    const kids = homeroomStudents(v, all);
    const cls = `${h.grade}학년 ${h.classNo}반`;
    for (const area of ["자율·자치", "진로"] as const) {
      out.push({ key: area, title: RECORD_LABEL[area], sub: cls, href: `/teacher/write?area=${encodeURIComponent(area)}`, limit: limitLabel(RECORD_MAX_BYTES[area]), counts: await recordCounts(area, kids) });
    }
    out.push({ key: "행발", title: RECORD_LABEL.행발, sub: cls, href: "/homeroom/behavior", limit: limitLabel(RECORD_MAX_BYTES.행발), counts: await recordCounts("행발", kids) });
  }
  return out;
}

export default async function WritePage({ searchParams }: Props) {
  const v = await requireCan("record.write");
  const q = await searchParams;
  if (q.area === "행발") redirect("/homeroom/behavior");
  if (isRecordArea(q.area) && q.area !== "행발") return <AreaWorkspace v={v} area={q.area} clubId={q.club} studentId={q.student} />;

  const spaces = await spacesFor(v);
  const sum = spaces.reduce((a, s) => ({ 확정: a.확정 + s.counts.확정, "작성 중": a["작성 중"] + s.counts["작성 중"], 미작성: a.미작성 + s.counts.미작성 }), { 확정: 0, "작성 중": 0, 미작성: 0 });

  return (
    <>
      <PageHeader title="AI 기록 쓰기" actions={<ButtonLink href="/teacher/logs" kind="outline" size="sm">누가기록</ButtonLink>} />
      <PageBody>
        <StatTiles items={[["쓸 기록", `${spaces.length}곳`], ["확정", `${sum.확정}건`], ["작성 중", `${sum["작성 중"]}건`], ["미작성", `${sum.미작성}건`]]} />
        <AiBanner title="AI 초안" label={aiEnabled() ? "AI" : "자동"} line="조각을 모으고 합치거나 메모로 초안을 만들고, 선생님이 고쳐서 확정해요" />
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

/** 창체 특기사항 작업 화면: 동아리(내 동아리 부원) · 자율·자치/진로(우리 반) */
async function AreaWorkspace({ v, area, clubId, studentId }: { v: Viewer; area: Exclude<RecordArea, "행발">; clubId?: string; studentId?: string }) {
  const areas = areasFor(v);
  if (!areas.includes(area)) redirect("/teacher/write");
  const myClubs = (await repo.listClubs(schoolYear())).filter((c) => c.advisorId === v.accountId);
  const club = area === "동아리" ? myClubs.find((c) => c.id === clubId) ?? myClubs[0] : undefined;

  const all = await repo.listStudents();
  let students: Student[] = [];
  if (area === "동아리" && club) {
    const ids = new Set(await repo.listClubMembers(club.id));
    students = all.filter((s) => ids.has(s.id)).sort((a, b) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number);
  } else if (area !== "동아리") {
    students = homeroomStudents(v, all);
  }
  const ids = students.map((s) => s.id);
  const [drafts, memos, logs] = await Promise.all([
    repo.listRecordDrafts({ area, year: schoolYear(), studentIds: ids }),
    repo.listRecordMemos(area, ids),
    evidenceLogs(area, ids, club?.id),
  ]);
  const latest = latestRecordByStudent(drafts);
  const counts = { 확정: 0, "작성 중": 0, 미작성: 0 };
  for (const s of students) counts[recordStatus(latest.get(s.id))]++;
  const base = `/teacher/write?area=${encodeURIComponent(area)}${club ? `&club=${club.id}` : ""}`;
  const writable = areas.filter((a) => a !== "동아리" || myClubs.length);
  // 공통 활동 (Figma N26): 동아리는 그 동아리, 자율·자치·진로는 담임 반
  const h = v.kind === "teacher" ? v.teacher.homeroom : null;
  const commonKey = area === "동아리" ? (club ? clubScope(club.id) : null) : h ? classScope(area, h.grade, h.classNo) : null;
  const commonRows = commonKey && students.length ? await commonActivityRows(commonKey, ids) : [];

  return (
    <>
      <PageHeader
        title={RECORD_LABEL[area]}
        actions={
          <>
            <ButtonLink href="/teacher/write" kind="outline" size="sm">기록 쓰기</ButtonLink>
            {/* 일반 a 태그: 미리 불러오기로 내보내기가 실행되지 않게 */}
            <a
              href={`/teacher/write/export?area=${encodeURIComponent(area)}${club ? `&club=${club.id}` : ""}`}
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
        {writable.length > 1 && (
          <Segmented active={writable.indexOf(area)} items={writable.map((a) => ({ label: a, href: `/teacher/write?area=${encodeURIComponent(a)}` }))} />
        )}
        {area === "동아리" && myClubs.length > 1 && club && (
          <Segmented active={myClubs.indexOf(club)} items={myClubs.map((c) => ({ label: c.name, href: `/teacher/write?area=${encodeURIComponent("동아리")}&club=${c.id}` }))} />
        )}
        <StatTiles items={[["학생", `${students.length}명`], ["확정", `${counts.확정}명`], ["작성 중", `${counts["작성 중"]}명`], ["미작성", `${counts.미작성}명`]]} />
        {commonKey && students.length > 0 && <CommonActivitiesCard scope={commonKey} rows={commonRows} detailBase="/teacher/write/activity" today={seoulNow().date} />}
        <AiBanner title="AI 특기사항 초안" line="쌓인 누가기록과 관찰 메모로 초안을 만들어요. 확정은 선생님이 해요" />
        {area === "동아리" && !club ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">지도하는 동아리가 없어요</p>
              <ButtonLink href="/teacher/club">동아리 만들기</ButtonLink>
            </div>
          </Card>
        ) : (
          <RecordWorkspace
            area={area}
            listTitle={club ? `${club.name} ${students.length}` : `우리 반 ${students.length}`}
            students={students}
            selectedId={studentId}
            drafts={drafts}
            memos={memos}
            logs={logs}
            clubId={club?.id}
            href={(id) => `${base}&student=${id}`}
          />
        )}
      </PageBody>
    </>
  );
}
