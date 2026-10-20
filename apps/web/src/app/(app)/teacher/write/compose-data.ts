import "server-only";
import { schoolYear } from "@/lib/domain/curriculum";
import { firstStudent } from "@/lib/domain/compose";
import { makeStudentNo } from "@/lib/domain/roster";
import type { Student } from "@/lib/domain/types";
import { latestRecordByStudent, recordMax, recordStatus, type RecordArea } from "@/lib/domain/writing";
import { provView } from "@/lib/server/provenance";
import { repo } from "@/lib/server/repo";
import { recordSourcePool } from "./actions";

// 글 짓기 (Figma N52) 기록 영역(동아리 · 행발 · 자율·자치 · 진로) 공통 데이터: 학생 목록 · 상태 · 고른 학생 · 지금 글 · AI 원안 · 근거 표.
// 옛 /teacher/write 작업 화면(RecordWorkspace)과 같은 것을 읽는다.
export async function recordComposeData(area: RecordArea, students: Student[], want: string | undefined, clubId?: string) {
  const ids = students.map((s) => s.id);
  const latest = latestRecordByStudent(await repo.listRecordDrafts({ area, year: schoolYear(), studentIds: ids }));
  const list = students.map((s) => ({ id: s.id, no: makeStudentNo(s.grade, s.classNo, s.number), name: s.name, status: recordStatus(latest.get(s.id)) }));
  const pick = firstStudent(list, want);
  const selected = pick ? students.find((s) => s.id === pick.id) : undefined;
  if (!selected) return { list, selected: undefined } as const;
  const cur = latest.get(selected.id);
  const [pv, pool, settings] = await Promise.all([provView(cur), recordSourcePool(area, selected.id, clubId), repo.getProvenanceSettings()]);
  const unit = cur?.unit ?? ("bytes" as const);
  return {
    list,
    selected,
    editor: {
      initial: cur?.content ?? "",
      unit,
      // 늘 나이스 한도에서 시작 (2026-10-20 사용자: 지난번 저장한 최대를 이어 쓰지 않음)
      max: recordMax(area, unit),
      confirmed: cur?.status === "confirmed",
      who: { name: selected.name, studentNo: selected.studentNo, grade: selected.grade, classNo: selected.classNo, number: selected.number },
      prov: { original: pv.original, pins: pv.pins, pool, editRatioMin: settings.editRatioMin, who: selected.name },
    },
  } as const;
}
