import "server-only";
import type { Teacher } from "@/lib/domain/types";
import { repo } from "@/lib/server/repo";

/** 등록·수정 폼이 같이 쓰는 학생·교사 선택지 */
export async function programFormOptions() {
  const [students, teachers] = await Promise.all([repo.listStudents(), repo.listTeachers()]);
  return {
    students: students
      .sort((a, b) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number)
      .map((s) => ({ id: s.id, name: s.name, classKey: `${s.grade}-${s.classNo}`, label: `${s.grade}-${s.classNo}-${s.number} ${s.name}` })),
    teachers: teachers.sort((a, b) => a.name.localeCompare(b.name, "ko")).map((t) => ({ id: t.id, label: teacherLabel(t) })),
  };
}

function teacherLabel(t: Teacher) {
  if (t.homeroom) return `${t.name} (${t.homeroom.grade}-${t.homeroom.classNo} 담임)`;
  return t.dept ? `${t.name} (${t.dept})` : t.name;
}
