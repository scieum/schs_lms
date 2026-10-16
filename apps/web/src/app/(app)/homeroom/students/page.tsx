import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Avatar, Card, StatTiles } from "@/components/ui";
import { canViewStudentRecord, countByStudent, counselStats } from "@/lib/domain/counsel";
import { loadCounsel } from "@/lib/server/counsel";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { makeStudentNo } from "@/lib/domain/roster";

export const metadata = { title: "학생 기록 · 속초고등학교 학생관리시스템" };

/** 학생 기록 모아 보기: 담임은 우리 반, 관리자는 전체 */
export default async function HomeroomStudentsPage() {
  const v = await requireCan("homeroom.view");
  const students = (await repo.listStudents())
    .filter((s) => canViewStudentRecord(v, s))
    .sort((a, b) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number);
  const counsel = await loadCounsel(v, students);
  const counts = countByStudent(counsel);
  const stats = counselStats(students.map((s) => s.id), counsel);
  const corrections = await repo.listCorrectionRequests(students.map((s) => s.id));
  const waiting = new Set(corrections.filter((c) => c.status === "requested").map((c) => c.studentId));

  return (
    <>
      <PageHeader title="학생 기록" />
      <PageBody>
        <StatTiles items={[
          ["학생", `${stats.students}명`],
          ["이번 학기 상담", `${stats.semester}건`],
          ["상담 없음", `${stats.none}명`],
          ["정정 요청", `${waiting.size}명`],
        ]} />
        <Card title="학생">
          {students.length === 0 ? (
            <p className="py-6 text-center text-sm text-mute">볼 수 있는 학생이 없어요</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {students.map((s) => (
                <li key={s.id}>
                  <Link href={`/homeroom/students/${s.id}`} className="flex items-center gap-3 rounded-inner bg-white p-3.5 hover:ring-2 hover:ring-key-soft">
                    <Avatar name={s.name} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{s.name}</span>
                      <span className="block truncate text-xs text-mute">
                        {makeStudentNo(s.grade, s.classNo, s.number)} · {counts.get(s.id) ? `상담 ${counts.get(s.id)}` : "상담 없음"}{waiting.has(s.id) ? " · 정정 요청" : ""}
                      </span>
                    </span>
                    <ChevronRight size={18} className="text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
