// 생기부 초안 분량: 교사가 만들 때마다 단위(바이트/글자)와 최대 분량을 정한다.
// 기본값과 상한은 분류별 NEIS 한도이고, 교사 설정은 그 한도를 넘을 수 없다 (C7).

export type LengthUnit = "bytes" | "chars";
export type DraftCategory = "세특" | "창체-자율" | "창체-동아리" | "창체-진로";

/** 분류별 NEIS 한도(바이트). OI-5 기준표 확정 전 임시값 — 하네스 rules.yaml 초기값과 같다 */
export const NEIS_MAX_BYTES: Record<DraftCategory, number> = {
  세특: 1500,
  "창체-자율": 1500,
  "창체-동아리": 1500,
  "창체-진로": 2100, // 진로활동 특기사항은 700자
};
/** 하한 = 최대 × 비율 (rules.yaml length.min_ratio 와 같은 값) */
export const MIN_RATIO = 0.6;

/** NEIS 방식 바이트: 한글 등 2바이트 넘는 문자 3, 영문·숫자·공백·기호 1, 줄바꿈 2 (OI-5에서 확인 필요) */
export function neisBytes(text: string): number {
  let n = 0;
  for (const ch of text.replace(/\r\n/g, "\n")) {
    if (ch === "\n") n += 2;
    else n += ch.charCodeAt(0) <= 0x7f ? 1 : 3;
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
