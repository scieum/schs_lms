import Link from "next/link";
import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, ButtonLink, Card, Row, StatTiles, Tag } from "@/components/ui";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";

export const metadata = { title: "우리 반 · 속초고등학교 학생관리시스템" };

export default async function HomeroomHome() {
  const v = await requireViewer();
  if (v.kind !== "teacher" || !v.teacher.homeroom) redirect("/forbidden");
  const { grade, classNo } = v.teacher.homeroom;
  const mine = (await repo.listStudents()).filter((s) => s.grade === grade && s.classNo === classNo).sort((a, b) => a.number - b.number);
  const ids = mine.map((s) => s.id);
  const [drafts, scores, night, corrections] = await Promise.all([
    repo.listDraftsForStudents(ids),
    repo.scoresClassSummary(ids),
    repo.nightClassToday(ids),
    repo.listCorrectionRequests(ids),
  ]);
  const verdict = new Map(scores.map((r) => [r.studentId, r]));
  const met = scores.filter((r) => r.verdict === "충족").length;
  const nightSigned = Math.max(0, ...Object.values(night).map((p) => p.signed));
  const watch = mine.filter((s) => ["근접", "미충족"].includes(verdict.get(s.id)?.verdict ?? ""));
  const pendingFix = corrections.filter((c) => c.status !== "done").length;
  const byName = new Map(mine.map((s) => [s.id, s.name]));
  const recent = [...drafts].sort((a, b) => b.finalizedAt.localeCompare(a.finalizedAt)).slice(0, 5);

  return (
    <>
      <PageHeader title={`${grade}학년 ${classNo}반`} actions={<ButtonLink href="/homeroom/students" kind="outline" size="sm">학생 기록</ButtonLink>} />
      <PageBody>
        <StatTiles items={[["우리 반", `${mine.length}명`], ["받은 초안", `${drafts.length}건`], ["최저 충족", `${met}명`], ["오늘 야자", `${nightSigned}명`]]} />
        <AiBanner
          title="우리 반 브리핑"
          line={watch[0] ? `${watch[0].name} — ${verdict.get(watch[0].id)?.reason ?? "수능 최저 확인이 필요해요"}` : pendingFix ? `정정 요청 ${pendingFix}건이 기다려요` : "먼저 볼 학생이 없어요"}
          action={watch[0] ? <ButtonLink href={`/teacher/counseling?student=${watch[0].id}`} size="sm" className="hidden md:inline-flex">상담 기록</ButtonLink> : undefined}
        />
        <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
          <Card title="학생 한눈에" action={<span className="text-[13px] text-mute">최저 확인 {watch.length}명</span>}>
            {mine.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">아직 등록된 학생이 없어요</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {mine.map((s) => {
                  const r = verdict.get(s.id);
                  return (
                    <Link key={s.id} href={`/homeroom/students/${s.id}`} className="flex flex-col gap-1 rounded-inner bg-white p-3.5 hover:bg-key-soft">
                      <div className="font-bold">{s.name}</div>
                      <div className="flex items-center gap-1.5 text-[13px] text-mute">
                        {s.number}번
                        {r?.verdict === "미충족" && <Tag>최저 미충족</Tag>}
                        {r?.verdict === "근접" && <Tag>확인 필요</Tag>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
          <Card title="받은 생기부 초안">
            {recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">아직 받은 초안이 없어요</p>
            ) : (
              recent.map((d, i) => (
                <Row key={`${d.programId}-${d.studentId}`} last={i === recent.length - 1} title={d.programTitle}
                  meta={`${byName.get(d.studentId) ?? ""} · ${d.finalizedAt.slice(5, 10).replace("-", ".")}`}
                  right={<Link href={`/homeroom/students/${d.studentId}`}><Tag>확정</Tag></Link>} />
              ))
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
