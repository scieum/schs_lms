// 기재요령 인용 모음 검증 (Figma N43): 로컬 PDF 원문과 guide-bank.json 을 대조한다.
// 쓰는 법: node scripts/verify-guide-bank.mjs "<PDF 경로>"   (apps/web 에서)
//   - 각 quote 가 그 pdfPage 글 안에 (공백·줄바꿈 무시하고) 그대로 들어 있는지
//   - "(…)" 는 원문 일부를 줄인 자리: 앞뒤 조각이 순서대로, 200자 안에 이어져야 한다
//   - 원문의 각주 번호(기관명1) 강사명2) 처럼 한글 바로 뒤 "숫자)")는 비교에서 뺀다
//   - 그 쪽 첫 줄(인쇄 쪽 번호)이 page 와 같은지
// 모두 통과하면 guide-bank.json 의 verified { pdfSha256, at, entries } 를 고친다. 실패하면 고치지 않고 1로 끝난다.
// PDF 는 저장소에 넣지 않는다 (저작물 · 용량).

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";

const BANK = fileURLToPath(new URL("../src/lib/domain/guide-bank.json", import.meta.url));
const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error('쓰는 법: node scripts/verify-guide-bank.mjs "<2026 학교생활기록부 기재요령(고).pdf 경로>"');
  process.exit(2);
}

const norm = (s) => s.replace(/\s+/g, "");
const pageNorm = (s) => norm(s.replace(/([가-힣])[1-9]\)/g, "$1"));

/** quote 가 본문에 들어 있나 ("(…)" 줄임 허용) */
export function contains(body, quote) {
  let pos = 0;
  let first = true;
  for (const seg of quote.split("(…)")) {
    const s = norm(seg);
    if (!s) continue;
    const i = body.indexOf(s, pos);
    if (i < 0 || (!first && i - pos > 200)) return false;
    pos = i + s.length;
    first = false;
  }
  return true;
}

const bytes = new Uint8Array(await readFile(pdfPath));
const sha = createHash("sha256").update(bytes).digest("hex");
const pdf = await getDocumentProxy(bytes.slice());
const { text } = await extractText(pdf, { mergePages: false });
const bank = JSON.parse(await readFile(BANK, "utf8"));

const fails = [];
for (const e of bank.entries) {
  const raw = text[e.pdfPage - 1];
  if (raw == null) { fails.push(`${e.id}: PDF ${e.pdfPage}쪽이 없어요`); continue; }
  const printed = raw.trim().split(/\s+/)[0];
  if (printed !== String(e.page)) fails.push(`${e.id}: PDF ${e.pdfPage}쪽의 인쇄 쪽 번호가 ${printed} (bank ${e.page})`);
  if (!contains(pageNorm(raw), e.quote)) fails.push(`${e.id}: ${e.page}쪽에서 원문을 찾지 못했어요 — ${e.quote.slice(0, 40)}…`);
}

if (fails.length) {
  console.error(`실패 ${fails.length}개`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
bank.verified = { pdfSha256: sha, at: new Date().toISOString().slice(0, 10), entries: bank.entries.length };
await writeFile(BANK, JSON.stringify(bank, null, 1) + "\n", "utf8");
console.log(`통과: ${bank.entries.length}개 인용이 PDF(${sha.slice(0, 12)}…) 원문과 같아요`);
