import Link from "next/link";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card, cx } from "@/components/ui";
import { readyNote, type NeisGroup } from "@/lib/domain/neis-export";
import { neisSets } from "@/lib/server/neis";
import { requireCan } from "@/lib/server/viewer";
import { Steps } from "./steps";
import { RowActions } from "./row-actions";
import type { ScopeArg } from "../class-actions";

/** N42: 내보내기 주소(내부 id 만)에서 반 범위 → 시트용 복사 · 엑셀로 받기 (N47 부터 ⋯ 더보기 안) */
function scopeOf(href: string): ScopeArg {
  const q = new URL(href, "http://x").searchParams;
  return href.startsWith("/teacher/setuk") ? { kind: "setuk", courseId: q.get("course") ?? "", section: q.get("section") } : { kind: "record", area: q.get("area") ?? "", clubId: q.get("club") };
}

export const metadata = { title: "나이스 입력 · 속초고 쌤기부" };

const GROUPS: NeisGroup[] = ["교과 세특", "창체", "행발"];
const CHIP = { wait: "bg-[#FFF5E0] text-[#9A6400]", bad: "bg-[#FEECEE] text-bad", ok: "bg-ok-soft text-[#00A05D]" } as const;

/** 나이스 입력 (Figma N47 PC 530:12923 · 모바일 530:33266): 나이스 입력 버튼 달기 → 확정본 복사 → 나이스에서 붙여넣기·채우기.
 *  행 = 이름 | 상태 칸 220(확정 수 · 칩 · 확정 0 이유) | 동작 칸 160(복사 + ⋯). 칸 폭이 고정이라 겹치지 않는다. */
export default async function NeisPage() {
  const v = await requireCan("record.write");
  const sets = await neisSets(v);

  return (
    <>
      <PageHeader title="나이스 입력" />
      <PageBody>
        <Steps />
        <Card title="보낼 기록" action={<span className="text-[13px] text-mute">{sets.length}건</span>}>
          {sets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-bold">보낼 기록이 아직 없어요</p>
              <ButtonLink href="/teacher/subjects" kind="outline" size="sm">내 수업 정하기</ButtonLink>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {GROUPS.map((g) => {
                const rows = sets.filter((s) => s.group === g);
                if (!rows.length) return null;
                return (
                  <section key={g}>
                    <h3 className="pb-2 text-[13px] font-bold text-mute">{g} <span className="font-normal text-faint">{rows.length}</span></h3>
                    <ul className="flex flex-col">
                      {rows.map((s) => (
                        <li key={s.key} className="flex flex-col gap-3 border-t border-line py-3.5 md:grid md:grid-cols-[minmax(0,1fr)_220px_160px] md:items-center md:gap-4">
                          <div className="flex min-w-0 items-start gap-3 md:contents">
                            <Link href={s.editHref} className="min-w-0 flex-1 hover:underline">
                              <p className="truncate text-[15px] font-bold">{s.title}</p>
                              <p className="truncate text-[13px] text-mute">{s.sub}</p>
                            </Link>
                            <div className="flex shrink-0 flex-col items-end gap-0.5 md:items-start">
                              <div className="flex items-center gap-2">
                                <span className="whitespace-nowrap text-[14px] text-sub">확정 <b className="text-[16px] text-ink tabular-nums">{s.confirmed}</b> / {s.total}명</span>
                                {readyNote(s).map((n) => <span key={n.text} className={cx("whitespace-nowrap rounded-chip px-2 py-0.5 text-[12px] font-bold", CHIP[n.tone])}>{n.text}</span>)}
                                {s.total > 0 && !readyNote(s).length && <span className={cx("whitespace-nowrap rounded-chip px-2 py-0.5 text-[12px] font-bold", CHIP.ok)}>모두 확정</span>}
                              </div>
                              {!s.confirmed && <span className="text-[12px] font-medium text-mute">확정한 학생이 없어요</span>}
                            </div>
                          </div>
                          <RowActions href={s.exportHref} scope={scopeOf(s.exportHref)} title={s.title} sub={s.sub} confirmed={s.confirmed} total={s.total} />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </Card>
      </PageBody>
    </>
  );
}
