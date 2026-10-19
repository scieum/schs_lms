import "server-only";
import { schoolYear } from "@/lib/domain/curriculum";
import { lessonBackground, lessonKindOf, type LessonView } from "@/lib/domain/lesson-plan";
import { scrubIdentity } from "@/lib/domain/writing";
import { seoulNow } from "@/lib/domain/night";
import { makeStudentNo } from "@/lib/domain/roster";
import type { Student } from "@/lib/domain/types";
import { repo } from "./repo";

/** 페이지가 카드 · 편집기에 넘길 차시 메뉴 (Figma N43 ②). 행발처럼 차시 메뉴가 없는 범위는 undefined */
export async function lessonView(scope: string, students: Student[], label: string): Promise<LessonView | undefined> {
  if (!lessonKindOf(scope) || !students.length) return undefined;
  const plan = await repo.getLessonPlan(scope, schoolYear());
  const items = plan?.items ?? [];
  const ids = new Set(students.map((s) => s.id));
  const marks = items.length ? (await repo.listLessonMarks(items.map((i) => i.id))).filter((m) => ids.has(m.studentId)) : [];
  return {
    scope, label, marks, today: seoulNow().date,
    items: items.map(({ id, no, date, title, detail }) => ({ id, no, date, title, detail })),
    students: students.map((s) => ({ id: s.id, no: makeStudentNo(s.grade, s.classNo, s.number), name: s.name })),
    fileName: plan?.plan.fileName ?? null, source: plan?.plan.source ?? null,
  };
}

/**
 * ② AI로 쓰기 "수업 활동 배경" (N43): 이 학생의 차시 메모가 가리키는 차시 중, 고른 조각의 활동명과 같은 차시의 활동 내용.
 * 학생 행동이 아니라 수업 배경으로만 붙인다 (프롬프트: 배경만으로 학생 행동을 지어내지 마라). 학생 이름 · 학번은 지운다.
 */
export async function lessonBackgroundFor(itemIds: (string | null | undefined)[], pieceTexts: string[], student: Student): Promise<string[]> {
  const ids = [...new Set(itemIds.filter((x): x is string => !!x))];
  if (!ids.length) return [];
  const items = await repo.getLessonItems(ids);
  return lessonBackground(items, pieceTexts).map((l) => scrubIdentity(l, student).text);
}
