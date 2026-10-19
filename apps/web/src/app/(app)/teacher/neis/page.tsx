import Link from "next/link";
import { Download } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card, cx } from "@/components/ui";
import { readyNote, type NeisGroup } from "@/lib/domain/neis-export";
import { neisSets } from "@/lib/server/neis";
import { requireCan } from "@/lib/server/viewer";
import { CopyButton } from "./copy-button";
import { Steps } from "./steps";
import { SheetCopyButton } from "@/components/writing/sheet-copy";
import { ExcelExportButton } from "@/components/writing/excel-export";
import type { ScopeArg } from "../class-actions";

/** N42: 내보내기 주소(내부 id 만)에서 반 범위 → 시트용 복사 · 엑셀로 받기 */
function scopeOf(href: string): ScopeArg {
  const q = new URL(href, "http://x").searchParams;
  return href.startsWith("/teacher/setuk") ? { kind: "setuk", courseId: q.get("course") ?? "", section: q.get("section") } : { kind: "record", area: q.get("area") ?? "", clubId: q.get("club") };
}

export const metadata = { title: "나이스 입력 · 속초고등학교 학생관리시스템" };

const GROUPS: NeisGroup[] = ["교과 세특", "창체", "행발"];
const CHIP = { wait: "bg-[#FFF5E0] text-[#9A6400]", bad: "bg-[#FEECEE] text-bad" } as const;

/** 나이스 입력 (Figma N31 235:4817 · 모바일 235:4818): 나이스 입력 버튼 달기 → 확정본 복사 → 나이스에서 붙여넣기·채우기 */
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
                        <li key={s.key} className="flex flex-col gap-3 border-t border-line py-3.5 md:flex-row md:items-center md:gap-4">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <Link href={s.editHref} className="min-w-0 flex-1 hover:underline">
                              <p className="truncate text-[15px] font-bold">{s.title}</p>
                              <p className="truncate text-[13px] text-mute">{s.sub}</p>
                            </Link>
                            <span className="shrink-0 text-[13px] text-sub md:w-[140px]">확정 <b className="text-[15px] text-ink tabular-nums">{s.confirmed}</b> / {s.total}명</span>
                            <span className="flex shrink-0 gap-1 md:w-[120px]">
                              {readyNote(s).map((n) => <span key={n.text} className={cx("rounded-chip px-1.5 py-0.5 text-[11px] font-bold", CHIP[n.tone])}>{n.text}</span>)}
                            </span>
                          </div>
                          <div className="grid shrink-0 grid-cols-2 gap-2 md:flex md:w-auto md:justify-end">
                            <CopyButton href={s.exportHref} disabled={!s.confirmed} />
                            <SheetCopyButton scope={scopeOf(s.exportHref)} disabled={!s.total} />
                            <ExcelExportButton scope={scopeOf(s.exportHref)} disabled={!s.total} />
                            <a href={s.exportHref} download aria-disabled={!s.confirmed}
                              className={cx("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-hair bg-[#fff] px-3 text-[13px] font-bold hover:bg-soft", !s.confirmed && "pointer-events-none opacity-40")}>
                              <Download size={15} />파일
                            </a>
                          </div>
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
