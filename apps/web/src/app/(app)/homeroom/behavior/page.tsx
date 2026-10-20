import { redirect } from "next/navigation";
import { withQuery } from "@/lib/domain/compose";

// 옛 행발 화면 → 담임 · 글 짓기 행발 탭 (Figma N52). 쿼리(student · check)는 그대로.
// 키워드 메뉴판 · 고른 키워드 · 행발 초안 서버 동작(./actions.ts)은 그대로 쓴다.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BehaviorPage({ searchParams }: Props) {
  const { tab: _tab, ...q } = await searchParams;
  void _tab;
  redirect(withQuery("/homeroom/compose", { tab: "behavior", ...q }));
}
