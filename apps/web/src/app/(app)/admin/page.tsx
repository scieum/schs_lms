import { AlertCircle, Upload } from "lucide-react";
import { PageBody, PageHeader, todayLabel } from "@/components/shell/app-shell";
import { DailyBrief } from "@/components/admin/ai-panels";
import { StageStrip } from "@/components/admin/stage-strip";
import { ButtonLink, Card, Row, StatTiles, Tag } from "@/components/ui";
import { accountStatus, dailyCheck } from "@/lib/domain/accounts";
import { schoolYear } from "@/lib/domain/curriculum";
import { today } from "@/lib/domain/activity";
import { aiEnabled } from "@/lib/server/ai/claude";
import { greeting } from "@/lib/domain/greeting";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { actionLabel } from "./audit/labels";
import { loadDailyCheck } from "./audit/load";
import { loadPipeline } from "./pipeline/load";
import { ScaleSetting } from "@/components/admin/scale-setting";
import { dbStatus } from "@/lib/server/db-status";

export const metadata = { title: "관리 홈 · 속초고 쌤기부" };

const md = (ymd: string) => {
  const [, m, d] = ymd.split("-");
  return `${Number(m)}.${d}`;
};

/** 오늘이면 "09:12", 아니면 "10.15 22:10" */
function when(iso: string, todayYmd: string): string {
  const d = new Date(iso);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
  const hm = d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
  return ymd === todayYmd ? hm : `${md(ymd)} ${hm}`;
}

/** 오늘 0시(한국 시간) */
function kstMidnightIso(now: Date): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
  return new Date(`${ymd}T00:00:00+09:00`).toISOString();
}

