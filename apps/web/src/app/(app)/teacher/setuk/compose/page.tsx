import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card } from "@/components/ui";
import { neisBytes, neisMax } from "@/lib/domain/length";
import { latestByStudent, statusLabel, studentsInCourse } from "@/lib/domain/setuk";
import { commonSiblings, schoolYear, type Course } from "@/lib/domain/curriculum";
import { firstStudent } from "@/lib/domain/compose";
import { setukScope } from "@/lib/domain/common-activity";
import { seoulNow } from "@/lib/domain/night";
import { similarPairs } from "@/lib/domain/similar";
import { repo } from "@/lib/server/repo";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireCan } from "@/lib/server/viewer";
import { piecesPool, provView } from "@/lib/server/provenance";
import { listMemosWithPieces, memoPieces } from "@/lib/server/merge-pieces";
import { WorkspaceProvider } from "@/components/writing/workspace";
import { ClassCheckPanel } from "@/components/writing/class-check-panel";
import { ClassWritePanel } from "@/components/writing/class-write-panel";
import { LibraryPanel } from "@/components/writing/library-panel";
import { LibrarySaveProvider } from "@/components/writing/library-save";
import { LevelsProvider } from "@/components/writing/level-picker";
import { ComposePanels } from "@/components/writing/compose-workspace";
import { SetukCompose } from "@/components/writing/compose-adapters";

export const metadata = { title: "세특 글 짓기 · 속초고 쌤기부" };
/** 반 전체 글 쓰기 (N42): 학생 한 명 Sonnet 쓰기 ~10~25초 */
export const maxDuration = 60;

type Props = { searchParams: Promise<{ course?: string; section?: string; student?: string; check?: string; mode?: string }> };

const short = (c: Course) => `${c.subject} ${c.grade}-${c.semester}`;

