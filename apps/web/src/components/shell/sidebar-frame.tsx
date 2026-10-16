"use client";
import { useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export const SIDEBAR_COOKIE = "sidebar";

// 접을 수 있는 사이드바 틀. 접으면 아이콘 + 작은 글씨만 (data-mini 로 안쪽 스타일을 바꾼다).
// 상태는 쿠키에 둬서 서버가 처음부터 같은 모양으로 그린다 (깜빡임 없음).
export function SidebarFrame({ initialMini, children }: { initialMini: boolean; children: ReactNode }) {
  const [mini, setMini] = useState(initialMini);
  const toggle = () => {
    const next = !mini;
    setMini(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "mini" : "full"}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <aside
      data-mini={mini}
      className="group/side sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-line bg-white px-4 pb-5 pt-6 transition-[width] duration-200 data-[mini=true]:w-[84px] data-[mini=true]:px-2 md:flex"
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={mini ? "사이드바 펼치기" : "사이드바 접기"}
        title={mini ? "펼치기" : "접기"}
        className="absolute right-2 top-7 z-10 rounded-control p-1.5 text-faint hover:bg-soft hover:text-sub group-data-[mini=true]/side:static group-data-[mini=true]/side:mx-auto group-data-[mini=true]/side:mb-2"
      >
        {mini ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>
      {children}
    </aside>
  );
}
