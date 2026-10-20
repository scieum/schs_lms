import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { List } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { cx } from "@/components/ui";
import {
  emptyLine, logsSummary, parseTextsTab, parseTextsWho, showRows, summaryLabel, TEXTS_TABS, textsSummary,
  type TextsTab, type TextsWho,
} from "@/lib/domain/texts-view";
import { logsRows, pickOption, textsOptions, textsRows } from "@/lib/server/texts-view";
import { requireCan } from "@/lib/server/viewer";
import type { ScopeArg } from "@/app/(app)/teacher/class-actions";
import { LogRows, ScopeSelect, TextRows, TextsActions } from "./board";

export const metadata = { title: "글 모아 보기 · 속초고등학교 학생관리시스템" };

// 글 모아 보기 (Figma N49 메모 묶어 쓰기 (d) — PC 576:14499 · 576:14819 · 576:15122 / 모바일 577:9472 · 577:9667 · 577:9831).
// 세특 · 창체 · 행발 · 누가기록 글을 내 분반 · 담임 반 · 내 동아리 단위로 모아 본다. 권한은 서버(resolveScope · 누가기록 범위), URL 에는 내부 id 만.

type Q = { tab?: string; course?: string; section?: string; area?: string; club?: string; who?: string };
type Props = { searchParams: Promise<Q> };

const NO_SCOPE: Record<TextsTab, string> = {
  setuk: "담당 과목이 아직 없어요",
  record: "볼 수 있는 반 · 동아리가 없어요",
  behavior: "담임 반이 없어요",
  logs: "누가기록을 남길 반 · 동아리가 없어요",
};
const SCOPE_LABEL: Record<TextsTab, string> = { setuk: "과목 · 분반", record: "영역 · 반", behavior: "반", logs: "동아리 · 반" };

const href = (p: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(p).filter((x): x is [string, string] => !!x[1])).toString();
  return `/teacher/texts${s ? `?${s}` : ""}`;
};

export default async function TextsPage({ searchParams }: Props) {
  const v = await requireCan("record.write");
  const q = await searchParams;
  const tab = parseTextsTab(q.tab);
  const who = parseTextsWho(q.who);
  const whoQ = who === "all" ? "all" : undefined;
  const opts = await textsOptions(v, tab);
  const opt = pickOption(opts, q);
  const tabHref = (t: TextsTab) => href({ tab: t === "setuk" ? undefined : t, who: whoQ });
  const optHref = (query: Record<string, string>, w: TextsWho = who) => href({ tab: tab === "setuk" ? undefined : tab, ...query, who: w === "all" ? "all" : undefined });

  let body: ReactNode;
  let actions: ComponentProps<typeof TextsActions> = { tab, excel: null, disabled: true };
  let summary: { pc: string; m: string } | null = null;

  if (!opt) {
    body = <Empty line={NO_SCOPE[tab]} />;
  } else if (opt.kind === "logs") {
    const d = await logsRows(v, opt.input);
    if (!d) body = <Empty line={NO_SCOPE[tab]} />;
    else {
      const s = logsSummary(d.students, d.rows);
      summary = { pc: s, m: s };
      actions = { tab, logs: d.rows, disabled: !d.rows.length, excel: { kind: "link", href: `/teacher/texts/logs-xlsx?area=${encodeURIComponent(opt.input.area)}${opt.input.clubId ? `&club=${opt.input.clubId}` : ""}` } };
      body = d.rows.length ? <LogRows rows={d.rows} /> : <Empty line={emptyLine("logs", who, d.students)} action={{ label: "누가기록 쓰러 가기", href: d.href }} />;
    }
  } else {
    const d = await textsRows(v, opt.input);
    if (!d) body = <Empty line={NO_SCOPE[tab]} />;
    else {
      const shown = showRows(d.rows, who);
      const s = textsSummary(d.rows, d.scope.maxBytes);
      summary = { pc: summaryLabel(s), m: summaryLabel(s, true) };
      const scope: ScopeArg = opt.input.kind === "setuk"
        ? { kind: "setuk", courseId: opt.input.courseId, section: opt.input.section ?? null }
        : { kind: "record", area: opt.input.area, clubId: opt.input.clubId ?? null };
      actions = { tab, rows: shown, disabled: !shown.length, excel: { kind: "modal", scope, who } };
      body = shown.length
        ? <TextRows rows={shown} max={d.scope.maxBytes} />
        : <Empty line={emptyLine(tab, who, d.rows.length)} action={who === "confirmed" && d.rows.length ? { label: "전체 보기", href: optHref(opt.query, "all") } : undefined} />;
    }
  }

  return (
    <>
      <PageHeader title="글 모아 보기" actions={<TextsActions {...actions} />} />
      <PageBody>
        <TextsActions {...actions} mobile />
        {/* N48 알약 탭: 4칸 같은 폭 */}
        <nav aria-label="영역" className="grid grid-cols-4 gap-1 rounded-full border border-hair bg-[#fff] p-1">
          {TEXTS_TABS.map((t) => (
            <Link key={t.key} href={tabHref(t.key)} aria-current={t.key === tab ? "page" : undefined}
              className={cx("flex h-9 min-w-0 items-center justify-center whitespace-nowrap rounded-full text-[14px] md:h-10",
                t.key === tab ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub hover:bg-soft hover:text-ink")}>
              {t.label}
            </Link>
          ))}
        </nav>
        {opt && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
            <ScopeSelect label={SCOPE_LABEL[tab]} value={opt.key} options={opts.map((o) => ({ key: o.key, label: o.label, href: optHref(o.query) }))} />
            {tab !== "logs" && (
              <div role="radiogroup" aria-label="보기" className="flex shrink-0 gap-0.5 rounded-control bg-soft p-0.5">
                {(["confirmed", "all"] as const).map((w) => (
                  <Link key={w} href={optHref(opt.query, w)} role="radio" aria-checked={who === w} replace scroll={false}
                    className={cx("flex h-8 items-center whitespace-nowrap rounded-[6px] px-3 text-[13px]", who === w ? "bg-[#fff] font-bold text-ink" : "font-medium text-sub hover:text-ink")}>
                    {w === "confirmed" ? "확정만" : "전체"}
                  </Link>
                ))}
              </div>
            )}
            {summary && (
              <p className="ml-auto whitespace-nowrap text-[13px] text-sub">
                <span className="md:hidden">{summary.m}</span><span className="hidden md:inline">{summary.pc}</span>
              </p>
            )}
          </div>
        )}
        {body}
      </PageBody>
    </>
  );
}

function Empty({ line, action }: { line: string; action?: { label: string; href: string } }) {
  return (
    <section className="surface flex flex-col items-center gap-3 rounded-card px-5 py-14 text-center md:py-16">
      <span className="flex size-12 items-center justify-center rounded-full bg-key-soft text-key-strong"><List size={22} /></span>
      <p className="text-[16px] font-bold">{line}</p>
      {action && (
        <Link href={action.href} className="inline-flex h-11 items-center whitespace-nowrap rounded-control border border-hair bg-[#fff] px-4 text-[14px] font-bold text-ink hover:bg-soft md:h-9">
          {action.label}
        </Link>
      )}
    </section>
  );
}
