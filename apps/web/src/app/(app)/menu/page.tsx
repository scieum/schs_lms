import { withoutLocked } from "@/lib/server/features";
import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { hideMenus, navFor } from "@/components/shell/nav";
import { Avatar, Button } from "@/components/ui";
import { roleLabel } from "@/lib/domain/policy";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";
import { MenuSearch } from "./menu-search";

export const metadata = { title: "메뉴 · 속초고등학교 학생관리시스템" };

/** 전체 메뉴 (Figma N15, 모바일 다섯째 탭): 내 정보 · 메뉴 찾기 · 사이드바 묶음 전부(숨긴 메뉴 제외) · 로그아웃 */
export default async function MenuPage() {
  const v = await requireViewer();
  const name = v.kind === "student" ? v.student.name : `${v.teacher.name} 선생님`;
  const prefs = await repo.getPrefs(v.accountId).catch(() => ({ avatar: null, hiddenMenus: [] as string[] }));
  const groups = hideMenus(withoutLocked(navFor(v)), prefs.hiddenMenus).map((g) => ({ label: g.label, items: g.items.map((it) => ({ label: it.label, href: it.href, icon: it.icon })) }));

  return (
    <div className="flex flex-col gap-3.5 px-5 pb-7 pt-3 md:mx-auto md:max-w-[640px] md:pt-8">
      <h1 className="text-[22px] font-bold">메뉴</h1>
      <Link href="/me" className="surface flex items-center gap-3 rounded-card py-3.5 pl-4 pr-3">
        <Avatar name={name} size={48} src={prefs.avatar} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-bold">{name}</span>
          <span className="block truncate text-[13px] font-medium text-mute">{roleLabel(v)}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap text-[13px] font-medium text-sub">내 정보 · 설정</span>
        <ChevronRight size={16} className="shrink-0 text-mute" />
      </Link>

      <MenuSearch groups={groups} />

      {v.kind === "teacher" && (
        <Link href="/me" className="flex items-center justify-center gap-1 py-1 text-[13px]">
          {prefs.hiddenMenus.length > 0 && <span className="font-medium text-mute">숨긴 메뉴 {prefs.hiddenMenus.length} ·</span>}
          <span className="font-bold text-sub">메뉴 보이기 설정</span>
          <ChevronRight size={14} className="text-sub" />
        </Link>
      )}
      <form action={logout}>
        <Button kind="outline" className="w-full"><LogOut size={18} /> 로그아웃</Button>
      </form>
    </div>
  );
}
