// 나이스 입력 도우미(apps/neis-extension)를 public/neis-helper.zip 으로 묶는다. 시험 폴더(test/)는 뺀다.
// node scripts/pack-neis-extension.mjs   (확장 파일을 고친 뒤 다시 실행해 함께 커밋)
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const src = path.resolve(import.meta.dirname, "../../neis-extension");
const out = path.resolve(import.meta.dirname, "../public/neis-helper.zip");
const zip = new JSZip();
const dir = zip.folder("schs-neis-helper");
for (const name of (await readdir(src, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name).sort()) {
  dir.file(name, await readFile(path.join(src, name)), { date: new Date("2026-01-01T00:00:00Z") });
}
await writeFile(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
const { version } = JSON.parse(await readFile(path.join(src, "manifest.json"), "utf8"));
console.log(`neis-helper.zip v${version} → ${path.relative(process.cwd(), out)}`);
