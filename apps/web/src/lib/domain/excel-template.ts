// 엑셀 양식 (Figma N25): 엑셀을 받는 모든 곳은 이 양식만 읽는다. AI·열 맞추기·붙여넣기 없음.
// 첫 시트 1행 제목이 양식과 똑같을 때만(앞뒤 공백만 무시) 읽고, 아니면 TEMPLATE_ERROR.
// 파일 열기(exceljs)는 lib/server/excel.ts, 여기는 순수 함수만.

export type TemplateKind = "register" | "list" | "teacher" | "lesson" | "external" | "records";

export interface TemplateSpec {
  /** 내려받는 파일 이름 */
  file: string;
  /** 1행 제목 (이 순서 그대로) */
  columns: readonly string[];
  /** 화면 그림의 열 폭(px) */
  widths: readonly number[];
  /** 화면 그림·작성 방법 시트의 예시 줄 */
  examples: readonly (readonly string[])[];
  /** 작성 방법 시트 */
  guide: readonly string[];
  /**
   * 예전 양식 1행 (2026-10-22 학번 하나로 합치기 전: 학번 · 학년 · 반 · 번호 …). 이미 받아 둔 예전 양식도 그대로 읽는다.
   * 새 양식으로 읽은 줄은 이 열 순서로 펼쳐서 돌려준다 (학년 · 반 · 번호 = 학번에서) — 읽는 쪽은 예전 칸 순서를 그대로 쓴다.
   */
  legacy?: readonly string[];
}

export const TEMPLATES: Record<TemplateKind, TemplateSpec> = {
  register: {
    file: "학생등록_양식.xlsx",
    columns: ["학번", "이름", "성별", "계열"],
    widths: [64, 72, 44, 48],
    examples: [["20101", "학생A", "여", "1"], ["20102", "학생B", "남", "2"]],
    guide: ["학번은 5자리 (학년 1 + 반 2 + 번호 2, 예: 2학년 1반 1번 → 20101)", "성별은 남·여, 계열은 비우면 1"],
    legacy: ["학번", "학년", "반", "번호", "이름", "성별", "계열"],
  },
  list: {
    file: "명단_양식.xlsx",
    columns: ["학번", "이름"],
    widths: [64, 72],
    examples: [["20101", "학생A"], ["20102", "학생B"]],
    guide: ["학번은 5자리 (예: 2학년 1반 1번 → 20101)", "이름이 등록된 이름과 다르면 그 줄은 못 찾음으로 나와요"],
    legacy: ["학번", "학년", "반", "번호", "이름"],
  },
  teacher: {
    file: "교사명부_양식.xlsx",
    columns: ["이름", "부서", "담임 학년", "담임 반"],
    widths: [64, 96, 72, 64],
    examples: [["교사A", "교육과정부", "2", "3"], ["교사B", "과학부", "", ""]],
    guide: ["이름은 로그인 ID가 돼요", "담임이 아니면 담임 학년·반을 비워 두세요", "역할은 교과로 만들어요. 담임 반이 있으면 담임도 붙어요"],
  },
  // 차시별 활동 (Figma N43 ②): 수업 계획 — 학생 정보 없음
  lesson: {
    file: "수업계획_양식.xlsx",
    columns: ["차시", "날짜", "활동명", "활동 내용"],
    widths: [44, 72, 120, 220],
    examples: [["1", "2026-03-04", "운동 법칙 탐구", "뉴턴 운동 법칙을 일상 사례로 설명하기"], ["5", "10.14", "빗면 실험", "경사각을 바꾸며 가속도를 재고 그래프로 정리"]],
    guide: ["차시는 숫자, 날짜는 2026-03-04 또는 10.14처럼 적어요", "날짜를 모르면 비워 두세요 (올린 뒤 확인 화면에서 채워요)", "활동명은 40자까지 · 활동 내용은 짧게 (메모 칸에는 활동명만 들어가요)"],
  },
  // 외부 생기부 글 (Figma N46): 프로그램 대상 학생이 채워진 양식에 기관이 보낸 글을 붙여 넣는다. AI 없음
  external: {
    file: "외부글_양식.xlsx",
    columns: ["학번", "이름", "생기부 글"],
    widths: [64, 72, 300],
    examples: [["20301", "학생A", "지역 대학 연계 '해양 생태 탐구 캠프'(3일)에 참여하여 …"], ["20302", "학생B", ""]],
    legacy: ["학번", "학년", "반", "번호", "이름", "생기부 글"],
    guide: ["학번·이름은 대상 학생으로 채워져 있어요 · 바꾸지 마세요", "'생기부 글' 칸에 받은 글을 그대로 붙여 넣어요 · 한 칸에 한 학생", "글이 빈 줄은 건너뛰어요 · 대학명 같은 금칙어는 올린 뒤 검사에서 알려 줘요"],
  },
  // 갖고 있던 생기부 글 올리기 (N66, 글 모아 보기): 그 반 학생이 채워진 양식에 선생님이 써 둔 글을 붙여 넣는다. AI 없음
  records: {
    file: "생기부글_양식.xlsx",
    columns: ["학번", "이름", "생기부 글"],
    widths: [64, 64, 300],
    examples: [["20301", "학생A", "운동 법칙 단원에서 빗면 실험을 설계하여 …"], ["20302", "학생B", ""]],
    guide: ["학번·이름은 그 반 학생으로 채워져 있어요 · 바꾸지 마세요", "'생기부 글' 칸에 갖고 있던 글을 붙여 넣어요 · 한 칸에 한 학생 · 줄바꿈은 한 문단으로 합쳐요", "글이 빈 줄은 건너뛰어요 · 올리면 임시 저장(새 버전)으로 들어가고 확정은 글 짓기에서 해요"],
  },
};

