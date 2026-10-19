import { Download } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, ButtonLink, Card, Segmented, StatTiles, cx } from "@/components/ui";
import { measure, neisMax, UNIT_LABEL } from "@/lib/domain/length";
import { latestByStudent, statusLabel, studentsInCourse } from "@/lib/domain/setuk";
import { latestMemoByStudent } from "@/lib/domain/writing";
import { commonSiblings, schoolYear, type Course } from "@/lib/domain/curriculum";
import { neisBytes } from "@/lib/domain/length";
import { repo } from "@/lib/server/repo";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireCan } from "@/lib/server/viewer";
import { SetukEditor } from "./editor";
import { makeStudentNo } from "@/lib/domain/roster";
import { setukScope } from "@/lib/domain/common-activity";
import { seoulNow } from "@/lib/domain/night";
import { commonActivityRows } from "@/lib/server/common-activity";
import { CommonActivitiesCard } from "@/components/writing/common-activities-card";
import { similarCount, similarPairs } from "@/lib/domain/similar";
import { SetukStudentList } from "./student-list";
import { WorkspaceGrid, WorkspaceProvider } from "@/components/writing/workspace";
import { ClassCheckPanel } from "@/components/writing/class-check-panel";
import { ClassActionsBar } from "@/components/writing/class-actions-bar";
import { ClassWritePanel } from "@/components/writing/class-write-panel";
import { LibraryPanel } from "@/components/writing/library-panel";
import { LibrarySaveProvider } from "@/components/writing/library-save";
import { LevelsProvider } from "@/components/writing/level-picker";
import { piecesPool, provView } from "@/lib/server/provenance";
import { listMemosWithPieces, memoPieces } from "@/lib/server/merge-pieces";
import { GuideBookButton } from "@/components/writing/guide-panel";
import { GuideStepLinks } from "@/components/writing/guide-step-links";
import { LessonPlanCard } from "@/components/writing/lesson-plan-card";
import { lessonView } from "@/lib/server/lessons";

export const metadata = { title: "교과 세특 · 속초고등학교 학생관리시스템" };
/** 반 전체 글 쓰기 (N42): 학생 한 명 Sonnet 쓰기 ~10~25초 */
export const maxDuration = 60;

type Props = { searchParams: Promise<{ course?: string; section?: string; student?: string; check?: string }> };

const short = (c: Course) => `${c.subject} ${c.grade}-${c.semester}`;

