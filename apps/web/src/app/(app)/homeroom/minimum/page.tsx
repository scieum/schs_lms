import { redirect } from "next/navigation";
import { Download, List } from "lucide-react";
import { ClassPicker } from "@/components/scores/parts";
import { classScope } from "@/components/scores/scope";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card, Row, Segmented, StatTiles } from "@/components/ui";
import { countVerdicts, describeRule, examLabel, judgeMinimum, shortRule, sortExams, type Grades, type MinRule } from "@/lib/domain/scores";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { CounselPanel } from "./counsel-panel";
import { RuleForm } from "./rule-form";
import { VerdictTable, type VerdictRow } from "./verdict-table";
import { archiveRule } from "./actions";

export const metadata = { title: "수능 최저 · 속초고등학교 학생관리시스템" };

/** 표의 '탐구' 칸: 기준의 탐구 반영 방법대로 */
function inquiryShown(rule: MinRule | null | undefined, g: Grades | null): number | null {
  if (!g || (g.t1 === null && g.t2 === null)) return null;
  const xs = [g.t1, g.t2].filter((x): x is number => x !== null);
  if (!rule || rule.inquiry === "best") return Math.min(...xs);
  if (xs.length < 2) return null;
  const avg = (xs[0] + xs[1]) / 2;
  return rule.inquiry === "avgFloor" ? Math.floor(avg) : avg;
}

type Props = { searchParams: Promise<{ class?: string; exam?: string }> };

export default async function MinimumPage({ searchParams }: Props) {
  const v = await requireCan("minimum.view");
  const q = await searchParams;
  const scope = await classScope(v, q.class);
  if (!scope) redirect("/forbidden");
  const ids = scope.students.map((s) => s.id);
  const [exams, scores, rules, targets, counsel] = await Promise.all([
    repo.listExams(),
    repo.listMockScores(ids),
    repo.listMinRules(),
    repo.listStudentTargets(ids),
    repo.latestMinCounselList(scope.grade, scope.classNo),
  ]);
  const withScores = sortExams(exams).filter((e) => scores.some((s) => s.examId === e.id)).reverse();
  const exam = withScores.find((e) => e.id === q.exam) ?? withScores[0] ?? null;
  const ruleMap = new Map(rules.map((r) => [r.id, r]));

  const rows: VerdictRow[] = scope.students.map((s) => {
    const mine = targets.filter((t) => t.studentId === s.id).sort((a, b) => a.rank - b.rank);
    const t = mine[0];
    const rule = t?.ruleId ? ruleMap.get(t.ruleId) : null;
    const g = exam ? scores.find((x) => x.studentId === s.id && x.examId === exam.id)?.grades ?? null : null;
    const j = t ? judgeMinimum(rule, g) : null;
    return {
      id: s.id,
      name: s.name,
      number: s.number,
      target: t ? `${t.university} ${t.major}` : null,
      more: Math.max(0, mine.length - 1),
      rule: rule ? shortRule(rule) : t ? "기준 없음" : "–",
      ko: g?.ko ?? null,
      ma: g?.ma ?? null,
      en: g?.en ?? null,
      tam: inquiryShown(rule, g),
      status: j ? j.status : "판정 불가",
      reason: j ? j.reason : "목표 대학이 없어요",
    };
  });
  const judged = rows.filter((r) => r.target);
  const c = countVerdicts(judged.map((r) => r.status));
  const nearCount = c["근접"];
  const nameOf = new Map(scope.students.map((s) => [s.id, s.name]));
  const qs = (examId: string) => `/homeroom/minimum?class=${scope.key}&exam=${examId}`;

  return (
    <>
      <PageHeader
        title="수능 최저 판정"
        actions={
          <>
            {exam && (
              <ButtonLink href={`/homeroom/minimum/export?class=${scope.key}&exam=${exam.id}`} kind="outline" size="sm" prefetch={false}>
                <Download size={14} /> <span className="hidden md:inline">판정 결과 내려받기</span>
              </ButtonLink>
            )}
            <ButtonLink href="#rules" kind="outline" size="sm">
              <List size={14} /> <span className="hidden md:inline">대학 기준 관리</span>
            </ButtonLink>
          </>
        }
      />
      <PageBody>
        <ClassPicker classes={scope.classes} current={scope.key} path="/homeroom/minimum" />
        <StatTiles
          items={[
            ["판정 대상", `${judged.length}명`],
            ["충족", `${c["충족"]}명`],
            ["미충족", `${c["미충족"] + nearCount}명`],
            ["자료 부족", `${c["자료 부족"] + c["판정 불가"]}명`],
          ]}
        />
        <CounselPanel
          classKey={scope.key}
          examId={exam?.id ?? ""}
          ai={aiEnabled()}
          nearCount={nearCount}
          names={Object.fromEntries(nameOf)}
        />

        {withScores.length > 0 ? (
          <div className="md:max-w-md">
            <Segmented
              active={Math.max(0, withScores.findIndex((e) => e.id === exam?.id))}
              items={withScores.slice(0, 4).map((e, i) => ({ label: i === 0 ? e.name : examLabel(e), href: qs(e.id) }))}
            />
          </div>
        ) : null}

        <VerdictTable rows={rows} empty={!exam ? "아직 올린 모의고사 성적이 없어요" : null} />

        {counsel && (
          <Card title="상담 명단" action={<span className="text-[13px] text-mute">{new Date(counsel.createdAt).toLocaleDateString("ko-KR")}</span>}>
            {counsel.items.map((it, i) => (
              <Row key={it.studentId} last={i === counsel.items.length - 1} title={nameOf.get(it.studentId) ?? "학생"} meta={it.reason} />
            ))}
          </Card>
        )}

        <div id="rules" className="scroll-mt-6">
          <Card title="대학별 기준" action={<RuleForm />}>
            {rules.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">아직 기준이 없어요. 기준을 추가해 주세요</p>
            ) : (
              <div className="grid gap-2.5 md:grid-cols-3">
                {rules.map((r) => {
                  const d = describeRule(r);
                  const users = targets.filter((t) => t.ruleId === r.id).length;
                  return (
                    <div key={r.id} className="flex flex-col gap-1 rounded-inner bg-white p-4">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 truncate font-bold">{r.university} {r.major}</span>
                        <form action={archiveRule}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="text-xs text-mute hover:text-bad" aria-label={`${r.university} ${r.major} 기준 내리기`}>내리기</button>
                        </form>
                      </div>
                      <div className="text-sm text-sub">{d.main}</div>
                      {(d.extra || r.note) && <div className="text-xs text-mute">{[d.extra, r.note].filter(Boolean).join(" · ")}</div>}
                      {users > 0 && <div className="text-xs text-mute">우리 반 {users}명 목표</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