// A1 관리 홈 (Figma 74:1229 / 74:1413): 숫자 4 → 오늘 점검 → [오류 처리 | 이번 주 일정] [초안 생성 현황 | 최근 활동]
export default async function AdminHome() {
  const v = await requireCan("account.manage");
  const now = new Date();
  const year = schoolYear();
  const [students, audit, accounts, jobs, programs, check, pipe, todayLog, rounds, scale, db] = await Promise.all([
    repo.listStudents(), repo.listAudit(3), repo.adminListAccounts(), repo.listDraftJobs({}), repo.listPrograms(), loadDailyCheck(), loadPipeline(),
    repo.adminListAuditSince(kstMidnightIso(now), 2000), Promise.all([1, 2, 3].map((g) => repo.offeringRound(year, g))), repo.getAchievementScale(), dbStatus(),
  ]);
  const checkItems = dailyCheck(check);
  const errors = jobs.filter((j) => j.state === "ERROR");
  const running = jobs.filter((j) => j.state === "PENDING" || j.state === "RUNNING").length;
  const waiting = accounts.filter((a) => accountStatus(a, now) === "대기").length;
  const visitors = new Set(todayLog.filter((e) => e.action === "login" && e.actorId).map((e) => e.actorId)).size;
  const byStudent = new Map(students.map((s) => [s.id, s.name]));
  const byProgram = new Map(programs.map((p) => [p.id, p.title]));
  const names = new Map(accounts.map((a) => [a.id, a.name]));

  // 다가오는 마감: 프로그램 제출 마감 + 학년별 과목 신청 마감
  const t = today();
  const schedule = [
    ...programs.filter((p) => p.status === "open" && p.endDate >= t).map((p) => ({ date: p.endDate, title: `${p.title} 제출 마감`, href: "/teacher/programs" })),
    ...rounds.filter((r) => r && r.deadline >= t).map((r) => ({ date: r!.deadline, title: `${r!.grade}학년 과목 신청 마감`, href: `/admin/offerings?grade=${r!.grade}` })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);

  return (
    <>
      <PageHeader
        eyebrow={todayLabel(now)}
        title={greeting(`${v.kind === "teacher" ? v.teacher.name : ""} 선생님`)}
        actions={<ButtonLink href="/students/new" kind="outline" size="sm" className="md:px-5 md:py-3 md:text-[15px]"><Upload size={16} />학생 등록</ButtonLink>}
      />
      <PageBody>
        <StatTiles items={[["오늘 접속", `${visitors}명`], ["오류", `${errors.length}건`], ["생성 중", `${running}건`], ["계정 대기", `${waiting}명`]]} />
        <DailyBrief
          aiOn={aiEnabled()}
          initial={{ items: checkItems, line: checkItems.length ? `${checkItems.length}가지 — ${checkItems[0].text}` : "오늘 처리할 것이 없어요" }}
          link={errors.length ? <ButtonLink href="/admin/errors" size="sm">오류 처리</ButtonLink> : undefined}
        />
        {/* PC: 2열 2줄(같은 줄 카드 높이 맞춤). 모바일 순서는 시안대로 오류 → 초안 → 일정 → 활동 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_360px] md:gap-6">
          <Card title="오류 처리" className="order-1 md:order-none" action={<ButtonLink href="/admin/errors" kind="ghost" size="sm">전체</ButtonLink>}>
            {errors.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">처리할 오류가 없어요</p>
            ) : (
              errors.slice(0, 3).map((j, i, a) => (
                <Row key={j.id} last={i === a.length - 1}
                  lead={<span className="flex size-10 shrink-0 items-center justify-center rounded-field bg-white"><AlertCircle size={20} /></span>}
                  title={`${byStudent.get(j.studentId) ?? "학생"} · ${byProgram.get(j.programId) ?? ""}`}
                  meta={j.error ?? `초안 ${j.attempts}회 생성 실패`}
                  right={<span className="flex items-center gap-2"><Tag>실패</Tag><span className="hidden md:block"><ButtonLink href="/admin/errors" kind="outline" size="sm">보기</ButtonLink></span></span>} />
              ))
            )}
          </Card>
          <Card title="이번 주 일정" className="order-3 md:order-none">
            {schedule.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">다가오는 마감이 없어요</p>
            ) : (
              schedule.map((s, i) => (
                <Row key={s.title} last={i === schedule.length - 1}
                  lead={<span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-field bg-key-soft text-[13px] font-bold text-key-strong">{md(s.date)}</span>}
                  title={s.title} />
              ))
            )}
          </Card>
          <Card title="초안 생성 현황" className="order-2 md:order-none" action={<ButtonLink href="/admin/pipeline" kind="ghost" size="sm">자세히</ButtonLink>}>
            <StageStrip count={pipe.stageCount} busy={pipe.busy} code={false} />
          </Card>
          <Card title="최근 활동" className="order-4 md:order-none" action={<ButtonLink href="/admin/audit" kind="ghost" size="sm">전체</ButtonLink>}>
            {audit.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">아직 기록이 없어요</p>
            ) : (
              audit.map((a, i) => (
                <Row key={a.id} last={i === audit.length - 1} title={actionLabel(a.action)}
                  meta={`${when(a.at, t)}${a.actorId ? ` · ${names.get(a.actorId) ?? ""}` : ""}`} />
              ))
            )}
          </Card>
        </div>
        <Card title="학교 설정">
          <ScaleSetting initial={scale} />
        </Card>
        {/* DB 업데이트 확인: 아직 SQL Editor 에 넣지 않은 supabase/migrations 번호 */}
        <Card title="DB 업데이트 확인">
          {db.demo ? (
            <p className="text-[13px] text-sub">데모 모드예요 · DB가 연결되지 않았어요</p>
          ) : db.missing.length === 0 ? (
            <p className="text-[14px] font-medium text-ok">✓ SQL {db.total}개 모두 들어가 있어요</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-sub">Supabase SQL Editor 에 아래 번호를 차례로 붙여 실행해 주세요 · <code>apps/web/supabase/migrations</code></p>
              <ul className="flex flex-col gap-1.5">
                {db.missing.map((m) => (
                  <li key={m.no} className="flex items-center gap-2 text-[14px]"><Tag tone="bg-wait-soft text-[#9a6400]">{m.no}</Tag><span className="flex-1">{m.label}</span><span className="text-[12px] text-mute">{m.why}</span></li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </PageBody>
    </>
  );
}
