// 노션 "2026 속초고 온라인 교무실" 학사일정 DB(TASKS) 한 줄 → 앱 학사일정.
// 속성: 내용(제목) · 날짜(시작~끝) · 상태(시작 전/진행 중/휴일/완료) · 태그(담당 부서) · 비고
// 가져오기·저장은 lib/server/notion-sync.ts, 여기는 변환 규칙만 (순수 함수).

export interface NotionEvent {
  notionId: string;
  title: string;
  startDate: string;
  endDate: string;
  holiday: boolean;
  dept: string | null;
  memo: string | null;
  grades: number[];
}

/** 일정 이름에서 대상 학년 읽기: "2학년 테마학습여행" → [2], "2학기 2회고사(1,2학년)" → [1,2], 전학년·셋 다면 [] (= 전체) */
export function inferGrades(title: string): number[] {
  if (/전\s?학년/.test(title)) return [];
  const found = new Set<number>();
  for (const m of title.matchAll(/(\d)\s*~\s*(\d)\s*학년/g)) for (let g = +m[1]; g <= +m[2]; g++) found.add(g);
  for (const m of title.matchAll(/((?:\d\s*[,·]\s*)*\d)\s*학년/g)) for (const d of m[1].match(/\d/g) ?? []) found.add(+d);
  const grades = [...found].filter((g) => g >= 1 && g <= 3).sort();
  // "[창체/금] 진로: 1학년 … / 2학년 …" 처럼 학년별 내용을 한 줄에 나눠 쓴 일정은 전체로
  if (/^\[창체/.test(title) && title.includes("/") && grades.length >= 2) return [];
  return grades.length === 3 ? [] : grades;
}

/** 비고에 계정·비밀번호 같은 내용이 있으면 옮기지 않는다 */
export function safeMemo(memo: string | null | undefined): string | null {
  const m = (memo ?? "").trim();
  if (!m || /비밀번호|password|아이디|pw\s*:/i.test(m)) return null;
  return m.slice(0, 200);
}

type RichText = { plain_text?: string }[];
type Prop =
  | { type: "title"; title: RichText }
  | { type: "rich_text"; rich_text: RichText }
  | { type: "date"; date: { start: string; end: string | null } | null }
  | { type: "status"; status: { name: string } | null }
  | { type: "select"; select: { name: string } | null }
  | { type: string; [k: string]: unknown };
export interface NotionPage { id: string; archived?: boolean; in_trash?: boolean; properties: Record<string, Prop> }

const text = (p?: Prop) => (p && (p.type === "title" || p.type === "rich_text") ? ((p as { title?: RichText; rich_text?: RichText }).title ?? (p as { rich_text?: RichText }).rich_text ?? []).map((t) => t.plain_text ?? "").join("").trim() : "");
const day = (s: string) => s.slice(0, 10);

/** 노션 페이지 → 앱 일정. 날짜나 제목이 없으면 null (가져오지 않음) */
export function fromNotionPage(page: NotionPage): NotionEvent | null {
  if (page.archived || page.in_trash) return null;
  const p = page.properties;
  const title = text(p["내용"]);
  const date = p["날짜"]?.type === "date" ? (p["날짜"] as { date: { start: string; end: string | null } | null }).date : null;
  if (!title || !date?.start) return null;
  const start = day(date.start);
  const end = date.end ? day(date.end) : start;
  const status = p["상태"]?.type === "status" ? (p["상태"] as { status: { name: string } | null }).status?.name : null;
  const tag = p["태그"]?.type === "select" ? (p["태그"] as { select: { name: string } | null }).select?.name ?? null : null;
  return {
    notionId: page.id, title: title.slice(0, 60), startDate: start, endDate: end < start ? start : end,
    holiday: status === "휴일", dept: tag, memo: safeMemo(text(p["비고"])), grades: inferGrades(title),
  };
}
