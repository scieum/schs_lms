import Link from "next/link";
import { Tag, cx } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { AREA_LABEL, ddayLabel, effectiveStatus, md, type Program } from "@/lib/domain/program";

const chip = "whitespace-nowrap rounded-chip border border-line bg-[#fff] px-2 py-0.5 text-[12px] text-sub";

/** 프로그램 머리 아래 칩 줄: 영역 · 기간 · 대상 · 담당 · D-day (현황 · 초안 검토 탭 공통) */
export function ProgramMeta({ program: p, targets }: { program: Program; targets: number }) {
  const t = today();
  const status = effectiveStatus(p, t);
  return (
    <div className="-mt-3 flex flex-wrap items-center gap-1.5 md:-mt-6">
      <span className={chip}>{AREA_LABEL[p.area]}{p.subject ? ` · ${p.subject}` : ""}</span>
      <span className={cx(chip, "hidden md:inline")}>{md(p.startDate)} – {md(p.endDate)}</span>
      <span className={chip}>대상 {targets}명</span>
      {p.coOwnerIds.length > 0 && <span className={cx(chip, "hidden md:inline")}>담당 {1 + p.coOwnerIds.length}명</span>}
      {status === "draft" ? <Tag>임시 저장</Tag> : status === "closed" ? <Tag tone="bg-soft text-mute">마감</Tag> : <Tag>{ddayLabel(p.endDate, t)}</Tag>}
    </div>
  );
}

/** 프로그램 안 탭 (Figma N52 h · i): 현황 | 초안 검토 n — 초안 검토는 프로그램 안 하위 영역 */
export function ProgramTabs({ programId, active, review }: { programId: string; active: "status" | "drafts"; review: number }) {
  const tabs = [
    { key: "status", label: "현황", href: `/teacher/programs/${programId}`, n: 0 },
    { key: "drafts", label: "초안 검토", href: `/teacher/programs/${programId}/drafts`, n: review },
  ] as const;
  return (
    <nav className="flex gap-1 rounded-card border border-line bg-[#fff] p-1 md:self-start">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link key={t.key} href={t.href} aria-current={on ? "page" : undefined}
            className={cx("flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-4 text-[14px] md:h-[37px] md:flex-none",
              on ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub hover:bg-soft")}>
            {t.label}
            {t.n > 0 && <span className={cx("rounded-chip px-[7px] text-[12px] font-bold", on ? "bg-key text-white" : "bg-key-soft text-key-strong")}>{t.n}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
