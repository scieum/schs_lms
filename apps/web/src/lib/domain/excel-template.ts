// 엑셀 양식 (Figma N25): 엑셀을 받는 모든 곳은 이 양식만 읽는다. AI·열 맞추기·붙여넣기 없음.
// 첫 시트 1행 제목이 양식과 똑같을 때만(앞뒤 공백만 무시) 읽고, 아니면 TEMPLATE_ERROR.
// 파일 열기(exceljs)는 lib/server/excel.ts, 여기는 순수 함수만.

export type TemplateKind = "register" | "list" | "teacher";

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
}

export const TEMPLATES: Record<TemplateKind, TemplateSpec> = {
  register: {
    file: "학생등록_양식.xlsx",
    columns: ["학번", "학년", "반", "번호", "이름", "성별", "계열"],
    widths: [64, 44, 40, 44, 64, 44, 48],
    examples: [["20101", "2", "1", "1", "학생A", "여", "1"], ["20102", "2", "1", "2", "학생B", "남", "2"]],
    guide: ["학년 1~3, 반·번호는 숫자만", "학번은 비워도 돼요 (학년·반·번호로 만들어요)", "성별은 남·여, 계열은 비우면 1"],
  },
  list: {
    file: "명단_양식.xlsx",
    columns: ["학번", "학년", "반", "번호", "이름"],
    widths: [64, 44, 40, 44, 64],
    examples: [["20101", "2", "1", "1", "학생A"], ["20102", "2", "1", "2", "학생B"]],
    guide: ["학번 또는 학년·반·번호 중 하나만 있어도 돼요", "이름이 등록된 이름과 다르면 그 줄은 못 찾음으로 나와요"],
  },
  teacher: {
    file: "교사명부_양식.xlsx",
    columns: ["이름", "부서", "담임 학년", "담임 반"],
    widths: [64, 96, 72, 64],
    examples: [["교사A", "교육과정부", "2", "3"], ["교사B", "과학부", "", ""]],
    guide: ["이름은 로그인 ID가 돼요", "담임이 아니면 담임 학년·반을 비워 두세요", "역할은 교과로 만들어요. 담임 반이 있으면 담임도 붙어요"],
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
  const { columns } = TEMPLATES[kind];
  if (!rows.length || !sameHeader(rows[0], columns)) return null;
  const out: { line: number; cells: string[] }[] = [];
  rows.slice(1).forEach((r, i) => {
    const cells = columns.map((_, c) => cell(r[c]));
    if (cells.some(Boolean)) out.push({ line: i + 2, cells });
  });
  return out;
}
