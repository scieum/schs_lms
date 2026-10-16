// 홈 인사말: 시간대마다 여러 문구 중 하나를 골라 보여 준다 (매번 조금씩 달라진다).
// {name} 자리에 "김하연 선생님", "박서준 학생" 같은 호칭이 들어간다.

export type DayPart = "새벽" | "아침" | "점심" | "오후" | "저녁" | "밤";

const LINES: Record<DayPart, string[]> = {
  새벽: ["늦은 시간까지 수고 많아요, {name}", "고요한 새벽이에요, {name}", "아직 깨어 있군요, {name}"],
  아침: ["좋은 아침이에요, {name}", "상쾌한 아침이에요, {name}", "오늘도 힘차게 시작해요, {name}", "안녕하세요, {name}"],
  점심: ["점심은 맛있게 드셨나요, {name}", "잠깐 숨 돌릴 시간이에요, {name}", "안녕하세요, {name}"],
  오후: ["나른한 오후예요, {name}", "오후도 힘내요, {name}", "조금만 더 힘내요, {name}", "안녕하세요, {name}"],
  저녁: ["오늘 하루도 고생 많았어요, {name}", "편안한 저녁이에요, {name}", "저녁 맛있게 드세요, {name}"],
  밤: ["오늘도 수고했어요, {name}", "하루 마무리 잘 하세요, {name}", "푹 쉬는 밤 되세요, {name}"],
};

/** 한국 시간 기준 시간대 */
export function dayPart(hour: number): DayPart {
  if (hour < 5) return "새벽";
  if (hour < 11) return "아침";
  if (hour < 14) return "점심";
  if (hour < 18) return "오후";
  if (hour < 22) return "저녁";
  return "밤";
}

export function koreaHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hourCycle: "h23" }).format(now));
}

/** 시간대 문구 중 하나를 고른다. random 은 테스트에서 고정할 수 있게 받는다 */
export function greeting(name: string, now = new Date(), random = Math.random): string {
  const lines = LINES[dayPart(koreaHour(now))];
  return lines[Math.floor(random() * lines.length)].replace("{name}", name);
}
