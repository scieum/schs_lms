import "server-only";
import { MATERIAL_TYPES } from "@/lib/domain/program";
import type { Student } from "@/lib/domain/types";
import type { EvidenceFile } from "./ai/read-evidence";
import { readUpload } from "./hwpx";

// 자료로 쓰기: 폼에서 파일 하나를 꺼내 검사한다. 한 번에 한 파일 (Vercel 요청 4.5MB 한도 — 큰 PDF는 브라우저가 나눠 보낸다)

export const EVIDENCE_MAX_BYTES = 4 * 1024 * 1024;

export async function takeEvidenceFile(form: FormData): Promise<EvidenceFile | string> {
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) return "파일을 골라 주세요";
  if (f.size > EVIDENCE_MAX_BYTES) return `${f.name}: 4MB까지 읽을 수 있어요. PDF는 쪽을 나눠 올려 주세요`;
  const up = await readUpload(f);
  if (typeof up === "string") return up;
  if (!(MATERIAL_TYPES as readonly string[]).includes(up.mime)) return `${f.name}: PDF·이미지(JPG·PNG·WEBP)·HWPX·TXT만 읽을 수 있어요`;
  return up;
}

/** 가릴 사람: 고른 학생 + 같은 반 학생 (모둠 보고서 속 다른 이름까지) */
export function peopleAround(student: Student, all: Student[]) {
  return all.filter((s) => s.id === student.id || (s.grade === student.grade && s.classNo === student.classNo)).map((s) => ({ name: s.name, studentNo: s.studentNo }));
}
