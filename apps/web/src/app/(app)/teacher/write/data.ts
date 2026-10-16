import "server-only";
import type { RecordArea } from "@/lib/domain/writing";
import { repo } from "@/lib/server/repo";

/** 근거 누가기록: 동아리는 그 동아리 기록, 자율·자치·진로는 그 영역, 행발은 세 영역 전부 */
export async function evidenceLogs(area: RecordArea, studentIds: string[], clubId?: string | null) {
  if (area === "행발") {
    const all = await Promise.all((["자율·자치", "진로", "동아리"] as const).map((a) => repo.listActivityLogs(a, studentIds)));
    return all.flat().sort((a, b) => b.date.localeCompare(a.date));
  }
  const logs = await repo.listActivityLogs(area, studentIds);
  return area === "동아리" && clubId ? logs.filter((l) => l.clubId === clubId) : logs;
}
