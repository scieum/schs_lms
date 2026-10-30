import Link from "next/link";
import { RecordCompetency } from "@/components/writing/record-competency";
import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Card, StatTiles, Tag, cx } from "@/components/ui";
import { isDraftAccepted, programRecordArea, programScope } from "@/lib/domain/merge";
import { AREA_LABEL } from "@/lib/domain/program";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";
import { AcceptButton } from "./accept-button";

export const metadata = { title: "받은 초안 · 속초고 쌤기부" };

/**
 * 담임 받은 초안 (Figma H1 사이드바): 프로그램 교사가 확정해 보낸 초안을 학생별로 모아 본다.
 * N83 (a 2035:23590 · b 2036:35439): 담임이 [확정]하면 자율·자치 / 진로 조각으로 들어간다. [모두 확정 n] 은 대기 전부.
 */
export default async function HomeroomDrafts() {
  const v = await requireViewer();
  if (v.kind !== "teacher" || !v.teacher.homeroom) redirect("/forbidden");
  const { grade, classNo } = v.teacher.homeroom;
  const mine = (await repo.listStudents()).filter((s) => s.grade === grade && s.classNo === classNo).sort((a, b) => a.number - b.number);
  const drafts = (await repo.listDraftsForStudents(mine.map((s) => s.id))).sort((a, b) => b.finalizedAt.localeCompare(a.finalizedAt));
  const byId = new Map(mine.map((s) => [s.id, s]));
  const ids = [...new Set(drafts.map((d) => d.studentId))];
  const pieces = ids.length ? (await Promise.all((["자율·자치", "진로"] as const).map((a) => repo.listRecordMemos(programScope(a), ids)))).flat() : [];
  const keyOf = (d: { programId: string; studentId: string }) => `${d.programId}:${d.studentId}`;
  const accepted = new Set(drafts.filter((d) => isDraftAccepted(d, pieces)).map(keyOf));
  const waiting = drafts.filter((d) => programRecordArea(d.area) && !accepted.has(keyOf(d))).map(keyOf);

  return (
    <>
      <PageHeader eyebrow={`${grade}학년 ${classNo}반`} title="받은 초안" />
      <PageBody>
        <StatTiles items={[
          ["받은 초안", `${drafts.length}건`],
          ["확정 대기", `${waiting.length}건`],
          ["받은 학생", `${new Set(drafts.map((d) => d.studentId)).size}명`],
          ["우리 반", `${mine.length}명`],
        ]} />
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-[17px] font-bold md:text-lg">받은 초안</h2>
            {waiting.length > 0 && <Tag>{`확정 대기 ${waiting.length}`}</Tag>}
            {waiting.length > 0 && <span className="ml-auto"><AcceptButton keys={waiting} label={`모두 확정 ${waiting.length}`} className="font-bold" /></span>}
          </div>
          {drafts.length === 0 ? (
            <p className="py-8 text-center text-sm text-mute">아직 받은 초안이 없어요. 프로그램 선생님이 확정하면 여기로 와요.</p>
          ) : (
            <ul className="grid gap-2">
              {drafts.map((d) => {
                const s = byId.get(d.studentId);
                const area = programRecordArea(d.area);
                const done = accepted.has(keyOf(d));
                return (
                  <li key={`${d.programId}-${d.studentId}`} className={cx("rounded-inner p-3.5", done ? "border border-line bg-white" : "bg-soft")}>
                    <div className="flex items-start gap-2">
                      <Link href={`/homeroom/students/${d.studentId}`} className="block min-w-0 flex-1 hover:text-key-strong">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-bold">{s ? `${s.number}번 ${s.name}` : "학생"}</span>
                          <Tag>{AREA_LABEL[d.area]}</Tag>
                        </div>
                        <p className="mt-1 truncate text-sm text-mute">{d.programTitle} · {d.finalizedAt.slice(5, 10).replace("-", ".")}</p>
                      </Link>
                      {area && (done ? (
                        <span className="flex shrink-0 items-center gap-2">
                          <Tag tone="bg-ok-soft text-ok">✓ 조각에 넣음</Tag>
                          <Link href={`/homeroom/logs?area=${encodeURIComponent(area)}&student=${d.studentId}`} className="whitespace-nowrap text-xs text-sub hover:text-key-strong">조각 보기 ›</Link>
                        </span>
                      ) : <AcceptButton keys={[keyOf(d)]} label="확정" className="shrink-0 font-bold" />)}
                    </div>
                    {/* 역량 보기 (Figma N18) — 링크 밖에 두어 스위치를 눌러도 이동하지 않게 */}
                    <RecordCompetency studentId={d.studentId} title="" text={d.content} className="mt-1.5">
                      <p className="line-clamp-2 text-sm">{d.content}</p>
                    </RecordCompetency>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
