// 시트용 복사 (Figma N42 ③): 탭으로 나눈 글(TSV) — 구글 시트 · 엑셀 첫 칸에 붙이면 칸이 채워진다.
// 규칙(엑셀 · 구글 시트 붙여넣기와 같음): 칸 구분 \t · 줄 구분 \r\n. 칸 안 탭은 공백 하나로, 줄바꿈은 \n 으로 통일.
// 칸 값에 \n · " · \t 가 있으면 값 전체를 "로 감싸고 안의 "는 ""로. 테스트: tsv.test.ts

export function tsvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v).replace(/\r\n|\r/g, "\n").replace(/\t/g, " ");
  const quote = /[\n"]/.test(s) || /\t/.test(String(v));
  if (quote) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toTsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows].map((r) => r.map(tsvCell).join("\t")).join("\r\n");
}
