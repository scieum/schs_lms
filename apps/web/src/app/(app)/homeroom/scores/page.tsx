import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { ClassPicker } from "@/components/scores/parts";
import { classScope } from "@/components/scores/scope";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/ui";
import { sortExams } from "@/lib/domain/scores";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { ScoreUpload } from "./score-upload";

export const metadata = { title: "성적 업로드 · 속초고 쌤기부" };

export default async function ScoresUploadPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const v = await requireCan("scores.upload");
  const scope = await classScope(v, (await searchParams).class);
  if (!scope) redirect("/forbidden");
  const exams = sortExams(await repo.listExams()).reverse();
  const scores = await repo.listMockScores(scope.students.map((s) => s.id));
  const counts = Object.fromEntries(exams.map((e) => [e.id, scores.filter((s) => s.examId === e.id).length]));
  return (
    <>
      <PageHeader
        title="성적 업로드"
        actions={
          <ButtonLink href={`/homeroom/scores/template?class=${scope.key}`} kind="outline" size="sm" prefetch={false}>
            <Download size={14} /> <span className="hidden md:inline">양식 내려받기</span>
            <span className="md:hidden">양식</span>
          </ButtonLink>
        }
      />
      <PageBody>
        <ClassPicker classes={scope.classes} current={scope.key} path="/homeroom/scores" />
        <ScoreUpload
          key={scope.key}
          classKey={scope.key}
          className={`${scope.grade}학년 ${scope.classNo}반`}
          rosterSize={scope.students.length}
          exams={exams.map((e) => ({ id: e.id, name: e.name, year: e.year, month: e.month, uploaded: counts[e.id] ?? 0 }))}
          ai={aiEnabled()}
        />
      </PageBody>
    </>
  );
}
