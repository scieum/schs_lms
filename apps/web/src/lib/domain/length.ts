// 생기부 초안 분량: 교사가 만들 때마다 단위(바이트/글자)와 최대 분량을 정한다.
// 기본값과 상한은 분류별 NEIS 한도이고, 교사 설정은 그 한도를 넘을 수 없다 (C7).

export type LengthUnit = "bytes" | "chars";
export type DraftCategory = "세특" | "창체-자율" | "창체-동아리" | "창체-진로";

/** 분류별 NEIS 한도(바이트). 2026학년도 고등학교 기재요령 208쪽 「영역별 입력 가능 최대 글자수」: 세특·자율·자치·동아리·진로 모두 500자 */
export const NEIS_MAX_BYTES: Record<DraftCategory, number> = {
  세특: 1500,
  "창체-자율": 1500,
  "창체-동아리": 1500,
  "창체-진로": 1500, // 2026 기재요령: 진로활동 특기사항 500자 (예전 700자)
};
/** 하한 = 최대 × 비율 (rules.yaml length.min_ratio 와 같은 값) */
export const MIN_RATIO = 0.6;

/** 3바이트로 세는 글자: 한글(음절·자모)과 한자·가나. 영문·숫자·기호(·※“”① 등)·공백·엔터는 1 */
const WIDE = /[\u1100-\u11FF\u2E80-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF]/;

/** NEIS 방식 바이트 (2026-10-18 사용자 확인): 한글 3, 영어·숫자·기호·공백 1, 엔터 1 */
export function neisBytes(text: string): number {
  let n = 0;
  for (const ch of text.replace(/\r\n/g, "\n")) {
    n += WIDE.test(ch) ? 3 : 1;
  }
  return n;
}

/** 공백 포함 글자 수 (줄바꿈은 세지 않는다) */
export function charCount(text: string): number {
  return [...text.replace(/\r?\n/g, "")].length;
}

export function measure(text: string, unit: LengthUnit): number {
  return unit === "bytes" ? neisBytes(text) : charCount(text);
}

/** 한도를 단위에 맞게 바꾼다. 글자 단위면 한글 기준(3바이트 = 1글자)으로 나눈다 */
export function neisMax(category: DraftCategory, unit: LengthUnit): number {
  const bytes = NEIS_MAX_BYTES[category];
  return unit === "bytes" ? bytes : Math.floor(bytes / 3);
}

export type LengthSetting = { unit: LengthUnit; max: number };
export type LengthRange = LengthSetting & { min: number; capped: boolean };

/**
 * 교사가 고른 값을 실제 범위로 정한다.
 * - 값이 없으면 NEIS 한도를 그대로 쓴다.
 * - 한도를 넘으면 한도로 낮추고 capped=true 를 돌려준다 (화면에서 알려 준다).
 */
export function resolveLength(category: DraftCategory, setting?: Partial<LengthSetting>): LengthRange {
  const unit = setting?.unit ?? "bytes";
  const limit = neisMax(category, unit);
  const asked = setting?.max && setting.max > 0 ? Math.floor(setting.max) : limit;
  const max = Math.min(asked, limit);
  return { unit, max, min: Math.ceil(max * MIN_RATIO), capped: asked > limit };
}

/** 초안이 범위 안인지 (G2 ① 과 같은 검사) */
export function checkLength(text: string, range: LengthRange): { value: number; ok: boolean; reason?: "too_short" | "too_long" } {
  const value = measure(text, range.unit);
  if (value > range.max) return { value, ok: false, reason: "too_long" };
  if (value < range.min) return { value, ok: false, reason: "too_short" };
  return { value, ok: true };
}

export const UNIT_LABEL: Record<LengthUnit, string> = { bytes: "바이트", chars: "글자" };

// ---------- 봉사 활동내용 50자 (Figma N42 ④) ----------

/** 2026 기재요령 봉사활동 실적 "활동내용" 50자 = 나이스 바이트 150B (한글 3B · 영숫자·공백 1B). 판정은 바이트 */
export const SERVICE_ACTIVITY_MAX_BYTES = 150;

/** 활동내용 길이: 글자 · 바이트 · 넘었는지 (넘어도 막지 않고 경고만) */
export function serviceActivityCheck(text: string | null | undefined): { chars: number; bytes: number; over: boolean } {
  const t = String(text ?? "").trim();
  const bytes = neisBytes(t);
  return { chars: charCount(t), bytes, over: bytes > SERVICE_ACTIVITY_MAX_BYTES };
}

/** 규칙으로 150B 안에 자르기 (AI가 꺼졌을 때 줄인 글 후보): 어절 경계에서 자른다 */
export function cutServiceActivity(text: string, max = SERVICE_ACTIVITY_MAX_BYTES): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (neisBytes(t) <= max) return t;
  let out = "";
  for (const w of t.split(" ")) {
    const next = out ? `${out} ${w}` : w;
    if (neisBytes(next) > max) break;
    out = next;
  }
  if (!out) for (const ch of t) { if (neisBytes(out + ch) > max) break; out += ch; }
  return out.replace(/[,·\s]+$/, "");
}
