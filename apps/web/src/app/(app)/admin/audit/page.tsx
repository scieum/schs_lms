import { Download } from "lucide-react";
import { LinkChips, SearchBox } from "@/components/admin/chips";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, ButtonLink, Tag } from "@/components/ui";
import { kstDateLabel, kstTime } from "@/lib/domain/accounts";
import { requireCan } from "@/lib/server/viewer";
import { actionGroup, PERIODS, readPeriod } from "./labels";
import { loadAudit, type AuditRow } from "./load";

export const metadata = { title: "감사 로그 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ p?: string; q?: string; flag?: string }> };

const FLAG_TONE = "bg-wait-soft text-wait";

export default async function AuditPage({ searchParams }: Props) {
  await requireCan("audit.view");
  const sp = await searchParams;
  const period = readPeriod(sp.p);
  const q = (sp.q ?? "").trim().slice(0, 40);
  const onlyFlagged = sp.flag === "1";
  const { rows, truncated } = await loadAudit(period, q, onlyFlagged);
  const { rows: everything } = onlyFlagged || q ? await loadAudit(period, "") : { rows };
  const flagged = everything.filter((r) => r.flag && r.flag !== "잠김");
  const latest = flagged[0];

  const days: [string, AuditRow[]][] = [];
  for (const r of rows) {
    const d = kstDateLabel(r.at);
    if (days.at(-1)?.[0] === d) days.at(-1)![1].push(r);
    else days.push([d, [r]]);
  }
  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ p: period, ...(q ? { q } : {}), ...(onlyFlagged ? { flag: "1" } : {}), ...extra });
    return u.toString();
  };

  return (
    <>
      <PageHeader
        title="감사 로그"
        actions={
          <ButtonLink href={`/admin/audit/export?${qs({})}`} prefetch={false} kind="outline" size="sm">
            <Download size={16} />내보내기
          </ButtonLink>
        }
      />
      <PageBody>
        <AiBanner
          label="자동"
          title="이상 접근 살펴보기"
          line={
            latest
              ? `평소와 다른 ${latest.flag} ${flagged.length}건 (${kstDateLabel(latest.at).split(" ")[0]} ${kstTime(latest.at)})`
              : "이 기간에 대량·야간 열람이 없어요"
          }
          action={
            latest ? (
              onlyFlagged ? (
                <ButtonLink href={`/admin/audit?p=${period}`} kind="outline" size="sm">전체 보기</ButtonLink>
              ) : (
                <ButtonLink href={`/admin/audit?${qs({ flag: "1" })}`} size="sm">자세히</ButtonLink>
              )
            ) : undefined
          }
        />

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <LinkChips
            items={PERIODS.map(([k, label]) => ({ label, href: `/admin/audit?${new URLSearchParams({ p: k, ...(q ? { q } : {}) })}` }))}
            active={PERIODS.findIndex(([k]) => k === period)}
          />
          <SearchBox action="/admin/audit" placeholder="사람·행동 검색" value={q} keep={{ p: period }} />
        </div>

        {days.length === 0 ? (
          <section className="rounded-card bg-soft p-6 text-center text-sm text-mute">이 기간에 기록이 없어요</section>
        ) : (
          days.map(([day, list]) => (
            <section key={day} className="rounded-card bg-soft p-5 md:p-6">
              <h2 className="mb-2 text-[17px] font-bold md:text-lg">{day}</h2>
              {list.map((r, i) => {
                const group = actionGroup(r.action);
                return (
                  <div key={r.id} className={`flex items-center gap-3 py-3 md:gap-5 ${i === list.length - 1 ? "" : "border-b border-line"}`}>
                    <span className="w-11 shrink-0 text-[13px] text-mute">{kstTime(r.at)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium">{r.label}{r.target ? ` · ${r.target}` : ""}</div>
                      <div className="truncate text-[13px] text-mute">{r.actor}</div>
                    </div>
                    {r.flag ? (
                      <Tag tone={r.flag === "잠김" ? undefined : FLAG_TONE}>{r.flag}</Tag>
                    ) : group ? (
                      <Tag tone={group === "확정" ? "bg-ok-soft text-ok" : "bg-white text-sub"}>{group}</Tag>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ))
        )}
        {truncated && <p className="text-center text-[13px] text-mute">최근 2,000건만 보여요 · 기간을 줄이거나 검색해 주세요</p>}
      </PageBody>
    </>
  );
}
