// 성취수준 고르기 (Figma N35 ③): 세특 ② 본문 만들기에서 학생마다 수준을 골라 AI 초안의 말투만 바꾼다.
// 학교 설정 5단계(2022 개정 고교 A~E, 기본) 또는 3단계(상·중·하 → A·C·D 말투). 수준 글자는 글에 넣지 않는다.

export type ScaleKey = "A-E" | "상중하";
export const SCALE_KEYS: ScaleKey[] = ["A-E", "상중하"];
export type Level = "A" | "B" | "C" | "D" | "E" | "상" | "중" | "하";
export const ALL_LEVELS: Level[] = ["A", "B", "C", "D", "E", "상", "중", "하"];

export type LevelInfo = { level: Level; name: string; tone: string; example: string };

const FIVE: LevelInfo[] = [
  { level: "A", name: "매우 우수", tone: "깊이 이해하고 스스로 넓혀 감 · 주도적으로", example: "원리를 스스로 확장해 설명함 · 주도적으로 탐구를 이끎" },
  { level: "B", name: "우수", tone: "정확히 이해하고 성실하게 해냄", example: "정확하게 설명함 · 꼼꼼히 정리함" },
  { level: "C", name: "보통", tone: "기본 개념을 이해하고 과제를 수행함", example: "기본 개념을 이해하고 실험을 수행함" },
  { level: "D", name: "미흡", tone: "기본 개념을 익히려 꾸준히 노력함(노력·참여 중심)", example: "모둠 활동에 참여하며 개념을 익혀 감" },
  { level: "E", name: "매우 미흡", tone: "활동에 참여하며 기초를 다져 감(참여 사실 중심)", example: "실험 과정에 참여하며 기초를 다짐" },
];
const byLevel = (l: Level) => FIVE.find((x) => x.level === l)!;
/** 3단계: 상 = A, 중 = C, 하 = D 말투 */
const THREE_MAP: Record<"상" | "중" | "하", Level> = { 상: "A", 중: "C", 하: "D" };
const THREE: LevelInfo[] = (["상", "중", "하"] as const).map((l) => ({ ...byLevel(THREE_MAP[l]), level: l, name: byLevel(THREE_MAP[l]).name }));

export const ACHIEVEMENT_SCALES: Record<ScaleKey, LevelInfo[]> = { "A-E": FIVE, 상중하: THREE };
export const SCALE_TAG: Record<ScaleKey, string> = { "A-E": "5단계 · A~E", 상중하: "3단계 · 상·중·하" };

/** app_state achievement_scale 값 → 단계 (모르면 A-E) */
export function scaleOf(value: unknown): ScaleKey {
  return value === "상중하" ? "상중하" : "A-E";
}

export function isLevel(v: unknown): v is Level {
  return typeof v === "string" && (ALL_LEVELS as string[]).includes(v);
}

/** 이 단계에서 고를 수 있는 수준인지 */
export function levelIn(scale: ScaleKey, v: unknown): v is Level {
  return ACHIEVEMENT_SCALES[scale].some((x) => x.level === v);
}

export function levelInfo(level: Level): LevelInfo {
  return [...FIVE, ...THREE].find((x) => x.level === level)!;
}

/** 프롬프트에 넣는 말투 한 줄 */
export function toneLine(level: Level): string {
  return levelInfo(level).tone;
}

/** 화면 안내 줄: "B · ‘정확히 이해하고 성실하게 해냄’ 쪽 말투로 써요 · 예: 정확하게 설명함 · 꼼꼼히 정리함" */
export function guideLine(level: Level | null): string {
  if (!level) return "안 고르면 사실 그대로 써요 · 메모에 없는 높은 평가는 하지 않아요";
  const i = levelInfo(level);
  return `${level} · ‘${i.tone.replace(/\(.*\)$/, "").replace(/ · .*$/, "")}’ 쪽 말투로 써요 · 예: ${i.example}`;
}

/** merge-record 시스템 프롬프트 끝에 붙는 한 줄 (학생 정보 없이 말투만) */
export function levelPrompt(level: Level | null | undefined): string {
  if (!level) return "";
  return `\n성취수준 말투: ${toneLine(level)} · 수준 글자(A~E/상중하)를 쓰지 않는다 · 조각에 없는 성과·수상·결과를 만들지 않는다 · 부정적인 말을 쓰지 않는다`;
}

/** 정한 학생 수 */
export function countLevels(levels: Record<string, Level | null | undefined>, ids: string[]): number {
  return ids.filter((id) => !!levels[id]).length;
}
