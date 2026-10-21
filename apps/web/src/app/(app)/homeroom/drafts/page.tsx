import Link from "next/link";
import { RecordCompetency } from "@/components/writing/record-competency";
import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Card, StatTiles, Tag } from "@/components/ui";
import { addDays, seoulNow } from "@/lib/domain/night";
import { AREA_LABEL } from "@/lib/domain/program";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";

export const metadata = { title: "받은 초안 · 속초고 쌤기부" };

/** 담임 받은 초안 (Figma H1 사이드바): 프로그램 교사가 확정해 보낸 초안을 학생별로 모아 본다 */
export default async function HomeroomDrafts() {
  const v = await requireViewer();
  if (v.kind !== "teacher" || !v.teacher.homeroom) redirect("/forbidden");
  const { grade, classNo } = v.teacher.homeroom;
  const mine = (await repo.listStudents()).filter((s) => s.grade === grade && s.classNo === classNo).sort((a, b) => a.number - b.number);
  const drafts = (await repo.listDraftsForStudents(mine.map((s) => s.id))).sort((a, b) => b.finalizedAt.localeCompare(a.finalizedAt));
  const byId = new Map(mine.map((s) => [s.id, s]));
  const week = addDays(seoulNow().date, -7);

  return (
    <>
      <PageHeader eyebrow={`${grade}학년 ${classNo}반`} title="받은 초안" />
      <PageBody>
        <StatTiles items={[
          ["받은 초안", `${drafts.length}건`],
          ["이번 주", `${drafts.filter((d) => d.finalizedAt >= week).length}건`],
          ["받은 학생", `${new Set(drafts.map((d) => d.studentId)).size}명`],
          ["우리 반", `${mine.length}명`],
        ]} />
        <Card title="확정된 초안">
          {drafts.length === 0 ? (
            <p className="py-8 text-center text-sm text-mute">아직 받은 초안이 없어요. 프로그램 선생님이 확정하면 여기로 와요.</p>
          ) : (
            <ul className="grid gap-2">
              {drafts.map((d) => {
                const s = byId.get(d.studentId);
                return (
                  <li key={`${d.programId}-${d.studentId}`} className="rounded-inner bg-white p-3.5">
                    <Link href={`/homeroom/students/${d.studentId}`} className="block hover:text-key-strong">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{s ? `${s.number}번 ${s.name}` : "학생"}</span>
                        <Tag>{AREA_LABEL[d.area]}</Tag>
                        <span className="ml-auto shrink-0 text-xs text-mute">{d.finalizedAt.slice(5, 10).replace("-", ".")}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-mute">{d.programTitle}</p>
                    </Link>
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
