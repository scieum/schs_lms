import { csvCell, kstDateLabel, kstTime } from "@/lib/domain/accounts";
import { can } from "@/lib/domain/policy";
import { repo } from "@/lib/server/repo";
import { getViewer } from "@/lib/server/viewer";
import { PERIODS, readPeriod } from "../labels";
import { loadAudit } from "../load";

// 감사 로그 CSV 내보내기 (엑셀에서 한글이 깨지지 않게 BOM). 학생은 가명ID로만 나간다.
export async function GET(req: Request) {
  const v = await getViewer();
  if (!v || !can(v, "audit.view")) return new Response("권한이 없어요", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const sp = new URL(req.url).searchParams;
  const period = readPeriod(sp.get("p") ?? undefined);
  const q = (sp.get("q") ?? "").trim().slice(0, 40);
  const { rows } = await loadAudit(period, q, sp.get("flag") === "1");

  const lines = [
    ["날짜", "시각", "사람", "행동", "대상", "이상 표시", "행동 코드"],
    ...rows.map((r) => [kstDateLabel(r.at), kstTime(r.at), r.actor, r.label, r.target ?? "", r.flag ?? "", r.action]),
  ].map((cols) => cols.map(csvCell).join(","));
  await repo.audit(v.accountId, "audit.export", `${PERIODS.find(([k]) => k === period)?.[1]} ${rows.length}건`);

  const file = `감사로그_${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit.csv"; filename*=UTF-8''${encodeURIComponent(file)}`,
      "Cache-Control": "no-store",
    },
  });
}
