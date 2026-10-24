// 도장 만들기 (도구, Figma N71): 이름 글자 · 모양 · 글꼴 · 색을 골라 투명 배경 PNG로 내려받는다.
// 그림은 브라우저 캔버스에서 그린다. 여기는 글자 고르기와 칸 나누기 규칙만.

export type StampShape = "원형" | "사각" | "타원";
export const STAMP_SHAPES: StampShape[] = ["원형", "사각", "타원"];

/** 글꼴: Google Fonts 이름 · 굵기. 도장 칸 미리보기와 캔버스가 같은 글꼴을 쓴다 */
export interface StampFont { id: string; label: string; family: string; weight: number }
export const STAMP_FONTS: StampFont[] = [
  { id: "myeongjo", label: "명조", family: "Noto Serif KR", weight: 700 },
  { id: "gowun", label: "고운바탕", family: "Gowun Batang", weight: 700 },
  { id: "songmyung", label: "송명", family: "Song Myung", weight: 400 },
  { id: "brush", label: "붓글씨", family: "Nanum Brush Script", weight: 400 },
  { id: "blackhan", label: "굵은 고딕", family: "Black Han Sans", weight: 400 },
  { id: "dohyeon", label: "도현", family: "Do Hyeon", weight: 400 },
  { id: "yeonsung", label: "연성", family: "Yeon Sung", weight: 400 },
  { id: "gaegu", label: "손글씨", family: "Gaegu", weight: 700 },
];

/** 글꼴 모두를 한 번에 받는 Google Fonts 주소 */
export function stampFontsHref(fonts = STAMP_FONTS): string {
  const q = fonts.map((f) => `family=${f.family.replace(/ /g, "+")}${f.weight !== 400 ? `:wght@${f.weight}` : ""}`).join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

/** 기본 빨강(인주) 다음에 자주 쓰는 색. 직접 고르기도 된다 */
export const STAMP_COLORS = [
  { name: "빨강", hex: "#D32F2F" },
  { name: "주홍", hex: "#E8501F" },
  { name: "자주", hex: "#B0175F" },
  { name: "남색", hex: "#1F3A93" },
  { name: "초록", hex: "#1B7F4B" },
  { name: "검정", hex: "#191F28" },
] as const;
export const STAMP_DEFAULT_COLOR = STAMP_COLORS[0].hex;
export const STAMP_SIZES = [300, 600, 1200] as const;
export const STAMP_MAX_CHARS = 4;

/** "d32f2f" · "#D32F2F" · "#d32" → "#D32F2F". 아니면 null */
export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) return `#${[...s].map((c) => c + c).join("")}`.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(s)) return `#${s}`.toUpperCase();
  return null;
}

/** 새길 글자: 띄어쓰기 빼고 최대 4자. withIn 이면 3자 이하일 때 끝에 '인' */
export function stampChars(text: string, withIn: boolean): string[] {
  const chars = Array.from(text.replace(/\s+/g, "")).slice(0, STAMP_MAX_CHARS);
  if (withIn && chars.length > 0 && chars.length < STAMP_MAX_CHARS) chars.push("인");
  return chars;
}

/** 글자 칸: 도장 크기 1 기준 가운데 좌표 · 너비 · 높이 */
export interface StampCell { char: string; cx: number; cy: number; w: number; h: number }

/** 모양 테두리: 도장 크기 1 기준 (가운데 0.5, 0.5) */
export function stampOutline(shape: StampShape): { w: number; h: number; stroke: number; radius: number } {
  if (shape === "타원") return { w: 0.68, h: 0.96, stroke: 0.04, radius: 0 };
  if (shape === "사각") return { w: 0.92, h: 0.92, stroke: 0.045, radius: 0.06 };
  return { w: 0.94, h: 0.94, stroke: 0.045, radius: 0 };
}

/** 글자를 넣을 안쪽 상자 (테두리 안쪽, 원은 내접 사각형) */
function innerBox(shape: StampShape): { w: number; h: number } {
  const o = stampOutline(shape);
  if (shape === "타원") return { w: o.w * 0.6, h: o.h * 0.72 };
  if (shape === "사각") return { w: o.w - o.stroke * 2 - 0.16, h: o.h - o.stroke * 2 - 0.16 };
  return { w: o.w * 0.6, h: o.h * 0.6 };
}

/**
 * 칸 나누기 — 1자 = 가운데, 2자 = 세로 한 줄, 3자 = 오른쪽 줄 1자(성) · 왼쪽 줄 2자,
 * 4자 = 2×2 (오른쪽 줄 위→아래, 다음 왼쪽 줄). 타원은 늘 세로 한 줄.
 */
export function stampCells(chars: string[], shape: StampShape): StampCell[] {
  const n = chars.length;
  if (n === 0) return [];
  const box = innerBox(shape);
  const left = 0.5 - box.w / 2, top = 0.5 - box.h / 2;
  const col = (x0: number, w: number, list: string[]): StampCell[] =>
    list.map((char, i) => ({ char, cx: x0 + w / 2, cy: top + (box.h / list.length) * (i + 0.5), w, h: box.h / list.length }));
  if (shape === "타원" || n <= 2) return col(left, box.w, chars);
  const half = box.w / 2;
  if (n === 3) return [...col(left + half, half, chars.slice(0, 1)), ...col(left, half, chars.slice(1))];
  return [...col(left + half, half, chars.slice(0, 2)), ...col(left, half, chars.slice(2))];
}

/** 글자 하나를 칸에 맞추는 가로 · 세로 배율. 도장처럼 칸을 채우되 한쪽으로 maxStretch 배 넘게 늘리지 않는다 */
export function fitGlyph(glyph: { w: number; h: number }, cell: { w: number; h: number }, fill = 0.9, maxStretch = 1.35): { sx: number; sy: number } {
  if (glyph.w <= 0 || glyph.h <= 0) return { sx: 1, sy: 1 };
  const sx = (cell.w * fill) / glyph.w, sy = (cell.h * fill) / glyph.h;
  const base = Math.min(sx, sy);
  return { sx: Math.min(sx, base * maxStretch), sy: Math.min(sy, base * maxStretch) };
}

/** 내려받을 파일 이름: "도장_김속초_600.png" */
export function stampFileName(text: string, size: number): string {
  const name = Array.from(text.replace(/[\s\\/:*?"<>|]+/g, "")).slice(0, STAMP_MAX_CHARS).join("") || "도장";
  return `도장_${name}_${size}.png`;
}
