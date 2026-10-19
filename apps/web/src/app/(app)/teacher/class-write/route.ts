import { can } from "@/lib/domain/policy";
import type { WriteOutcome } from "@/lib/domain/class-write";
import { getViewer } from "@/lib/server/viewer";
import { classWriteSetuk } from "../setuk/actions";
import { classWriteRecord } from "../write/actions";

// 반 전체 글 쓰기 (Figma N42 ①): 학생 한 명 = 요청 하나.
// 서버 액션은 화면에서 한 번에 하나씩만 보내지므로(Next.js 순서 보내기), 3명 동시 쓰기는 이 라우트로 부른다.
// 권한 확인 · 쓰기 · 저장은 classWriteSetuk / classWriteRecord 가 한다. 학생 한 명 Sonnet 쓰기 ~10~25초 → 60초까지.
export const maxDuration = 60;

const json = (o: WriteOutcome, status = 200) => Response.json(o, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const v = await getViewer();
  if (!v || v.mustChangePassword || v.kind !== "teacher") return json({ status: "failed", error: "다시 로그인해 주세요" }, 401);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ status: "failed", error: "입력을 확인해 주세요" }, 400);
  }
  const common = { studentId: String(body.studentId ?? ""), runId: String(body.runId ?? ""), target: Number(body.target), rewrite: body.rewrite === true };
  if (body.kind === "setuk") {
    if (!can(v, "setuk.write")) return json({ status: "failed", error: "권한이 없어요" }, 403);
    return json(await classWriteSetuk({ ...common, courseId: String(body.courseId ?? "") }));
  }
  if (body.kind === "record") {
    if (!can(v, "record.write")) return json({ status: "failed", error: "권한이 없어요" }, 403);
    return json(await classWriteRecord({ ...common, area: String(body.area ?? ""), clubId: body.clubId ? String(body.clubId) : null }));
  }
  return json({ status: "failed", error: "범위를 골라 주세요" }, 400);
}
