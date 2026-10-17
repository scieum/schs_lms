import { neisBytes } from "./length";

// 나이스 입력 (Figma N9): 나이스로 보낼 기록 묶음마다 '확정 n / 전체 m명 · 초과 · 미확정' 을 센다.
// 확장 프로그램은 확정된 것만 받고, 바이트를 넘는 학생은 채우지 않는다.

export type NeisGroup = "교과 세특" | "창체" | "행발";

export type NeisSet = {
  key: string;
  group: NeisGroup;
  title: string;
  sub: string;
  /** 내보내기 주소 (schs-neis/1 JSON) */
  exportHref: string;
  /** 작성하는 화면 */
  editHref: string;
  total: number;
  confirmed: number;
  /** 확정했지만 나이스 바이트를 넘는 학생 (확장이 채우지 않는다) */
  over: number;
  maxBytes: number;
};

type Rec = { status: string; content: string } | undefined;

export function countReady(studentIds: string[], latest: Map<string, Rec>, maxBytes: number) {
  let confirmed = 0;
  let over = 0;
  for (const id of studentIds) {
    const r = latest.get(id);
    if (r?.status !== "confirmed" || !r.content.trim()) continue;
    confirmed++;
    if (neisBytes(r.content) > maxBytes) over++;
  }
  return { total: studentIds.length, confirmed, over };
}

/** 묶음 상태 한 줄: 다 됐으면 null, 아니면 무엇이 남았는지 */
export function readyNote(s: Pick<NeisSet, "total" | "confirmed" | "over">): { tone: "wait" | "bad"; text: string }[] {
  const out: { tone: "wait" | "bad"; text: string }[] = [];
  if (s.over) out.push({ tone: "bad", text: `초과 ${s.over}` });
  if (s.total > s.confirmed) out.push({ tone: "wait", text: `미확정 ${s.total - s.confirmed}` });
  return out;
}
