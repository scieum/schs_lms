// 파워포인트 PPTX(ZIP 안의 XML) 글 뽑기 (2026-10-22 "자료 올릴 pptx도 지원"). ZIP 풀기는 서버(lib/server/hwpx.ts readUpload),
// 여기는 슬라이드 XML → 글만 다룬다 (순수 함수). ppt/slides/slideN.xml 의 <a:t> 를 문단(<a:p>)마다 한 줄로, 슬라이드는 번호 순.
// 발표자 메모(notesSlides)는 넣지 않는다. 옛 .ppt(바이너리)는 읽지 못해 PPTX · PDF로 저장해 올리게 안내한다.

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const isPptx = (name: string) => /\.pptx$/i.test(name);
export const isPpt = (name: string) => /\.ppt$/i.test(name);

export const PPT_GUIDE = "PPT 파일은 바로 읽지 못해요. 파워포인트에서 PPTX나 PDF로 저장해 올려 주세요";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") {
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  }
  return ENTITIES[e.toLowerCase()] ?? m;
});

/** ZIP 안 이름 → 슬라이드만 번호 순 */
export function sortSlides(names: string[]): string[] {
  const num = (n: string) => Number(n.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
  return names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
}

/** 슬라이드 XML 하나 → 글 (문단마다 줄바꿈, 빈 줄 없음) */
export function slideText(xml: string): string {
  const lines: string[] = [];
  for (const p of xml.split(/<\/a:p>/)) {
    const runs = [...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => decode(m[1]));
    const line = runs.join("").replace(/[ \t]+/g, " ").trim();
    if (line) lines.push(line);
  }
  return lines.join("\n");
}

/** 슬라이드 글들 → 한 자료 글 ("[슬라이드 n]" 머리) */
export const slidesText = (texts: string[]) => texts.map((t, i) => (t ? `[슬라이드 ${i + 1}]\n${t}` : "")).filter(Boolean).join("\n\n").trim();
