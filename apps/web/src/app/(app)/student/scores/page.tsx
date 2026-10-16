import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Card, Row, StatTiles, Tag } from "@/components/ui";
import {
  inquiryAverage, judgeMinimum, mockAverage, shortRule, sortExams, trendSummary, VERDICT_TONE, SUBJECTS, examLabel,
} from "@/lib/domain/scores";
import { minimumNeedLine } from "@/lib/domain/student-assist";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { AnalysisPanel } from "./analysis-panel";
import { TargetEditor } from "./target-editor";
import { TrendCard } from "./trend-card";

export const metadata = { title: "내 성적 · 속초고등학교 학생관리시스템" };

const grade = (n: number | null) => (n === null ? "–" : `${n}등급`);

export default async function MyScoresPage() {
  const v = await requireCan("student.self");
  if (v.kind !== "student") return null;
  const id = v.student.id;
  const [exams, scores, school, rules, targets, plan] = await Promise.all([
    repo.listExams(),
    repo.listMockScores([id]),
    repo.listSchoolGrades([id]),
    repo.listMinRules(),
    repo.listStudentTargets([id]),
    repo.latestStudyPlan(id),
  ]);
  const taken = sortExams(exams).filter((e) => scores.some((s) => s.examId === e.id));
  const latestExam = taken[taken.length - 1];
  const latest = latestExam ? scores.find((s) => s.examId === latestExam.id)!.grades : null;
  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  const trend = trendSummary(exams, scores);
  const series = taken.map((e) => {
    const g = scores.find((s) => s.examId === e.id)!.grades;
    return { label: examLabel(e), average: mockAverage(g), ko: g.ko, ma: g.ma, en: g.en, tam: inquiryAverage(g) };
  });
  const tam = latest ? inquiryAverage(latest) : null;

  return (
    <>
      <PageHeader
        title="내 성적"
        actions={
          <TargetEditor
            rules={rules.map((r) => ({ id: r.id, label: `${r.university} ${r.major}`, rule: shortRule(r) }))}
            initial={targets.map((t) => ({ university: t.university, major: t.major, ruleId: t.ruleId }))}
          />
        }
      />
      <PageBody>
        {latestExam && <p className="-mt-2 text-[13px] text-mute md:hidden">{latestExam.name} 기준</p>}
        <StatTiles
          items={[
            ["국어", grade(latest?.ko ?? null)],
            ["수학", grade(latest?.ma ?? null)],
            ["영어", grade(latest?.en ?? null)],
            ["탐구 평균", tam === null ? "–" : `${tam.toFixed(1)}등급`],
          ]}
        />
        <AnalysisPanel line={trend.text} ai={aiEnabled()} disabled={!latest} />

        <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
          <div className="flex min-w-0 flex-col gap-4 md:gap-6">
            <TrendCard series={series} />
            <Card title="내신" action={<span className="text-[13px] text-sub">학기별</span>}>
              {school.length === 0 ? (
                <p className="py-4 text-center text-sm text-mute">내신 성적이 아직 없어요</p>
              ) : (
                school.map((s, i) => (
                  <Row
                    key={`${s.grade}-${s.semester}`}
                    last={i === school.length - 1}
                    title={`${s.grade}학년 ${s.semester}학기`}
                    meta={[["국", s.ko], ["수", s.ma], ["영", s.en]].filter(([, x]) => x !== null).map(([k, x]) => `${k} ${x}`).join(" · ")}
                    right={<span className="shrink-0 font-bold tabular-nums">{s.average.toFixed(1)}등급</span>}
                  />
                ))
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-4 md:gap-6">
            <Card title="목표 대학 최저 기준">
              {targets.length === 0 ? (
                <p className="py-4 text-center text-sm text-mute">오른쪽 위 &lsquo;목표 대학 설정&rsquo;에서 정해 주세요</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {targets.map((t) => {
                    const r = t.ruleId ? ruleMap.get(t.ruleId) : null;
                    const j = judgeMinimum(r, latest);
                    return (
                      <div key={t.rank} className="rounded-inner bg-white p-4">
                        <div className="flex items-center gap-2">
                          <span className="flex-1 truncate font-bold">{t.university} {t.major}</span>
                          <Tag tone={VERDICT_TONE[j.status]}>{j.status}</Tag>
                        </div>
                        <p className="mt-1.5 text-[13px] text-sub">{r ? `${shortRule(r)} · ${j.reason}` : "기준이 아직 없어요 · 담임 선생님께 알려 주세요"}</p>
                        {r && j.status !== "충족" && j.status !== "판정 불가" && (
                          <p className="mt-1 text-[13px] font-medium">{minimumNeedLine("필요한 것", r, j).replace(/^필요한 것: /, "")}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
            {plan && (
              <Card title="내 공부 계획" action={<span className="text-[13px] text-mute">{new Date(plan.createdAt).toLocaleDateString("ko-KR")}</span>}>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {plan.items.map((x, i) => (
                    <li key={i} className="flex gap-2"><span className="text-key">•</span><span>{x}</span></li>
                  ))}
                </ul>
              </Card>
            )}
            {latest && (
              <p className="px-1 text-xs text-mute">
                {latestExam!.name} · 한국사 {latest.hi ?? "–"}등급 · 과목: {SUBJECTS.length}개 공통과목
              </p>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}
