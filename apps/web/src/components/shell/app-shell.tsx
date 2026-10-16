import Image from "next/image";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import type { Viewer } from "@/lib/domain/types";
import { roleLabel } from "@/lib/domain/policy";
import { logout } from "@/app/(auth)/actions";
import { Avatar } from "@/components/ui";
import { navFor, tabsFor } from "./nav";
import { SidebarLinks, TabBar } from "./nav-links";
import { Yeongrang } from "./yeongrang";

// D2 벤토 그리드: 흰 사이드바 + 흰 본문. 모바일은 하단 탭바.
export function AppShell({ viewer, children, demo }: { viewer: Viewer; children: ReactNode; demo: boolean }) {
  const name = viewer.kind === "student" ? viewer.student.name : `${viewer.teacher.name} 선생님`;
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-white px-4 pb-5 pt-6 md:flex">
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <Image src="/face.png" alt="" width={30} height={32} />
          <span className="text-[15px] font-bold leading-tight">속초고등학교<br />학생관리시스템</span>
        </div>
        <div className="flex items-center gap-2.5 rounded-control bg-soft py-2 pl-2 pr-3.5">
          <Avatar name={name} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{name}</div>
            <div className="truncate text-xs text-mute">{roleLabel(viewer)}</div>
          </div>
        </div>
        <SidebarLinks groups={navFor(viewer)} />
        <form action={logout} className="mt-auto pt-6">
          <button className="flex w-full items-center gap-2.5 rounded-control px-3.5 py-2.5 text-[15px] text-mute hover:bg-soft">
            <LogOut size={20} strokeWidth={1.8} /> 로그아웃
          </button>
        </form>
      </aside>
      <div className="min-w-0 flex-1 pb-28 md:pb-0">
        {demo && (
          <div className="bg-wait-soft px-4 py-2 text-center text-xs text-[#9a6400]">
            데모 모드 · 가짜 데이터예요. 서버를 다시 켜면 처음 상태로 돌아가요
          </div>
        )}
        {children}
      </div>
      <TabBar tabs={tabsFor(viewer)} />
      <Yeongrang />
    </div>
  );
}

/** 화면 머리: 제목 + 오른쪽 버튼. 경로 표시·부제는 쓰지 않는다 */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex items-center gap-2.5 px-4 pb-2 pt-5 md:px-10 md:pt-8">
      <h1 className="flex-1 text-xl font-bold md:text-[28px]">{title}</h1>
      {actions}
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 px-4 pb-10 pt-4 md:gap-6 md:px-10 md:pb-16 md:pt-6">{children}</div>;
}
