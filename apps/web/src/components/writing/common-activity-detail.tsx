import { notFound } from "next/navigation";
import { PageBody } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/ui";
import { parseScope } from "@/lib/domain/common-activity";
import { aiEnabled } from "@/lib/server/ai/claude";
import { resolveScope } from "@/lib/server/common-activity";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { CommonActivityView } from "./common-activity-view";

// 공통 활동 화면 (Figma N26 346:9307 · 346:9850): 학생 자료 한꺼번에 올리기 → 파일 이름으로 학생 맞추기 → 조각 한꺼번에 만들기.
// 세특은 /teacher/setuk/activity/[id], 창체·행발은 /teacher/write/activity/[id]. 주소에는 활동 ID만 (C3).

const md = (d: string | null) => (d ? `${+d.slice(5, 7)}.${+d.slice(8, 10)}` : "");

export async function CommonActivityDetail({ id, want }: { id: string; want: "세특" | "기록" }) {
  const a = await repo.getCommonActivity(id);
  const ref = a ? parseScope(a.scope) : null;
  if (!a || !ref || (want === "세특") !== (ref.kind === "세특")) notFound();
  const v = await requireCan(ref.kind === "세특" ? "setuk.write" : "record.write");
  const r = await resolveScope(v, a.scope);
  if (!r) notFound();
  const inScope = new Set(r.students.map((s) => s.id));
  const pieces = (await repo.listCommonActivityPieces([a.id])).filter((p) => inScope.has(p.studentId));

  return (
    <>
      <header className="flex items-start gap-2.5 px-4 pb-2 pt-5 md:px-10 md:pt-8">
        <div className="min-w-0 flex-1">
          <h1 className="break-keep text-xl font-bold md:text-[28px]">{a.name}</h1>
          <p className="mt-1 text-[13px] text-mute">{[r.label, `학생 ${r.students.length}명`, md(a.date)].filter(Boolean).join(" · ")}</p>
        </div>
        <ButtonLink href={r.backHref} kind="outline" size="sm" className="shrink-0">공통 활동 목록</ButtonLink>
      </header>
      <PageBody>
        <CommonActivityView
          activity={{ id: a.id, name: a.name, description: a.description }}
          students={r.students.map((s) => ({ id: s.id, studentNo: s.studentNo, name: s.name }))}
          made={pieces.map((p) => p.studentId)}
          label={aiEnabled() ? "AI" : "자동"}
        />
      </PageBody>
    </>
  );
}
