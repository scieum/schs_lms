import "server-only";
import { z } from "zod";
import { aiEnabled, aiJson, fileBlock } from "./claude";

// 봉사활동 확인서(사진·PDF)에서 항목을 읽는다.
// ADR-0001 예외 2: 교사가 버튼을 눌렀을 때만 서버에서 부르고, 결과는 교사가 확인·수정한 뒤에만 저장한다.
// 확인서에는 이름이 적혀 있어 그대로 전달된다 — 학교 승인 전에는 ANTHROPIC_API_KEY 를 비워 두면 꺼진다.
// 단체 확인서(여러 학생이 한 장에)도 있어 학생은 목록으로 읽는다.

const Fields = z.object({
  students: z.array(z.object({
    studentName: z.string().nullable(),
    studentNo: z.string().nullable(),
    /** 학생마다 시간이 따로 적힌 단체 확인서면 그 시간, 아니면 null */
    hours: z.number().nullable(),
  })),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  hours: z.number().nullable(),
  organization: z.string().nullable(),
  activity: z.string().nullable(),
});
export type ServiceDocFields = z.infer<typeof Fields>;

const SYSTEM = `너는 고등학교 봉사활동 확인서를 읽어 항목만 뽑는 도우미다.
- students: 봉사한 학생 목록 (기관 담당자·확인자 이름은 넣지 않는다). 한 명이면 한 칸.
  - studentName: 학생 이름, studentNo: 학번이 있으면 숫자만 (예: 20312), 없으면 null
  - hours: 단체 확인서처럼 학생마다 시간이 따로 적혀 있으면 그 학생의 시간, 아니면 null
- startDate: 봉사 시작일 YYYY-MM-DD
- endDate: 봉사 마감일 YYYY-MM-DD. 하루 봉사면 startDate 와 같게
- hours: 인정 봉사 시간 합계(숫자, 시간 단위). 분은 시간으로 바꾼다
- organization: 봉사 기관 이름
- activity: 활동 내용 한 줄 (30자 안팎)
읽을 수 없거나 없는 항목은 null 로 둔다. 추측해서 채우지 않는다.
이 작업은 학생 연결을 위해 확인서에 적힌 이름·학번을 그대로 옮겨 적는 예외다(ADR-0001 예외 2). 적혀 있지 않은 이름·학번은 만들지 않는다.`;

export function aiReadEnabled(): boolean {
  return aiEnabled();
}

export async function readServiceDoc(
  bytes: Uint8Array,
  mime: string,
): Promise<{ ok: true; fields: ServiceDocFields } | { ok: false; error: string }> {
  // 확인서는 표가 흐리거나 손글씨가 섞이므로 정확도 높은 모델("write")로 읽는다
  const r = await aiJson(Fields, {
    system: SYSTEM,
    content: [fileBlock(bytes, mime), { type: "text", text: "이 봉사활동 확인서의 항목을 읽어 주세요." }],
    model: "write",
    maxTokens: 3000,
  });
  return r.ok ? { ok: true, fields: r.data } : { ok: false, error: r.error };
}
