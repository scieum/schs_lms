import "server-only";
import data from "@/lib/data/standards-2022-high.json";
import { findSubject, standardsBlock, type SubjectStandards } from "@/lib/domain/standards";

// 세특 AI 초안·합치기에 그 과목 성취기준을 붙인다 (Figma 화면 변화 없음, AI 입력만). 데이터에 없는 과목이면 빈 글.
const SUBJECTS = data.subjects as Record<string, SubjectStandards>;

/** 루브릭 성취기준 고르기 (N72): 과목의 성취기준 전부 (단원 이름 붙임). 데이터에 없는 과목이면 null */
export function subjectStandardList(subject: string | null | undefined): { name: string; items: { code: string; text: string; unit: string }[] } | null {
  const hit = subject ? findSubject(SUBJECTS, subject) : null;
  return hit ? { name: hit[0], items: hit[1].units.flatMap((u) => u.standards.map((s) => ({ ...s, unit: u.name }))) } : null;
}

export function subjectStandards(subject: string | null | undefined, activity: string): string {
  if (!subject) return "";
  const hit = findSubject(SUBJECTS, subject);
  return hit ? standardsBlock(hit[0], hit[1], activity) : "";
}
