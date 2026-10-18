import { withoutLocked } from "@/lib/server/features";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Icon } from "@/components/shell/icon";
import { Card } from "@/components/ui";
import { HOMEROOM_MENU } from "@/components/shell/nav";
import { requireViewer } from "@/lib/server/viewer";

export const metadata = { title: "담임 · 속초고등학교 학생관리시스템" };

/** 모바일 "담임" 탭: 담임 기능을 한곳에 모은 메뉴 */
export default async function HomeroomMenu() {
  const v = await requireViewer();
  if (v.kind !== "teacher" || !v.teacher.homeroom) redirect("/forbidden");
  const { grade, classNo } = v.teacher.homeroom;
  return (
    <>
      <PageHeader eyebrow={`${grade}학년 ${classNo}반`} title="담임" />
      <PageBody>
        {withoutLocked(HOMEROOM_MENU).map((g) => (
          <Card key={g.label} title={g.label}>
            <ul className="flex flex-col gap-1.5">
              {g.items.map((it) => (
                <li key={it.href}>
                  <Link href={it.href} className="flex items-center gap-3 rounded-inner bg-white px-3.5 py-3 hover:ring-2 hover:ring-key-soft">
                    <Icon name={it.icon} size={20} className="text-key" />
                    <span className="flex-1 text-[15px] font-medium">{it.label}</span>
                    <ChevronRight size={18} className="text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </PageBody>
    </>
  );
}