export const TEMPLATE_ERROR = "양식이 아니에요 · 1행 제목을 바꾸지 말고 양식에 옮겨 주세요";
export const TEMPLATE_HINT = "양식에 맞춘 엑셀만 읽어요";
/** 한 파일에서 읽는 최대 줄 수 */
export const TEMPLATE_MAX_ROWS = 600;

const cell = (v: unknown) => String(v ?? "").trim();

/** 1행 제목이 양식과 같은가 (앞뒤 공백만 무시, 오른쪽 빈 칸은 괜찮음) */
export function sameHeader(row: readonly unknown[], columns: readonly string[]): boolean {
  const head = row.map(cell);
  while (head.length && !head[head.length - 1]) head.pop();
  return head.length === columns.length && columns.every((c, i) => head[i] === c);
}

/**
 * 표(행×칸, 1행 = 제목) → 양식 열만 자른 본문 줄. 빈 줄은 건너뛴다.
 * 제목이 양식과 다르면 null (부르는 쪽이 TEMPLATE_ERROR 를 보여 준다).
 */
export function readTemplate(rows: readonly (readonly unknown[])[], kind: TemplateKind): { line: number; cells: string[] }[] | null {
  const { columns, legacy } = TEMPLATES[kind];
  if (!rows.length) return null;
  const isNew = sameHeader(rows[0], columns);
  const isOld = !isNew && !!legacy && sameHeader(rows[0], legacy);
  if (!isNew && !isOld) return null;
  const head = isOld ? legacy! : columns;
  const out: { line: number; cells: string[] }[] = [];
  rows.slice(1).forEach((r, i) => {
    const cells = head.map((_, c) => cell(r[c]));
    if (!cells.some(Boolean)) return;
    out.push({ line: i + 2, cells: isNew && legacy ? expandLegacy(cells, columns, legacy) : cells });
  });
  return out;
}

/** 학번 5자리 → 학년 · 반 · 번호 (모양이 아니면 빈칸 — 검사에서 걸린다) */
export function splitStudentNo(no: string): { grade: string; classNo: string; number: string } {
  const m = no.replace(/\s/g, "").match(/^([1-3])(\d{2})(\d{2})$/);
  return m ? { grade: m[1], classNo: String(Number(m[2])), number: String(Number(m[3])) } : { grade: "", classNo: "", number: "" };
}

/** 새 양식 줄 → 예전 열 순서 (학년 · 반 · 번호는 학번에서) */
function expandLegacy(cells: string[], columns: readonly string[], legacy: readonly string[]): string[] {
  const by = new Map(columns.map((c, i) => [c, cells[i]]));
  const parts = splitStudentNo(by.get("학번") ?? "");
  const derived: Record<string, string> = { 학년: parts.grade, 반: parts.classNo, 번호: parts.number };
  return legacy.map((c) => by.get(c) ?? derived[c] ?? "");
}
