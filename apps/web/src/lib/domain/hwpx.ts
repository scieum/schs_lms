// 한글 HWPX(OWPML, ZIP 안의 XML) 글 뽑기 — hwpx 스킬의 text_extract.py 방식을 옮긴 것.
// Contents/section*.xml 의 <hp:t> 글을 문단(<hp:p>) 단위로 모으고, 표 칸(<hp:tc>)은 " | " 로 잇는다.
// ZIP 풀기는 서버(lib/server/hwpx.ts)에서 하고, 여기는 XML → 글만 다룬다 (순수 함수).
// .hwp(바이너리)는 읽지 못한다 — 한글에서 HWPX로 저장해 올리게 안내한다.

export const HWPX_MIME = "application/hwp+zip";

export const isHwpx = (name: string) => /\.hwpx$/i.test(name);
export const isHwp = (name: string) => /\.hwp$/i.test(name);

export const HWP_GUIDE = "HWP 파일은 바로 읽지 못해요. 한글에서 '다른 이름으로 저장 → HWPX'로 저장하거나 PDF로 올려 주세요";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** section XML 하나 → 글. 문단마다 줄바꿈, 표 칸 사이는 " | " */
export function hwpxSectionText(xml: string): string {
  const out: string[] = [];
  let line = "";
  const flush = () => {
    const t = line.replace(/[ \t]+/g, " ").replace(/( \| )+$/, "").trim();
    if (t) out.push(t);
    line = "";
  };
  const re = /<hp:t\b[^>]*>([\s\S]*?)<\/hp:t>|<hp:t\b[^>]*\/>|<\/hp:p>|<\/hp:tc>|<\/hp:tr>|<hp:lineBreak\s*\/>|<hp:tab\b[^>]*\/>/g;
  for (const m of xml.matchAll(re)) {
    const tag = m[0];
    if (m[1] !== undefined) {
      // <hp:t> 안의 <hp:tab/> 같은 자식은 공백으로
      line += decode(m[1].replace(/<hp:tab\b[^>]*\/>/g, " ").replace(/<[^>]+>/g, ""));
    } else if (tag.startsWith("<hp:t")) {
      continue;
    } else if (tag === "</hp:tc>") {
      line += " | ";
    } else if (tag === "</hp:tr>" ) {
      flush();
    } else if (tag.startsWith("<hp:lineBreak") || tag.startsWith("<hp:tab")) {
      line += tag.startsWith("<hp:tab") ? " " : "\n";
    } else if (tag === "</hp:p>") {
      // 표 칸 안의 문단은 칸이 끝날 때까지 한 줄로 잇는다
      if (!line.endsWith(" | ")) line += " ";
      const insideCell = lastOpen(xml, m.index ?? 0);
      if (!insideCell) flush();
    }
  }
  flush();
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** 이 위치가 표 칸(<hp:tc>) 안인가: 앞쪽에서 마지막으로 열린 tc 가 닫히지 않았으면 안 */
function lastOpen(xml: string, at: number): boolean {
  const before = xml.lastIndexOf("<hp:tc", at);
  if (before === -1) return false;
  const closed = xml.lastIndexOf("</hp:tc>", at);
  return closed < before;
}

/** section 파일 이름을 번호 순서로 (section0, section1, …, section10) */
export function sortSections(names: string[]): string[] {
  const num = (n: string) => Number(n.match(/section(\d+)\.xml$/)?.[1] ?? 0);
  return names.filter((n) => /^Contents\/section\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
}
