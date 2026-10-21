import Link from "next/link";
import { AlertCircle, BookOpen, ChevronRight, ExternalLink, FileText } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card, cx } from "@/components/ui";
import { JOINT_DIFF, JOINT_FLOW, JOINT_LINKS, JOINT_RULES, JOINT_TABS, type JointKind } from "@/lib/domain/joint-curriculum";
import { requireCan } from "@/lib/server/viewer";

export const metadata = { title: "공동교육과정 운영 안내 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ tab?: string }> };

/** 공동교육과정 운영 안내 (Figma N12): 흐름·성적 규칙·다른 점·확인할 곳. 메뉴에서는 빠지고(N54) 내 수업 · 공동교육과정 카드의 [운영 안내 ›]로 온다 */
export default async function JointPage({ searchParams }: Props) {
  await requireCan("setuk.write");
  const tab: JointKind = (await searchParams).tab === "online" ? "online" : "school";
  const label = JOINT_TABS.find(([k]) => k === tab)![1];

  return (
    <>
      <PageHeader title="공동교육과정 운영 안내" actions={<div className="flex items-center gap-2"><Tabs tab={tab} className="hidden md:flex" /><ButtonLink href="/teacher/subjects" kind="outline" size="sm">내 수업</ButtonLink></div>} />
      <PageBody>
        <Tabs tab={tab} className="md:hidden" />

        <Card title="한 학기 흐름" action={<span className="text-[13px] text-mute">6단계</span>}>
          <ol className="flex flex-col md:grid md:grid-cols-6">
            {JOINT_FLOW.map((f, i) => (
              <li key={f.step} className="relative flex gap-3 pb-4 last:pb-0 md:flex-col md:gap-2.5 md:pb-0 md:pr-3">
                {/* 잇는 선: 모바일은 세로, PC는 가로 */}
                {i < JOINT_FLOW.length - 1 && (
                  <span aria-hidden className="absolute left-[13px] top-7 h-[calc(100%-28px)] w-0.5 bg-hair md:left-7 md:top-[13px] md:h-0.5 md:w-[calc(100%-28px)]" />
                )}
                <span className="relative flex size-[26px] shrink-0 items-center justify-center rounded-full bg-key-soft text-[13px] font-bold text-key-strong md:size-7">{i + 1}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-bold">{f.step}</span>
                  <span className="text-[13px] text-sub">{tab === "online" && f.online ? f.online : f.line}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] text-mute">일반적인 순서예요. 신청 일정은 교육청 공문을 따라요</p>
        </Card>

        <div className="grid gap-4 md:grid-cols-[1fr_400px] md:gap-6">
          <Card title="성적·학생부 규칙" action={<span className="rounded-chip bg-key-soft px-2 py-0.5 text-[12px] font-bold text-key-strong">2026 기재요령</span>}>
            <ul className="flex flex-col">
              {JOINT_RULES.map((r, i) => (
                <li key={r.rule} className="flex gap-3 border-t border-soft py-3.5 first:border-0 first:pt-0">
                  <span className="flex size-[22px] shrink-0 items-center justify-center rounded-chip bg-key-soft text-[12px] font-bold text-key-strong">{i + 1}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold">{r.rule}</p>
                      <p className="mt-0.5 text-[13px] leading-5 text-sub">{r.detail}</p>
                    </div>
                    <span className="self-start rounded-chip bg-soft px-2 py-0.5 text-[12px] font-bold text-sub whitespace-nowrap md:w-[120px] md:shrink-0 md:bg-transparent md:px-0 md:text-right">
                      <span className="md:rounded-chip md:bg-soft md:px-2 md:py-0.5">기재요령 {r.page}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex flex-col gap-4 md:gap-6">
            <Card title={`${label} 다른 점`}>
              <ul className="flex flex-col gap-2">
                {JOINT_DIFF[tab].map(([k, v]) => (
                  <li key={k} className="flex items-center gap-3 rounded-inner bg-bg px-3.5 py-3">
                    <span className="w-11 shrink-0 text-[13px] text-sub md:w-[52px]">{k}</span>
                    <span className="min-w-0 flex-1 text-[14px] font-medium">{v}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="확인할 곳" className="flex-1">
              <ul className="flex flex-col gap-1">
                {JOINT_LINKS.map((l) => {
                  const body = (
                    <>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-soft text-key-strong">{l.href ? <ExternalLink size={16} /> : <FileText size={16} />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold">{l.label}</span>
                        <span className="block text-[12px] text-mute">{l.note}</span>
                      </span>
                      {l.href && <ChevronRight size={16} className="text-faint" />}
                    </>
                  );
                  return (
                    <li key={l.label}>
                      {l.href
                        ? <a href={l.href} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-inner px-1 py-2.5 hover:bg-soft">{body}</a>
                        : <div className="flex items-center gap-3 px-1 py-2.5">{body}</div>}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 flex items-center gap-2 rounded-control bg-bg px-3 py-2.5 text-[13px] text-sub">
                <AlertCircle size={15} className="shrink-0 text-mute" />지역 운영 세부(플랫폼·일정)는 교육청 공문 기준
              </p>
            </Card>
          </div>
        </div>

        <section className="surface flex items-center gap-3 rounded-card px-4 py-3.5 md:gap-4 md:px-5 md:py-4">
          <span className="rounded-chip bg-new-soft px-2.5 py-1 text-xs font-bold text-new">AI</span>
          <div className="min-w-0 flex-1">
            <p className="hidden text-[15px] font-bold md:block">내 수업에서 등록한 공동교육과정 수업은 세특 글 짓기에서 AI로 써요</p>
            <p className="text-[15px] font-bold md:hidden">공동교육과정 세특도 AI로</p>
            <p className="text-[13px] text-sub md:hidden">세특 › 글 짓기 › 공동 탭</p>
          </div>
          <ButtonLink href="/teacher/setuk/compose" kind="soft" size="sm" className="hidden md:inline-flex"><BookOpen size={14} /> 세특 글 짓기</ButtonLink>
          <Link href="/teacher/setuk/compose" aria-label="세특 글 짓기" className="text-faint md:hidden"><ChevronRight size={18} /></Link>
        </section>
      </PageBody>
    </>
  );
}

function Tabs({ tab, className }: { tab: JointKind; className?: string }) {
  return (
    <nav aria-label="공동교육과정 종류" className={cx("flex rounded-full border border-hair bg-[#fff] p-0.5", className)}>
      {JOINT_TABS.map(([k, l]) => (
        <Link key={k} href={k === "school" ? "/teacher/joint" : "/teacher/joint?tab=online"} aria-current={k === tab ? "page" : undefined}
          className={cx("flex-1 whitespace-nowrap rounded-full px-5 py-1.5 text-center text-[14px]", k === tab ? "bg-key-soft font-bold text-key" : "text-sub hover:text-ink")}>{l}</Link>
      ))}
    </nav>
  );
}