export default async function SetukPage({ searchParams }: Props) {
  const v = await requireCan("setuk.write");
  const q = await searchParams;
  const [mine, offered, rosters] = await Promise.all([repo.listTeacherCourses(v.accountId), repo.listCourses(schoolYear()), repo.listCourseRosters(v.accountId)]);
  const myCourses = offered.filter((c) => mine.some((a) => a.courseId === c.id));

  if (myCourses.length === 0) {
    return (
      <>
        <PageHeader title="교과 세특" />
        <PageBody>
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">담당 과목이 아직 없어요</p>
              <p className="text-sm text-sub">내 교과와 과목, 맡은 반을 먼저 골라 주세요</p>
              <ButtonLink href="/teacher/subjects">내 수업 정하기</ButtonLink>
            </div>
          </Card>
        </PageBody>
      </>
    );
  }

  const allStudents = await repo.listStudents();
  // 탭: 고정반 과목은 과목 하나, 이동반 과목은 분반마다 하나 (Figma N4 185:1666)
  const tabs = myCourses.flatMap((c) => {
    const a = mine.find((x) => x.courseId === c.id)!;
    const rs = rosters.filter((r) => r.courseId === c.id);
    if (a.mode === "moving" && a.sections?.length) {
      return a.sections.map((sec) => ({ course: c, section: sec as string | null, label: `${c.subject} ${sec} · ${studentsInCourse(allStudents, c, a, rs, sec).length}명` }));
    }
    return [{ course: c, section: null as string | null, label: `${short(c)} · ${a.classes.join(", ")}반` }];
  });
  const tab = tabs.find((t) => t.course.id === q.course && (t.section ?? "") === (q.section ?? "")) ?? tabs.find((t) => t.course.id === q.course) ?? tabs[0];
  const course = tab.course;
  const assignment = mine.find((a) => a.courseId === course.id);
  const records = await repo.listSetuk(course.id);
  const students = studentsInCourse(allStudents, course, assignment, rosters.filter((r) => r.courseId === course.id), tab.section);
  const latest = latestByStudent(records);
  const selected = students.find((s) => s.id === q.student) ?? students.find((s) => statusLabel(latest.get(s.id)) !== "확정") ?? students[0];
  // 공통과목(2022 개정)은 1·2학기 세특을 합쳐 1,500바이트 — 다른 학기에 쓴 분량만큼 이 학기 한도가 줄어든다
  const siblings = commonSiblings(course, offered);
  const otherBytes = siblings.length && selected
    ? (await Promise.all(siblings.map(async (sib) => latestByStudent(await repo.listSetuk(sib.id)).get(selected.id)?.content ?? "")))
        .reduce((n, t) => n + neisBytes(t), 0)
    : 0;
  const shared = siblings.length ? { other: siblings[0].semester, bytes: otherBytes } : undefined;
  const counts = { 확정: 0, "작성 중": 0, 미작성: 0 };
  for (const s of students) counts[statusLabel(latest.get(s.id))]++;
  const cur = selected ? latest.get(selected.id) : undefined;
  const memo = selected ? latestMemoByStudent(await repo.listRecordMemos(`세특:${course.id}`, [selected.id])).get(selected.id) : undefined;
  const commonScopeKey = setukScope(course.id, tab.section);
  const commonRows = students.length ? await commonActivityRows(commonScopeKey, students.map((s) => s.id)) : [];
  const sec = tab.section ? `&section=${encodeURIComponent(tab.section)}` : "";
  const href = (studentId?: string) => `/teacher/setuk?course=${course.id}${sec}${studentId ? `&student=${studentId}` : ""}`;
  // 비슷한 문장 (Figma N34 ④): 분반 학생들의 최신 세특끼리 여섯 어절 넘게 겹친 곳 (규칙, AI 없음). 공통 활동 글은 빼고 센다
  const commonList = students.length ? await repo.listCommonActivities(commonScopeKey) : [];
  const commonPieces = commonList.length ? await repo.listCommonActivityPieces(commonList.map((a) => a.id)) : [];
  const ignore = [...commonList.map((a) => a.description), ...commonPieces.map((p) => p.content)].filter((t) => t.trim());
  const texts = students.map((s) => ({ id: s.id, text: latest.get(s.id)?.content ?? "" })).filter((x) => x.text.trim());
  const pairs = similarPairs(texts, { ignore });
  const byId = new Map(students.map((s) => [s.id, s]));
  // 성취수준 (N35 ③): 학교 설정 단계 + 이 과목·학기 학생별 수준
  const [scale, levelMap] = await Promise.all([repo.getAchievementScale(), repo.listLevels({ courseId: course.id, year: schoolYear(), semester: course.semester }, students.map((s) => s.id))]);
  const levels = Object.fromEntries(students.map((s) => [s.id, levelMap[s.id] ?? null]));
  // N38: AI 원안 · 교사가 정한 문장 · 근거 표 (원안이 없는 글은 근거 · 원안 비교 · 수정 칩이 숨는다)
  const [pv, pool, provSettings] = selected
    ? await Promise.all([provView(cur), listMemosWithPieces(`세특:${course.id}`, [selected.id]).then((m) => piecesPool(memoPieces(m), course.subject)), repo.getProvenanceSettings()])
    : [{ original: null, pins: [] }, [], await repo.getProvenanceSettings()];
  const listTitle = tab.section ? `${course.subject} ${tab.section}` : `${course.subject} · ${assignment?.classes.join("·")}반`;
  // 차시별 활동 메뉴 (N43 ②): 이 분반 수업 계획 · 학생별 남긴 차시
  const lesson = await lessonView(commonScopeKey, students, tab.section ? `${course.subject} ${tab.section}` : course.subject);
  const stepOf = (id: string, d: number) => { const o = students[students.findIndex((s) => s.id === id) + d]; return o ? href(o.id) : undefined; };
  const peersOf = (id: string) => pairs.filter((p) => p.a === id || p.b === id).map((p) => (p.a === id ? p.b : p.a));

  return (
    <>
      <PageHeader
        title="교과 세특"
        actions={
          <>
            <ButtonLink href="/teacher/subjects" kind="outline" size="sm">내 과목</ButtonLink>
            {/* 일반 a 태그: 미리 불러오기(prefetch)로 내보내기가 실행되지 않게 */}
            <a
              href={`/teacher/setuk/export?course=${course.id}${sec}`}
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
        {tabs.length > 1 && (
          <Segmented active={tabs.indexOf(tab)} items={tabs.map((t) => ({ label: t.label, href: `/teacher/setuk?course=${t.course.id}${t.section ? `&section=${encodeURIComponent(t.section)}` : ""}` }))} />
        )}
        {assignment?.mode === "moving" && students.length === 0 && (
          <p className="rounded-inner bg-wait-soft px-4 py-3 text-[13px] text-[#9a6400]">이 분반 명단이 아직 없어요. 내 수업 → 이동반 명단에서 양식 명단을 올려 주세요</p>
        )}
        <StatTiles items={[["학생", `${students.length}명`], ["확정", `${counts.확정}명`], ["작성 중", `${counts["작성 중"]}명`], ["미작성", `${counts.미작성}명`]]} />
        {lesson && <LessonPlanCard view={lesson} year={schoolYear()} />}
        {students.length > 0 && <CommonActivitiesCard scope={commonScopeKey} rows={commonRows} detailBase="/teacher/setuk/activity" today={seoulNow().date} lessons={lesson?.items} />}
        <AiBanner title="AI로 세특 쓰기" label={aiEnabled() ? "AI" : "자동"} line="활동 메모를 남기고 AI로 글 쓰기를 누르면 세특 글이 채워져요. 고치고 확정은 선생님이 해요" />

        {students.length === 0 ? (
          <Card>
            <p className="py-6 text-center text-sm text-mute">이 과목에 맡은 반 학생이 없어요. 내 과목에서 반을 확인해 주세요</p>
          </Card>
        ) : (
          <WorkspaceProvider key={`${course.id}-${tab.section ?? ""}`} scope={{ kind: "setuk", courseId: course.id, section: tab.section }}>
            <LevelsProvider courseId={course.id} scale={scale} initial={levels}>
              <ClassActionsBar title={listTitle} total={students.length} counts={{ confirmed: counts.확정, draft: counts["작성 중"], empty: counts.미작성 }} />
              <WorkspaceGrid
                kind="setuk"
                checkPanel={<ClassCheckPanel />}
                libraryPanel={<LibraryPanel />}
                writePanel={<ClassWritePanel hrefBase={`/teacher/setuk?course=${course.id}${sec}`} word="세특 글" />}
                list={
                  <Card title={listTitle} action={<span className="text-[12px] text-mute">{tab.section ? "이동반 · " : ""}{students.length}명</span>}>
                    <SetukStudentList title={listTitle} items={students.map((s) => ({
                      id: s.id, no: makeStudentNo(s.grade, s.classNo, s.number), name: s.name, status: statusLabel(latest.get(s.id)),
                      href: href(s.id), similar: similarCount(pairs, s.id), on: s.id === selected?.id,
                    }))} />
                  </Card>
                }
                main={selected && (
                  <Card
                    title={`${selected.name} · ${selected.classNo}반 ${selected.number}번`}
                    action={
                      <span className="flex items-center gap-2">
                        {cur && <span className="hidden text-[13px] text-mute sm:inline">{new Date(cur.createdAt).toLocaleDateString("ko-KR")} 저장</span>}
                        {/* N43: 기재요령 패널이 열리면 학생 목록 대신 이전 · 다음 */}
                        <GuideStepLinks prev={stepOf(selected.id, -1)} next={stepOf(selected.id, 1)} />
                        <GuideBookButton area="세특" />
                      </span>
                    }
                  >
                    <LibrarySaveProvider area="세특" subject={course.subject} studentId={selected.id} who={{ name: selected.name, studentNo: selected.studentNo }}>
                      <SetukEditor
                        shared={shared}
                        key={`${course.id}-${selected.id}`}
                        courseId={course.id}
                        studentId={selected.id}
                        initial={cur?.content ?? ""}
                        unit={cur?.unit ?? "bytes"}
                        max={cur?.max ?? neisMax("세특", "bytes")}
                        confirmed={cur?.status === "confirmed"}
                        who={{ name: selected.name, studentNo: selected.studentNo, grade: selected.grade, classNo: selected.classNo, number: selected.number }}
                        memo={memo?.content ?? ""}
                        subject={course.subject}
                        openCheck={q.check === "1" && q.student === selected.id}
                        lesson={lesson}
                        prov={{ original: pv.original, pins: pv.pins, pool, editRatioMin: provSettings.editRatioMin, who: selected.name }}
                        similar={{
                          self: { id: selected.id, name: selected.name, no: makeStudentNo(selected.grade, selected.classNo, selected.number), href: href(selected.id) },
                          peers: peersOf(selected.id).map((id) => byId.get(id)!).filter(Boolean).map((p) => ({
                            id: p.id, name: p.name, no: makeStudentNo(p.grade, p.classNo, p.number), text: latest.get(p.id)?.content ?? "", href: href(p.id),
                          })),
                          ignore,
                        }}
                      />
                    </LibrarySaveProvider>
                    {cur && (
                      <p className="mt-3 text-[12px] text-mute">
                        지난 저장 {measure(cur.content, cur.unit).toLocaleString()}{UNIT_LABEL[cur.unit]} · 버전 {records.filter((r) => r.studentId === selected.id).length}
                      </p>
                    )}
                  </Card>
                )}
              />
            </LevelsProvider>
          </WorkspaceProvider>
        )}
      </PageBody>
    </>
  );
}
