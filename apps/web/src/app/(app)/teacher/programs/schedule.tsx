import Link from "next/link";
import { Card, Tag, cx } from "@/components/ui";
import { AREA_LABEL, ddayLabel, effectiveStatus, md, type Program } from "@/lib/domain/program";

// 전체 일정: 담당이 아니어도 어떤 프로그램이 언제 있는지 본다 (학생 응답·초안은 담당자만)
export type ScheduleItem = Pick<Program, "id" | "title" | "area" | "subject" | "startDate" | "endDate" | "status" | "targetIds"> & {
  owners: string;
  ownerNames: string[];
  /** 담당자들의 부서 (교사 정보의 부서) */
  depts: string;
  /** 참여 학생 (학번·이름) — 캘린더에서 누르면 보인다 */
  students: { no: string; name: string }[];
  /** 상세를 열 수 있나 (담당자·관리자) */
  mine: boolean;
};

// 영역마다 점 색 하나 (상태 색과 겹치지 않게 인디고 계열 + 중립)
const AREA_DOT: Record<Program["area"], string> = { 세특: "bg-key", "창체-자율": "bg-[#9EAAFF]", "창체-동아리": "bg-navy", "창체-진로": "bg-faint" };

function StatusTag({ p, today }: { p: ScheduleItem; today: string }) {
  const s = effectiveStatus(p, today);
  if (s === "closed") return <Tag tone="bg-soft text-mute">마감</Tag>;
  if (p.startDate > today) return <Tag tone="bg-soft text-sub">예정</Tag>;
  return <Tag>{ddayLabel(p.endDate, today)}</Tag>;
}

function Title({ p, className }: { p: ScheduleItem; className?: string }) {
  return p.mine ? <Link href={`/teacher/programs/${p.id}`} className={cx("hover:text-key-strong", className)}>{p.title}</Link> : <span className={className}>{p.title}</span>;
}

export function ScheduleList({ items, today }: { items: ScheduleItem[]; today: string }) {
  const sorted = [...items].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const now = sorted.filter((p) => effectiveStatus(p, today) !== "closed");
  const past = sorted.filter((p) => effectiveStatus(p, today) === "closed").reverse();
  const section = (title: string, list: ScheduleItem[]) => (
    <Card title={`${title} ${list.length}`}>
      {list.length === 0 ? <p className="py-6 text-center text-sm text-mute">없어요</p> : (
        <ul className="flex flex-col">
          {list.map((p, i) => (
            <li key={p.id} className={cx("flex items-center gap-3 py-3", i > 0 && "border-t border-line")}>
              <span className={cx("size-2 shrink-0 rounded-full", AREA_DOT[p.area])} aria-hidden />
              <span className="w-[92px] shrink-0 text-[13px] tabular-nums text-sub md:w-[110px]">{md(p.startDate)} ~ {md(p.endDate)}</span>
              <span className="min-w-0 flex-1">
                <Title p={p} className="block truncate text-[15px] font-bold" />
                <span className="block truncate text-[12px] text-mute">{AREA_LABEL[p.area]}{p.subject ? ` ${p.subject}` : ""} · {p.owners} · {p.targetIds.length}명</span>
              </span>
              <span className="shrink-0"><StatusTag p={p} today={today} /></span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
  return (
    <>
      {section("진행·예정", now)}
      {past.length > 0 && section("지난 프로그램", past)}
    </>
  );
}