// 세특 · 글 짓기 (Figma N52 (b) 598:15582 · (c) 598:16109 · (g1) 598:17238): 분반 · 학생 한 명씩. 주소는 id만 (C3).
// 데이터는 옛 /teacher/setuk 화면과 같다 — 공통과목 합산 · AI 원안 · 성취수준 · 비슷한 문장 · 차시 · 공통 활동.
export default async function SetukComposePage({ searchParams }: Props) {
  const v = await requireCan("setuk.write");
  const q = await searchParams;
  const [mine, offered, rosters] = await Promise.all([repo.listTeacherCourses(v.accountId), repo.listCourses(schoolYear(), { joint: true }), repo.listCourseRosters(v.accountId)]);
  const myCourses = offered.filter((c) => mine.some((a) => a.courseId === c.id));

  if (myCourses.length === 0) {
    return (
      <>
        <PageHeader title="글 짓기" />
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

  // 공동교육과정 수업(N54)이면 다른 학교 학생도 명단에 든다
  const allStudents = await repo.listStudents({ external: true });
  // 반 고르기: 고정반 과목은 과목 하나, 이동반 과목은 분반마다 하나 (Figma N4 · N52 [반 ▾])
  const tabs = myCourses.flatMap((c) => {
    const a = mine.find((x) => x.courseId === c.id)!;
    const rs = rosters.filter((r) => r.courseId === c.id);
    if (a.mode === "moving" && a.sections?.length) {
      return a.sections.map((sec) => ({ course: c, section: sec as string | null, label: `${c.joint ? `공동 · ${c.subject}` : `${c.subject} ${sec}`} · ${studentsInCourse(allStudents, c, a, rs, sec).length}명` }));
    }
    return [{ course: c, section: null as string | null, label: `${short(c)} · ${a.classes.join(", ")}반` }];
  });
  const tab = tabs.find((t) => t.course.id === q.course && (t.section ?? "") === (q.section ?? "")) ?? tabs.find((t) => t.course.id === q.course) ?? tabs[0];
  const course = tab.course;
  const assignment = mine.find((a) => a.courseId === course.id);
  const records = await repo.listSetuk(course.id);
  const students = studentsInCourse(allStudents, course, assignment, rosters.filter((r) => r.courseId === course.id), tab.section);
  const latest = latestByStudent(records);
  // 다른 학교 학생(N54)은 칸이 좁아 번호 자리에 학교 이름만
  const list = students.map((s) => ({ id: s.id, no: s.school ?? s.studentNo, name: s.name, status: statusLabel(latest.get(s.id)) }));
  const selected = students.find((s) => s.id === firstStudent(list, q.student)?.id);
  const sec = tab.section ? `&section=${encodeURIComponent(tab.section)}` : "";
  const base = `/teacher/setuk/compose?course=${course.id}${sec}`;
  const classes = tabs.map((t) => ({ label: t.label, href: `/teacher/setuk/compose?course=${t.course.id}${t.section ? `&section=${encodeURIComponent(t.section)}` : ""}`, on: t === tab }));
  const collect = `/teacher/setuk/collect?course=${course.id}${sec}`;

  if (!selected) {
    return (
      <>
        <PageHeader title="글 짓기" actions={<ButtonLink href={collect} kind="outline" size="sm">조각 모으기</ButtonLink>} />
        <PageBody>
          <Card>
            <p className="py-6 text-center text-sm text-mute">
              {assignment?.mode === "moving" ? "이 분반 명단이 아직 없어요. 내 수업 → 이동반 명단에서 양식 명단을 올려 주세요" : "이 과목에 맡은 반 학생이 없어요. 내 수업에서 반을 확인해 주세요"}
            </p>
          </Card>
        </PageBody>
      </>
    );
  }

  // 공통과목(2022 개정)은 1·2학기 세특을 합쳐 1,500바이트 — 다른 학기에 쓴 분량만큼 이 학기 한도가 줄어든다
  const siblings = commonSiblings(course, offered);
  const otherBytes = siblings.length
    ? (await Promise.all(siblings.map(async (sib) => latestByStudent(await repo.listSetuk(sib.id)).get(selected.id)?.content ?? ""))).reduce((n, t) => n + neisBytes(t), 0)
    : 0;
  const shared = siblings.length ? { other: siblings[0].semester, bytes: otherBytes } : undefined;
  const cur = latest.get(selected.id);
  const scopeKey = setukScope(course.id, tab.section);
  // 비슷한 문장 (N34 ④): 분반 학생 최신 세특끼리 (공통 활동 글은 세지 않음)
  const commonList = await repo.listCommonActivities(scopeKey);
  const commonPieces = commonList.length ? await repo.listCommonActivityPieces(commonList.map((a) => a.id)) : [];
  const ignore = [...commonList.map((a) => a.description), ...commonPieces.map((p) => p.content)].filter((t) => t.trim());
  const texts = students.map((s) => ({ id: s.id, text: latest.get(s.id)?.content ?? "" })).filter((x) => x.text.trim());
  const pairs = similarPairs(texts, { ignore });
  const byId = new Map(students.map((s) => [s.id, s]));
  const peers = pairs.filter((p) => p.a === selected.id || p.b === selected.id).map((p) => byId.get(p.a === selected.id ? p.b : p.a)).filter((p) => !!p);
  // 성취수준 (N35 ③)
  const [scale, levelMap] = await Promise.all([repo.getAchievementScale(), repo.listLevels({ courseId: course.id, year: schoolYear(), semester: course.semester }, students.map((s) => s.id))]);
  const levels = Object.fromEntries(students.map((s) => [s.id, levelMap[s.id] ?? null]));
  // N38: AI 원안 · 교사가 정한 문장 · 근거 표
  const [pv, myPieces, provSettings] = await Promise.all([provView(cur), listMemosWithPieces(`세특:${course.id}`, [selected.id]).then(memoPieces), repo.getProvenanceSettings()]);
  const pool = piecesPool(myPieces, course.subject);
  const hrefOf = (id: string) => `${base}&student=${id}`;

  return (
    <WorkspaceProvider key={`${course.id}-${tab.section ?? ""}`} scope={{ kind: "setuk", courseId: course.id, section: tab.section }}>
      <LevelsProvider courseId={course.id} scale={scale} initial={levels}>
        <ComposePanels check={<ClassCheckPanel />} write={<ClassWritePanel hrefBase={base} word="세특 글" />} library={<LibraryPanel />}>
          <LibrarySaveProvider area="세특" subject={course.subject} studentId={selected.id} who={{ name: selected.name, studentNo: selected.studentNo }}>
            <SetukCompose
              key={`${course.id}-${selected.id}`}
              courseId={course.id}
              subject={course.subject}
              shared={shared}
              students={list}
              current={selected.id}
              hrefBase={base}
              classes={classes}
              classLabel={tab.label}
              collectHref={`${collect}&student=${selected.id}`}
              initial={cur?.content ?? ""}
              unit={cur?.unit ?? "bytes"}
              /* 2026-10-20 사용자: "교과세특 1500바이트야" — 늘 나이스 한도에서 시작 */
              max={neisMax("세특", cur?.unit ?? "bytes")}
              confirmed={cur?.status === "confirmed"}
              who={{ name: selected.name, studentNo: selected.studentNo, grade: selected.grade, classNo: selected.classNo, number: selected.number }}
              prov={{ original: pv.original, pins: pv.pins, pool, editRatioMin: provSettings.editRatioMin, who: selected.name }}
              aiOn={aiEnabled()}
              openCheck={q.check === "1" && q.student === selected.id}
              startMode={q.mode === "append" ? "append" : "new"}
              today={seoulNow().date}
              similar={{
                self: { id: selected.id, name: selected.name, no: selected.studentNo, href: hrefOf(selected.id) },
                peers: peers.map((p) => ({ id: p.id, name: p.name, no: p.studentNo, text: latest.get(p.id)?.content ?? "", href: hrefOf(p.id) })),
                ignore,
              }}
            />
          </LibrarySaveProvider>
        </ComposePanels>
      </LevelsProvider>
    </WorkspaceProvider>
  );
}
