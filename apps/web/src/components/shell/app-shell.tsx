import { tabsWithoutLocked, withoutLocked } from "@/lib/server/features";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { LogOut } from "lucide-react";
import type { Viewer } from "@/lib/domain/types";
import { roleLabel } from "@/lib/domain/policy";
import { logout } from "@/app/(auth)/actions";
import { Avatar } from "@/components/ui";
import { arrangeMenus, hideMenus, hideTabs, navFor, plainGroups, tabsFor, type NavBadges } from "./nav";
import type { AccountPrefs } from "@/lib/server/repo/modules/prefs";
import { SidebarLinks, TabBar } from "./nav-links";
import { SIDEBAR_COOKIE, SidebarFrame } from "./sidebar-frame";
import { GuideButton, Yeongrang } from "./yeongrang";
import { COPYRIGHT, MAKERS_LINE } from "@/lib/domain/credits";
import { GuidePanel } from "@/components/writing/guide-panel";

// D2 벤토 그리드: 흰 사이드바 + 흰 본문. 모바일은 하단 탭바.
export async function AppShell({ viewer, children, demo, badges = {}, prefs }: {
  viewer: Viewer; children: ReactNode; demo: boolean; badges?: NavBadges;
  /** 프로필 사진·숨긴 메뉴·메뉴 순서 (레이아웃이 배지와 함께 읽어 넘긴다) */
  prefs: AccountPrefs;
}) {
  // 메뉴 = 내 역할 메뉴 → 내가 바꾼 순서(N53) → 숨긴 메뉴 빼기. 순서 바꾸기는 교사만
  const base = withoutLocked(navFor(viewer, badges));
  const all = arrangeMenus(base, prefs.menuLayout);
  const arrange = viewer.kind === "teacher" ? { all: plainGroups(all), base: plainGroups(base), hidden: prefs.hiddenMenus } : undefined;
  const mini = (await cookies()).get(SIDEBAR_COOKIE)?.value === "mini";
  const name = viewer.kind === "student" ? viewer.student.name : `${viewer.teacher.name} 선생님`;
  return (
    <div className="min-h-dvh md:flex">
      <SidebarFrame initialMini={mini}>
        {/* 로고 = 홈으로 ("/" 가 역할별 홈으로 보낸다) */}
        <Link href="/" className="flex items-center gap-2.5 px-2 pb-5 group-data-[mini=true]/side:justify-center group-data-[mini=true]/side:px-0" aria-label="홈으로">
          <Image src="/face.png" alt="" width={30} height={32} />
          <Image src="/schs-logo.png" alt="속초고 쌤기부" width={100} height={28} priority className="group-data-[mini=true]/side:hidden" />
        </Link>
        <div className="flex items-center gap-2.5 rounded-control bg-soft py-2 pl-2 pr-3.5 group-data-[mini=true]/side:hidden">
          <Avatar name={name} size={34} src={prefs.avatar} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{name}</div>
            <div className="truncate text-xs text-mute">{roleLabel(viewer)}</div>
          </div>
        </div>
        <SidebarLinks groups={hideMenus(all, prefs.hiddenMenus)} arrange={arrange} />
        {/* 사용 가이드 (Figma 사이드바 아래 카드) → 사용 매뉴얼(새 탭) */}
        <div className="mt-auto pt-6">
          <div className="rounded-inner bg-soft p-4 group-data-[mini=true]/side:hidden">
            <div className="text-[14px] font-bold">사용 가이드</div>
            <div className="mt-0.5 text-[12px] text-mute">{viewer.kind === "student" ? "처음 쓰는 학생을 위한 안내" : "처음 쓰는 선생님을 위한 안내"}</div>
            <GuideButton student={viewer.kind === "student"} />
          </div>
          <div className="hidden group-data-[mini=true]/side:block"><GuideButton mini student={viewer.kind === "student"} /></div>
          <form action={logout} className="pt-2">
            <button className="flex w-full items-center gap-2.5 rounded-control px-3.5 py-2.5 text-[14px] text-mute hover:bg-soft group-data-[mini=true]/side:flex-col group-data-[mini=true]/side:gap-0.5 group-data-[mini=true]/side:px-1 group-data-[mini=true]/side:py-2 group-data-[mini=true]/side:text-[11px]">
              <LogOut size={18} strokeWidth={1.8} /> 로그아웃
            </button>
          </form>
        </div>
      </SidebarFrame>
      <div data-shell-main className="min-h-dvh min-w-0 flex-1 bg-bg pb-28 md:pb-0">
        {demo && (
          <div className="bg-wait-soft px-4 py-2 text-center text-xs text-[#9a6400]">
            데모 모드 · 가짜 데이터예요. 서버를 다시 켜면 처음 상태로 돌아가요
          </div>
        )}
        {children}
        {/* 모든 화면 푸터 (2026-10-21) */}
        <footer className="px-4 pb-6 pt-10 text-center text-[12px] text-mute md:px-10 md:pb-8">
          {COPYRIGHT} <span className="whitespace-nowrap">{MAKERS_LINE}</span>
        </footer>
      </div>
      <TabBar tabs={hideTabs(tabsWithoutLocked(tabsFor(viewer)), prefs.hiddenMenus)} />
      <Yeongrang student={viewer.kind === "student"} />
      {/* 기재요령 찾아보기 (Figma N43): 편집기 머리 버튼 · N34 칩이 연다 */}
      {viewer.kind === "teacher" && <GuidePanel />}
    </div>
  );
}

/** 화면 머리: (작은 날짜·보조 줄) + 제목 + 오른쪽 버튼. Figma 홈 시안은 제목 위에 날짜("10월 16일 금요일")가 있다 */
export function PageHeader({ title, actions, eyebrow }: { title: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="flex items-end gap-2.5 px-4 pb-2 pt-5 md:px-10 md:pt-8">
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="mb-1 text-[13px] text-mute md:text-[14px]">{eyebrow}</div>}
        <h1 className="text-xl font-bold md:text-[28px]">{title}</h1>
      </div>
      {actions}
    </header>
  );
}

/** "10월 16일 금요일" (한국 시간) */
export function todayLabel(now = new Date()): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(now);
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 px-4 pb-10 pt-4 md:gap-6 md:px-10 md:pb-16 md:pt-6">{children}</div>;
}
