"use server";
import { fileRows } from "@/lib/server/roster-file";
import { requireCan } from "@/lib/server/viewer";

// 엑셀로 학생 넣기 (Figma N17): 명단 파일을 표로만 읽어 돌려준다. 학생 찾기는 화면이 가진 학생 목록 안에서 한다
// (프로그램 대상 · 동아리 부원 · 누가기록마다 고를 수 있는 학생이 달라서). 저장은 각 화면의 저장 버튼이 하고 거기서 다시 확인한다.

export type ListFileResult = { rows?: string[][]; error?: string };

export async function readStudentListFile(form: FormData): Promise<ListFileResult> {
  await requireCan("student.list");
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) return { error: "명단 파일을 골라 주세요" };
  const r = await fileRows(f);
  if (typeof r === "string") return { error: r };
  return { rows: r.slice(0, 1000).map((row) => row.slice(0, 30).map((c) => String(c ?? "").slice(0, 100))) };
}
