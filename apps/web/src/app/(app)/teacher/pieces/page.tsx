import Link from "next/link";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Avatar, Card, cx } from "@/components/ui";
import { neisBytes } from "@/lib/domain/length";
import { makeStudentNo } from "@/lib/domain/roster";
import { piecesBoard, type AreaFilter } from "@/lib/server/pieces-board";
import { requireCan } from "@/lib/server/viewer";
import { AreaBoxCard } from "./area-box";
import { PiecesPicker } from "./picker";

export const metadata = { title: "생기부 조각 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ student?: string; area?: string }> };

const FILTERS: [AreaFilter | "all", string][] = [["all", "전체"], ["세특", "교과 세특"], ["자율·자치", "자율·자치"], ["동아리", "동아리"], ["진로", "진로"], ["행발", "행발"]];

/** 생기부 조각 (Figma N13): 학생별로 모인 조각(누가기록·관찰 메모·받은 특색 활동 초안)과 저장한 본문을 영역마다 본다 → 합치기 */
export default async function PiecesPage({ searchParams }: Props) {
  const v = await requireCan("record.write");
  const q = await searchParams;
  const { students, boxes, selected } = await piecesBoard(v, q.student);
  const filters = FILTERS.filter(([f]) => f === "all" || boxes.some((b) => b.filter === f));
  const area = filters.some(([f]) => f === q.area) ? (q.area as AreaFilter) : "all";
  const shown = area === "all" ? boxes : boxes.filter((b) => b.filter === area);
  const pieceTotal = boxes.reduce((n, b) => n + b.pieces.length, 0);
  const href = (p: { student?: string; area?: string }) => {
    const sp = new URLSearchParams();
    if (p.student ?? selected?.id) sp.set("student", (p.student ?? selected?.id)!);
    if (p.area && p.area !== "all") sp.set("area", p.area);
    return `/teacher/pieces?${sp}`;
  };

  return (
    <>
      <PageHeader title="생기부 조각" />
      <PageBody>
        {students.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-mute">조각을 모을 학생이 아직 없어요. 내 수업·담임 반·지도 동아리가 정해지면 보여요</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-[300px_1fr] md:gap-6">
            <PiecesPicker
              students={students.map((s) => ({ id: s.id, name: s.name, grade: s.grade, classNo: s.classNo, label: makeStudentNo(s.grade, s.classNo, s.number), count: s.pieceCount }))}
              selected={selected?.id ?? null}
              area={area}
            />
            {selected && (
              <div className="flex min-w-0 flex-col gap-4">
                <section className="surface flex flex-col gap-3.5 rounded-card p-4 md:px-6 md:py-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={selected.name} size={48} />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[20px] font-bold">{selected.name}</h2>
                      <p className="text-[13px] text-mute">{selected.grade}학년 {selected.classNo}반 {selected.number}번 · {selected.studentNo}</p>
                    </div>
                    <span className="rounded-chip bg-key-soft px-2 py-1 text-[13px] font-bold text-key-strong">조각 {pieceTotal}</span>
                    <span className="rounded-chip bg-soft px-2 py-1 text-[13px] font-bold text-sub">영역 {boxes.length}</span>
                  </div>
                  <nav aria-label="영역" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
                    {filters.map(([f, l]) => {
                      const n = f === "all" ? pieceTotal : boxes.filter((b) => b.filter === f).reduce((k, b) => k + b.pieces.length, 0);
                      const on = f === area;
                      return (
                        <Link key={f} href={href({ area: f })} aria-current={on ? "page" : undefined}
                          className={cx("flex h-9 shrink-0 items-center gap-1 rounded-control px-3 text-[14px]", on ? "bg-key-soft font-bold text-key-strong" : "border border-hair bg-[#fff] text-sub hover:text-ink")}>
                          {l} <span className={cx("text-[13px]", on ? "text-key-strong" : "text-mute")}>{n}</span>
                        </Link>
                      );
                    })}
                  </nav>
                </section>
                {shown.map((b) => (
                  <AreaBoxCard key={b.key} studentId={selected.id} box={{ ...b, piecesBytes: b.pieces.reduce((n, p) => n + neisBytes(p.text), 0), bodyBytes: neisBytes(b.body.content) }} />
                ))}
              </div>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}
