import Link from "next/link";
import { Plus } from "lucide-react";
import { LinkChips, SearchBox } from "@/components/admin/chips";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FoldLink } from "@/components/admin/fold";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { AiBanner, Avatar, Button, ButtonLink, Card, Row, StatTiles, Tag } from "@/components/ui";
import { accountStatus, isStale, lastSeenLabel, STALE_DAYS } from "@/lib/domain/accounts";
import { repo } from "@/lib/server/repo";
import type { AccountSummary } from "@/lib/server/repo/modules/admin";
import { requireCan } from "@/lib/server/viewer";
import { lockStaleAccounts, resetPassword, unlockAccount } from "./actions";
import { makeStudentNo } from "@/lib/domain/roster";

export const metadata = { title: "계정 관리 · 속초고 쌤기부" };

const FILTERS = [
  ["all", "전체"], ["teacher", "교사"], ["homeroom", "담임"], ["student", "학생"], ["locked", "잠김"],
] as const;
type Filter = (typeof FILTERS)[number][0];
const PAGE = 100;

type Props = { searchParams: Promise<{ f?: string; q?: string; stale?: string }> };

function roleText(a: AccountSummary): string {
  if (a.student) return `학생 · ${makeStudentNo(a.student.grade, a.student.classNo, a.student.number)}`;
  const t = a.teacher;
  if (!t) return "교사";
  if (t.roles.includes("admin")) return "관리자";
  if (t.homeroom) return `담임 · ${t.homeroom.grade}학년 ${t.homeroom.classNo}반`;
  return `교사${t.dept ? ` · ${t.dept}` : ""}`;
}

export default async function AccountsPage({ searchParams }: Props) {
  const v = await requireCan("account.manage");
  const sp = await searchParams;
  const f: Filter = FILTERS.some(([k]) => k === sp.f) ? (sp.f as Filter) : "all";
  const q = (sp.q ?? "").trim().slice(0, 40);
  const now = new Date();

  const all = (await repo.adminListAccounts()).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "teacher" ? -1 : 1;
    if (a.student && b.student) return a.student.grade - b.student.grade || a.student.classNo - b.student.classNo || a.student.number - b.student.number;
    return a.name.localeCompare(b.name, "ko");
  });
  const status = (a: AccountSummary) => accountStatus(a, now);
  const teachers = all.filter((a) => a.kind === "teacher");
  const stale = all.filter((a) => a.id !== v.accountId && isStale(a.lastLoginAt, now) && status(a) !== "잠김");

  const shown = all.filter((a) => {
    if (f === "teacher" && a.kind !== "teacher") return false;
    if (f === "homeroom" && !a.teacher?.homeroom) return false;
    if (f === "student" && a.kind !== "student") return false;
    if (f === "locked" && status(a) !== "잠김") return false;
    return !q || a.name.includes(q) || a.loginId.includes(q);
  });
  const qs = (k: Filter) => `/admin/accounts?f=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow={`${all.length}명`}
        title="계정 관리"
        actions={<ButtonLink href="/admin/accounts/new" size="sm" className="md:px-5 md:py-3 md:text-[15px]"><Plus size={16} />계정 추가</ButtonLink>}
      />
      <PageBody>
        <StatTiles
          items={[
            ["교사", `${teachers.length}명`],
            ["학생", `${all.length - teachers.length}명`],
            ["관리자", `${teachers.filter((a) => a.teacher?.roles.includes("admin")).length}명`],
            ["잠김", `${all.filter((a) => status(a) === "잠김").length}명`],
          ]}
        />
        <AiBanner
          label="자동"
          title="오래 쓰지 않은 계정"
          line={stale.length ? `${STALE_DAYS}일 넘게 접속 없는 계정 ${stale.length}개 — 잠금을 권해요` : `${STALE_DAYS}일 넘게 접속 없는 계정이 없어요`}
          action={stale.length ? <FoldLink href="/admin/accounts?stale=1"><ButtonLink href="/admin/accounts?stale=1" kind="outline" size="sm">확인 후 잠금</ButtonLink></FoldLink> : undefined}
        />

        {sp.stale === "1" && stale.length > 0 && (
          <Card
            title={`잠글 계정 ${stale.length}개`}
            action={<Link href="/admin/accounts" className="text-[13px] text-mute">닫기</Link>}
          >
            {stale.map((a, i) => (
              <Row key={a.id} last={i === stale.length - 1} lead={<Avatar name={a.name} />} title={a.name} meta={`${roleText(a)} · ${lastSeenLabel(a.lastLoginAt, now)}`} />
            ))}
            <form action={lockStaleAccounts} className="mt-4 flex justify-end">
              <ConfirmButton kind="outline" message={`${stale.length}개 계정을 잠글까요? 잠금 해제로 다시 열 수 있어요`} size="sm">
                {stale.length}개 잠그기
              </ConfirmButton>
            </form>
          </Card>
        )}

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <LinkChips items={FILTERS.map(([k, label]) => ({ label, href: qs(k) }))} active={FILTERS.findIndex(([k]) => k === f)} />
          <SearchBox action="/admin/accounts" placeholder="이름 검색" value={q} keep={{ f }} />
        </div>

        <Card>
          {shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-mute">맞는 계정이 없어요</p>
          ) : (
            shown.slice(0, PAGE).map((a, i, list) => {
              const st = status(a);
              const seen = st === "대기" && !a.lastLoginAt ? "첫 로그인 대기" : lastSeenLabel(a.lastLoginAt, now);
              const title = a.teacher ? (
                <Link href={`/admin/accounts/${a.id}`} title="역할·담임 반·부서 바꾸기" className="hover:underline">{a.name}</Link>
              ) : a.name;
              return (
                <div key={a.id} className={i === list.length - 1 ? "" : "border-b border-line"}>
                  <div className="flex items-center gap-3 py-3">
                    <Avatar name={a.name} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium">{title}</div>
                      <div className="truncate text-[13px] text-mute">{roleText(a)}<span className="hidden md:inline"> · {seen}</span></div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Tag>{st}</Tag>
                      <div className="hidden w-[76px] md:block">
                        {st === "잠김" && (
                          <form action={unlockAccount}>
                            <input type="hidden" name="id" value={a.id} />
                            <Button kind="outline" size="sm" className="w-full px-0">잠금 해제</Button>
                          </form>
                        )}
                      </div>
                      <form action={resetPassword}>
                        <input type="hidden" name="id" value={a.id} />
                        <ConfirmButton kind="outline" size="sm" className="w-[64px] px-0 md:w-[112px]" message={`${a.name}의 비밀번호를 학교 인증코드로 되돌릴까요? 다음 로그인 때 새로 정해요`}>
                          <span className="md:hidden">초기화</span>
                          <span className="hidden md:inline">비밀번호 초기화</span>
                        </ConfirmButton>
                      </form>
                    </div>
                  </div>
                  {st === "잠김" && (
                    <form action={unlockAccount} className="-mt-1 pb-3 pl-[52px] md:hidden">
                      <input type="hidden" name="id" value={a.id} />
                      <Button kind="soft" size="sm">잠금 해제</Button>
                    </form>
                  )}
                </div>
              );
            })
          )}
          {shown.length > PAGE && (
            <p className="pt-3 text-center text-[13px] text-mute">{shown.length - PAGE}명 더 있어요 · 이름으로 찾아 주세요</p>
          )}
        </Card>
      </PageBody>
    </>
  );
}
