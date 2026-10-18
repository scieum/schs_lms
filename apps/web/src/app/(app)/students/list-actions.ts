"use server";
import { listLines, type RosterLine } from "@/lib/domain/class-roster";
import { readTemplateFile } from "@/lib/server/excel";
import { requireCan } from "@/lib/server/viewer";

// 엑셀로 학생 넣기 (Figma N25): 명단_양식.xlsx 만 읽어 명단 줄을 돌려준다. 학생 찾기는 화면이 가진 학생 목록 안에서 한다
// (프로그램 대상 · 동아리 부원 · 누가기록마다 고를 수 있는 학생이 달라서). 저장은 각 화면의 저장 버튼이 하고 거기서 다시 확인한다.

export type ListFileResult = { lines?: RosterLine[]; error?: string };

export async function readStudentListFile(form: FormData): Promise<ListFileResult> {
  await requireCan("student.list");
  const r = await readTemplateFile(form.get("file"), "list");
  if ("error" in r) return { error: r.error };
  const lines = listLines(r.body);
  return lines.length ? { lines } : { error: "학생 줄이 없어요. 2행부터 학번이나 학년·반·번호를 적어 주세요" };
}
