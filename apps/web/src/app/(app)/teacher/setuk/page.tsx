import { redirect } from "next/navigation";
import { withQuery } from "@/lib/domain/compose";

// 옛 교과 세특 화면 → 세특 · 글 짓기 (Figma N52). 쿼리(course · section · student · check)는 그대로 넘긴다.
// /teacher/setuk/activity/[id] · /teacher/setuk/export 는 그대로 남는다 (이 파일은 /teacher/setuk 만).
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SetukPage({ searchParams }: Props) {
  redirect(withQuery("/teacher/setuk/compose", await searchParams));
}
