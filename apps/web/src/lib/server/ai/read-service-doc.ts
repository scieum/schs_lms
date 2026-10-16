import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// 봉사활동 확인서(사진·PDF)에서 항목을 읽는다.
// ADR-0001 예외 2: 교사가 버튼을 눌렀을 때만 서버에서 부르고, 결과는 교사가 확인·수정한 뒤에만 저장한다.
// 확인서에는 이름이 적혀 있어 그대로 전달된다 — 학교 승인 전에는 ANTHROPIC_API_KEY 를 비워 두면 꺼진다.

const Fields = z.object({
  studentName: z.string().nullable(),
  studentNo: z.string().nullable(),
  date: z.string().nullable(),
  hours: z.number().nullable(),
  organization: z.string().nullable(),
  activity: z.string().nullable(),
});
export type ServiceDocFields = z.infer<typeof Fields>;

const SYSTEM = `너는 고등학교 봉사활동 확인서를 읽어 항목만 뽑는 도우미다.
- studentName: 봉사한 학생 이름 (기관 담당자 이름이 아님)
- studentNo: 학번이 있으면 숫자만 (예: 20312), 없으면 null
- date: 봉사 날짜 YYYY-MM-DD. 여러 날이면 첫날
- hours: 인정 봉사 시간(숫자, 시간 단위). 분은 시간으로 바꾼다
- organization: 봉사 기관 이름
- activity: 활동 내용 한 줄 (30자 안팎)
읽을 수 없거나 없는 항목은 null 로 둔다. 추측해서 채우지 않는다.`;

export function aiReadEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function readServiceDoc(
  bytes: Uint8Array,
  mime: string,
): Promise<{ ok: true; fields: ServiceDocFields } | { ok: false; error: string }> {
  if (!aiReadEnabled()) return { ok: false, error: "AI 읽기가 꺼져 있어요 (ANTHROPIC_API_KEY 없음)" };
  const client = new Anthropic();
  const data = Buffer.from(bytes).toString("base64");
  const file =
    mime === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: mime as "image/jpeg" | "image/png" | "image/webp", data } } as const);

  try {
    const res = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: "user", content: [file, { type: "text", text: "이 봉사활동 확인서의 항목을 읽어 주세요." }] }],
      output_config: { effort: "low", format: zodOutputFormat(Fields) },
    });
    if (res.stop_reason === "refusal") return { ok: false, error: "이 파일은 AI가 읽지 못했어요. 직접 입력해 주세요" };
    if (!res.parsed_output) return { ok: false, error: "항목을 읽지 못했어요. 직접 입력해 주세요" };
    return { ok: true, fields: res.parsed_output };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "AI 사용량이 많아요. 잠시 뒤 다시 눌러 주세요" };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "AI 키를 확인해 주세요" };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `AI 읽기 실패 (${e.status ?? "연결"})` };
    return { ok: false, error: "AI 읽기 중 문제가 생겼어요" };
  }
}
