import "server-only";
import { isAdmin } from "@/lib/domain/policy";
import type { Student, Viewer } from "@/lib/domain/types";
import { repo } from "@/lib/server/repo";

// 성적·최저·야자 화면의 "어느 반" 정하기. 담임은 자기 반만, 관리자는 반을 고른다.
// URL 에는 학년-반(예: 2-3)만 쓴다 (학생 이름·학번 아님).

export interface ClassScope {
  grade: number;
  classNo: number;
  key: string; // "2-3"
  students: Student[];
  /** 관리자에게만: 고를 수 있는 반 목록 */
  classes: string[];
}

const parse = (s: string | undefined) => {
  const m = /^(\d)-(\d{1,2})$/.exec(s ?? "");
  return m ? { grade: Number(m[1]), classNo: Number(m[2]) } : null;
};

/** 볼 수 있는 반. 없으면 null (담임 반이 없는 교사) */
export async function classScope(v: Viewer, requested?: string): Promise<ClassScope | null> {
  if (v.kind !== "teacher") return null;
  const all = await repo.listStudents();
  let target: { grade: number; classNo: number } | null = null;
  let classes: string[] = [];
  if (isAdmin(v)) {
    classes = [...new Set(all.map((s) => `${s.grade}-${s.classNo}`))].sort((a, b) => {
      const [ga, ca] = a.split("-").map(Number);
      const [gb, cb] = b.split("-").map(Number);
      return ga - gb || ca - cb;
    });
    const want = parse(requested);
    target = want && classes.includes(`${want.grade}-${want.classNo}`) ? want : v.teacher.homeroom ?? parse(classes[0]);
  } else {
    target = v.teacher.homeroom;
  }
  if (!target) return null;
  const { grade, classNo } = target;
  const students = all.filter((s) => s.grade === grade && s.classNo === classNo).sort((a, b) => a.number - b.number);
  return { grade, classNo, key: `${grade}-${classNo}`, students, classes };
}
