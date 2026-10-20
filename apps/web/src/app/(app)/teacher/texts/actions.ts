"use server";
import { can } from "@/lib/domain/policy";
import { parseTextsTab, TEXTS_TABS } from "@/lib/domain/texts-view";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";

// 글 모아 보기 (N49 (d)) 모두 복사 감사: 탭 · 숫자만 (이름 · 학번 · 글 없음).
export async function textsCopyLog(input: { tab: string; n: number }): Promise<void> {
  const v = await requireViewer();
  const tab = parseTextsTab(input?.tab);
  if (!can(v, tab === "setuk" ? "setuk.write" : tab === "logs" ? "logs.write" : "record.write")) return;
  const n = Math.max(0, Math.min(999, Math.floor(Number(input?.n) || 0)));
  await repo.audit(v.accountId, "texts.copy_all", `${TEXTS_TABS.find((t) => t.key === tab)!.label} n=${n}`);
}
