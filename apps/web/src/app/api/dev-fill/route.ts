import { assessScope } from "@/lib/domain/assessment";
import { pieceScopeOf } from "@/lib/domain/merge";
import { gradeTotal, newCriterion, type Rubric } from "@/lib/domain/rubric";
import { studentsInCourse } from "@/lib/domain/setuk";
import { repo } from "@/lib/server/repo";
import { isDemo } from "@/lib/server/env";
import { schoolYear } from "@/lib/domain/curriculum";

// 화면 점검용 예시 기록 (2026-10-25 모바일 QA): 데모 서버를 DEMO_FILL=1 로 켰을 때만, 한 번 채운다.
// 공유용 깨끗한 데모(10-22)는 그대로 — 이 주소는 DEMO_FILL 없이는 404. 실제 DB 에서는 절대 돌지 않는다.
const g = globalThis as unknown as { __schsFilled?: boolean };
const day = (d: number) => new Date(Date.now() + d * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export async function POST() {
  if (!isDemo || process.env.DEMO_FILL !== "1") return new Response("not found", { status: 404 });
  if (g.__schsFilled) return Response.json({ ok: true, again: true });
  g.__schsFilled = true;
  const T = "t-subject", H = "t-homeroom";
  const all = await repo.listStudents({ external: true });
  const mine = await repo.listTeacherCourses(T);
  const rosters = await repo.listCourseRosters(T);
  const classOf = (grade: number, classNo: number) => all.filter((s) => s.grade === grade && s.classNo === classNo);
  const homeroom = classOf(2, 3);

  // ① 세특 조각 · 세특 글 (이서연 선생님 담당 과목마다 앞 학생 몇 명)
  const PIECES = [
    "[빗면 실험] 빗면 각도를 바꾸며 가속도를 세 번씩 재고 평균을 내어 각도와 가속도의 관계를 그래프로 정리함.",
    "[운동 법칙 발표] 뉴턴 제2법칙을 수레와 추 실험으로 설명하고, 마찰을 줄이려고 바퀴에 윤활제를 바른 까닭을 덧붙임.",
    "[오차 토론] 모둠 측정값이 이론값보다 작은 까닭을 마찰과 시간 측정 오차로 나누어 설명함.",
  ];
  for (const a of mine) {
    const course = await repo.getCourse(a.courseId);
    if (!course) continue;
    const sections = a.mode === "moving" && a.sections?.length ? a.sections : [null];
    for (const sec of sections) {
      const ss = studentsInCourse(all, course, a, rosters.filter((r) => r.courseId === a.courseId), sec).slice(0, 4);
      for (const [i, s] of ss.entries()) {
        for (const text of PIECES.slice(0, 3 - (i % 3))) await repo.addRecordMemo({ scope: pieceScopeOf(`세특:${course.id}`), studentId: s.id, authorId: T, content: text });
        if (i < 2) {
          await repo.addSetuk({ courseId: course.id, studentId: s.id, authorId: T, unit: "bytes", max: 1500, status: i === 0 ? "confirmed" : "draft",
            content: `${course.subject} 수업에서 빗면 각도를 바꾸며 가속도를 반복 측정하고 그래프로 각도와 가속도의 관계를 찾아냄. 측정값이 이론값보다 작은 까닭을 마찰과 시간 측정 오차로 나누어 설명하며 실험 설계를 다시 다듬는 모습을 보임.` });
        }
      }
    }
  }

  // ② 동아리 · 담임 누가기록
  const club = await repo.listClubs(schoolYear());
  const members = club.length ? await repo.listClubMembers(club[0].id) : [];
  const logs = [
    ...members.slice(0, 3).map((id, i) => ({ area: "동아리" as const, studentId: id, authorId: T, clubId: club[0]?.id ?? null, date: day(-i - 1), content: "과학탐구반 정기 활동에서 수질 측정 키트로 학교 앞 하천의 pH를 재고 결과를 표로 정리함." })),
    ...homeroom.slice(0, 5).map((s, i) => ({ area: "자율·자치" as const, studentId: s.id, authorId: H, clubId: null, date: day(-i), content: i % 2 ? "학급 회의에서 급식 잔반 줄이기 안건을 내고 실천 방법을 모둠별로 정리함." : "체육대회 응원 도구를 남아서 고치고 정리함." })),
  ];
  await repo.addActivityLogs(logs);

  // ③ 특색활동 프로그램 · 서류 · 초안 (열린 것 하나, 마감된 것 하나)
  const targets = homeroom.slice(0, 6);
  const open = await repo.createProgram({
    ownerId: T, coOwnerIds: [], title: "과학 탐구 발표 대회", subject: "물리학", area: "세특", unit: "bytes", max: 1500, startDate: day(-7), endDate: day(3),
    source: "both", useMemos: false, requestDocs: true, docKinds: ["탐구 보고서"],
    questions: [{ id: "q1", title: "탐구 주제", prompt: "무엇을 왜 탐구했나요?", fixed: true, minChars: 30 }],
    targetIds: targets.map((s) => s.id), overview: "학년 과학 탐구 발표 대회 — 보고서와 소감으로 세특 초안을 만든다", status: "open",
  });
  for (const s of targets.slice(0, 4)) await repo.saveResponse(open.id, s.id, { q1: "빗면에서 수레가 내려오는 가속도가 각도에 따라 어떻게 달라지는지 궁금해서 각도를 다섯 단계로 바꾸며 측정했습니다." }, true);
  for (const s of targets.slice(0, 3)) {
    const text = "탐구 보고서: 빗면 각도 10°~30°에서 수레 가속도를 측정하고 sinθ 와 비례함을 확인함. 오차 원인으로 마찰을 들고 바퀴를 바꿔 다시 잼.";
    await repo.addMaterial({ programId: open.id, studentId: s.id, fileName: `${s.studentNo}_보고서.txt`, mime: "text/plain", size: text.length * 3, pages: null, status: "matched", matchedBy: "studentNo", text, uploaderId: T }, new TextEncoder().encode(text));
  }
  const jobs = await repo.ensureDraftJobs(open.id, targets.slice(0, 4).map((s) => s.id), { unit: "bytes", max: 1500 });
  const DRAFT = "빗면 실험에서 각도를 다섯 단계로 바꾸며 수레의 가속도를 측정하고 가속도가 sinθ 에 비례함을 그래프로 확인함. 측정값이 이론값보다 작은 원인을 마찰로 보고 바퀴를 바꾸어 다시 측정하는 등 탐구 과정을 스스로 고쳐 나가는 모습을 보임.";
  for (const [i, j] of jobs.entries()) {
    if (i === 3) { await repo.updateDraftJob(j.id, { state: "ERROR", attempts: 3, error: "분량 기준을 통과하지 못했어요" }); continue; }
    await repo.updateDraftJob(j.id, { state: "DONE" });
    await repo.addDraftVersion({ jobId: j.id, programId: open.id, studentId: j.studentId, content: DRAFT, status: i === 0 ? "finalized" : "draft", reason: null, source: "sample", authorId: i === 0 ? T : null });
  }
  const closed = await repo.createProgram({
    ownerId: T, coOwnerIds: [], title: "환경 동아리 캠페인", subject: null, area: "창체-동아리", unit: "bytes", max: 1500, startDate: day(-30), endDate: day(-10),
    source: "survey", useMemos: false, requestDocs: false, docKinds: [], questions: [{ id: "q1", title: "맡은 일", prompt: "캠페인에서 맡은 일은?", fixed: true, minChars: 30 }],
    targetIds: homeroom.slice(0, 3).map((s) => s.id), overview: "", status: "closed",
  });
  for (const j of await repo.ensureDraftJobs(closed.id, homeroom.slice(0, 3).map((s) => s.id), { unit: "bytes", max: 1500 })) {
    await repo.updateDraftJob(j.id, { state: "DONE" });
    await repo.addDraftVersion({ jobId: j.id, programId: closed.id, studentId: j.studentId, content: "환경 동아리 캠페인에서 교내 분리배출 실태를 조사하고 안내 포스터를 만들어 학급마다 붙이며 친구들의 참여를 이끌어 냄.", status: "finalized", reason: null, source: "sample", authorId: T });
  }

  // ④ 상담 · 문장 보관함
  for (const [i, s] of homeroom.slice(0, 2).entries()) {
    await repo.addCounsel({ studentId: s.id, authorId: T, area: i ? "학습" : "진로", date: day(-i - 2), content: i ? "물리 서술형에서 풀이 과정을 생략하는 습관 — 단계별로 쓰는 연습을 하기로 함." : "공학 계열 진학을 생각 중. 탐구 보고서를 꾸준히 쓰도록 권함.", prevId: null });
  }
  for (const text of ["측정값이 이론값과 다른 까닭을 스스로 찾아 실험 설계를 고쳐 나감.", "모둠 토론에서 서로 다른 의견을 정리해 하나의 결론으로 모아 냄.", "개념을 실생활 사례로 바꾸어 설명하는 데 능숙함."]) {
    await repo.addSentence({ ownerId: T, area: "세특", subject: "물리학", text, tags: ["탐구"], source: "body" });
  }

  // ⑤ 수행평가: 자료 요약 하나 · 루브릭 하나 (물리학 1분반)
  const phys = mine.find((a) => a.mode === "moving");
  if (phys) {
    const course = (await repo.getCourse(phys.courseId))!;
    const sec = phys.sections?.[0] ?? null;
    const ss = studentsInCourse(all, course, phys, rosters.filter((r) => r.courseId === phys.courseId), sec);
    const sum = await repo.createAssessment(T, { courseId: course.id, section: sec, title: "빗면 실험 보고서", date: day(-10), description: "빗면 각도를 바꾸며 가속도를 재고 오차 원인을 분석하는 보고서", kind: "summary", rubric: null, modelAnswer: "" });
    if (ss[0]) await repo.addRecordMemo({ scope: assessScope(course.id, sum.id), studentId: ss[0].id, authorId: T, content: "[빗면 실험 보고서] 빗면 각도 세 가지로 가속도를 반복 측정하고 이론값과의 차이를 마찰과 시간 측정 한계로 나누어 설명함." });
    const rubric: Rubric = { scale: "상중하", standards: ["[12물리01-02]"], criteria: [
      { ...newCriterion("상중하", 8, "탐구 설계"), id: "c1" }, { ...newCriterion("상중하", 8, "자료 해석"), id: "c2" }, { ...newCriterion("상중하", 4, "표현·형식"), id: "c3" }] };
    rubric.criteria[0].levels.forEach((l, i) => { l.desc = ["변인을 통제하고 반복 측정함", "변인은 정했으나 반복 측정이 빠짐", "실험 절차가 흐림"][i]; });
    const rb = await repo.createAssessment(T, { courseId: course.id, section: sec, title: "역학 탐구 보고서", date: day(-2), description: "", kind: "rubric", rubric,
      modelAnswer: "빗면 각도를 10°~30°에서 다섯 단계로 바꾸고 각도마다 세 번씩 측정해 평균을 낸다. 가속도는 a = g sinθ 에 가깝게 커지며, 측정값이 이론값보다 작은 까닭은 마찰과 공기 저항, 초시계 반응 시간 때문이다. 오차를 줄이려면 광센서로 시간을 재고 빗면을 매끄럽게 한다." });
    const picks = [{ criterionId: "c1", level: 0, reason: "각도를 다섯 단계로 바꾸고 세 번씩 측정함" }, { criterionId: "c2", level: 1, reason: "그래프는 그렸으나 오차를 다루지 않음" }, { criterionId: "c3", level: 0, reason: "짜임이 분명함" }];
    if (ss[0]) await repo.addGrade({ assessmentId: rb.id, studentId: ss[0].id, teacherId: T, picks, total: gradeTotal(rubric, picks), status: "confirmed", reading: "빗면 각도와 가속도 관계를 다섯 단계로 측정함.", piece: "[역학 탐구 보고서] 빗면 각도를 다섯 단계로 바꾸며 가속도를 측정해 그래프로 정리함." });
    if (ss[1]) await repo.addGrade({ assessmentId: rb.id, studentId: ss[1].id, teacherId: T, picks: picks.map((p) => ({ ...p, level: 1 })), total: gradeTotal(rubric, picks.map((p) => ({ ...p, level: 1 }))), status: "ai", reading: "수레 질량을 바꾸며 가속도를 측정함.", piece: "[역학 탐구 보고서] 수레 질량을 바꾸며 가속도를 재고 표로 정리함." });
  }
  return Response.json({ ok: true });
}
