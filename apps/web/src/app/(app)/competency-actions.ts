"use server";
import { can } from "@/lib/domain/policy";
import type { TagResult } from "@/components/writing/competency-view";
import { tagCompetency } from "@/lib/server/ai/merge-record";
import { repo } from "@/lib/server/repo";
import { requireViewer } from "@/lib/server/viewer";

// 역량 보기 확대 (Figma N18): 누가기록·프로그램 초안·생기부 조각·담임 학생 상세·내 생기부에서 이미 화면에 있는 기록 글을
// 문장마다 3대 역량으로 나눈다. 글은 화면이 보낸 것만 쓰고 결과는 그 글의 색칠뿐이라, 학생 정보는 이름 지우기에만 쓰고 돌려주지 않는다.
// AI에는 가명ID로 바꾼 글만 간다 (tagCompetency → scrubIdentity).

export async function tagRecordText(input: { studentId: string; text: string; force?: boolean }): Promise<TagResult> {
  const v = await requireViewer();
  const studentId = String(input.studentId ?? "");
  // 학생은 자기 기록만, 교사는 학생 목록을 볼 수 있으면
  if (v.kind === "student" ? studentId !== v.accountId : !can(v, "student.list")) return { error: "볼 수 없는 학생이에요" };
  const student = v.kind === "student" ? v.student : await repo.getStudent(studentId);
  if (!student) return { error: "학생을 찾지 못했어요" };
  const text = String(input.text ?? "").slice(0, 6000);
  if (!text.trim()) return { error: "기록이 비어 있어요" };
  const r = await tagCompetency(text, student, { force: !!input.force });
  if (r.label === "AI" && !r.cached) await repo.audit(v.accountId, "record.competency", `${student.pseudonymId} ${text.length}자`);
  return r;
}
