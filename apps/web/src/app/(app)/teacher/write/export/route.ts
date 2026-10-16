import { homeroomStudents } from "@/lib/domain/activity";
import { schoolYear } from "@/lib/domain/curriculum";
import { neisBytes } from "@/lib/domain/length";
import { can } from "@/lib/domain/policy";
import type { Student } from "@/lib/domain/types";
import { canWriteRecord, isRecordArea, latestRecordByStudent, RECORD_MAX_BYTES } from "@/lib/domain/writing";
import { repo } from "@/lib/server/repo";
import { getViewer } from "@/lib/server/viewer";

// 나이스 입력 도우미(크롬 확장)용 내보내기: 확정된 창체 특기사항·행발만. 형식은 세특 내보내기와 같은 schs-neis/1.
// ?area=자율·자치|동아리|진로|행발 (&club=<동아리 id>)
const KIND = { "자율·자치": "창체-자율·자치", 동아리: "창체-동아리", 진로: "창체-진로", 행발: "행동특성 및 종합의견" } as const;

const text = (msg: string, status: number) => new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request) {
  const v = await getViewer();
  if (!v || !can(v, "record.write")) return text("권한이 없어요", 403);
  const url = new URL(req.url);
  const area = url.searchParams.get("area");
  if (!isRecordArea(area)) return text("영역을 골라 주세요", 400);

  const all = await repo.listStudents();
  let students: Student[];
  let clubName: string | null = null;
  if (area === "동아리") {
    const club = await repo.getClub(url.searchParams.get("club") ?? "");
    if (!club || club.advisorId !== v.accountId) return text("내 동아리가 아니에요", 404);
    const memberIds = new Set(await repo.listClubMembers(club.id));
    students = all.filter((s) => canWriteRecord(v, area, s, { advisorId: club.advisorId, memberIds }));
    clubName = club.name;
  } else {
    students = homeroomStudents(v, all).filter((s) => canWriteRecord(v, area, s));
  }
  if (!students.length) return text("내보낼 학생이 없어요", 404);

  const year = schoolYear();
  const latest = latestRecordByStudent(await repo.listRecordDrafts({ area, year, studentIds: students.map((s) => s.id) }));
  const rows = students
    .map((s) => ({ s, r: latest.get(s.id) }))
    .filter(({ r }) => r?.status === "confirmed" && r.content.trim())
    .sort((a, b) => a.s.grade - b.s.grade || a.s.classNo - b.s.classNo || a.s.number - b.s.number)
    .map(({ s, r }) => ({ grade: s.grade, classNo: s.classNo, number: s.number, name: s.name, content: r!.content, bytes: neisBytes(r!.content) }));

  const body = {
    format: "schs-neis/1",
    kind: KIND[area],
    subject: clubName ?? KIND[area],
    year,
    grade: students[0].grade,
    semester: null,
    maxBytes: RECORD_MAX_BYTES[area],
    exportedAt: new Date().toISOString(),
    students: rows,
  };
  await repo.audit(v.accountId, "record.export", `${area} ${rows.length}명`);
  const file = `${KIND[area]}${clubName ? `_${clubName}` : ""}_${year}.json`;
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="record.json"; filename*=UTF-8''${encodeURIComponent(file)}`,
      "Cache-Control": "no-store",
    },
  });
}
