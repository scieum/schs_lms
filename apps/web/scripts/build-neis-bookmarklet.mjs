// 나이스 입력 북마클릿을 만든다: fill.js · cpr-fill.js · panel.js + bookmarklet/launcher.js 를 이어 javascript: 주소 하나로.
// npm run pack:neis → src/lib/neis-bookmarklet.ts (크롬 확장은 2026-10-19 없앴다. 이 버튼 하나만 쓴다)
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const src = path.resolve(import.meta.dirname, "../../neis-bookmarklet");
const out = path.resolve(import.meta.dirname, "../src/lib/neis-bookmarklet.ts");
// 줄 전체가 주석인 줄만 빼고 들여쓰기를 지운다 (글자 안의 내용은 그대로)
const slim = (code) => code.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("//")).join("\n");
const parts = await Promise.all(["fill.js", "cpr-fill.js", "panel.js", "bookmarklet/launcher.js"].map((f) => readFile(path.join(src, f), "utf8")));
const code = `(()=>{${parts.map(slim).join("\n;\n")}\n})()`;
const href = `javascript:${encodeURIComponent(code)}`;
const version = parts[3].match(/const VERSION = "([^"]+)"/)[1]; // 버전은 launcher.js 의 VERSION
await writeFile(out, [
  "// 자동 생성 파일 — 고치지 말고 apps/neis-bookmarklet 을 고친 뒤 npm run pack:neis",
  `export const NEIS_BOOKMARKLET_VERSION = ${JSON.stringify(version)};`,
  `export const NEIS_BOOKMARKLET = ${JSON.stringify(href)};`,
  "",
].join("\n"));
console.log(`neis-bookmarklet v${version} · ${href.length.toLocaleString()}자 → ${path.relative(process.cwd(), out)}`);
