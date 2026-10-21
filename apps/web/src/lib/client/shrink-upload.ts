"use client";
import { PDFDocument } from "pdf-lib";

// 웹(Vercel)은 서버로 보내는 요청이 4.5MB를 넘으면 받지 못한다.
// 큰 PDF는 쪽 단위로 나눠 여러 번 보내고, 큰 사진은 줄여서 보낸다. 각 조각은 LIMIT 아래로.
export const UPLOAD_LIMIT = 3.5 * 1024 * 1024;

/** PDF → LIMIT 아래 조각들 (쪽 순서 유지). 한 쪽이 LIMIT 를 넘으면 그 쪽만 따로 */
export async function splitPdf(file: File, limit = UPLOAD_LIMIT): Promise<File[]> {
  if (file.size <= limit) return [file];
  const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const total = src.getPageCount();
  const parts: File[] = [];
  let start = 0;
  while (start < total) {
    let end = start + 1;
    let best: Uint8Array | null = null;
    // 한 쪽씩 늘려 보며 LIMIT 안에 들어가는 만큼 묶는다
    while (end <= total) {
      const doc = await PDFDocument.create();
      const pages = await doc.copyPages(src, Array.from({ length: end - start }, (_, i) => start + i));
      pages.forEach((p) => doc.addPage(p));
      const bytes = await doc.save();
      if (bytes.length > limit && best) break;
      best = bytes;
      if (bytes.length > limit) { end++; break; }
      end++;
    }
    const last = end - 1;
    parts.push(new File([best as BlobPart], `${file.name.replace(/\.pdf$/i, "")}_${start + 1}-${last}.pdf`, { type: "application/pdf" }));
    start = last;
  }
  return parts;
}

/** 큰 사진 → 긴 변 2400px JPEG 로 줄이기 */
export async function shrinkImage(file: File, limit = UPLOAD_LIMIT): Promise<File> {
  if (file.size <= limit) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
}

/** 올릴 파일 → 보낼 조각들 */
export async function prepareUpload(file: File): Promise<File[]> {
  if (file.type === "application/pdf") return splitPdf(file);
  if (file.type.startsWith("image/")) return [await shrinkImage(file)];
  return [file];
}

/** 파일들을 한 번에 보낼 묶음으로 (묶음마다 합계가 limit 아래). 큰 파일 하나는 혼자 한 묶음 */
export function batchBySize(files: File[], limit = UPLOAD_LIMIT): File[][] {
  const out: File[][] = [];
  let cur: File[] = [];
  let size = 0;
  for (const f of files) {
    if (cur.length && size + f.size > limit) { out.push(cur); cur = []; size = 0; }
    cur.push(f);
    size += f.size;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** 여러 파일을 보낼 조각으로 (PDF 나누기 · 사진 줄이기) */
export async function prepareUploads(files: File[]): Promise<File[]> {
  return (await Promise.all(files.map(prepareUpload))).flat();
}

/** PDF 쪽 수 (못 읽으면 null) */
export async function pdfPageCount(file: File): Promise<number | null> {
  try { return (await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })).getPageCount(); } catch { return null; }
}

/** 합본 PDF → 구간마다 한 파일 (수행평가 N59 · 쪽 번호는 1부터, 끝 포함). 브라우저에서 나눠 큰 합본도 서버 한도에 안 걸린다 */
export async function splitPdfRanges(file: File, ranges: { from: number; to: number }[]): Promise<File[]> {
  const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const base = file.name.replace(/\.pdf$/i, "");
  const out: File[] = [];
  for (const r of ranges) {
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from - 1 + i));
    pages.forEach((p) => doc.addPage(p));
    out.push(new File([(await doc.save()) as BlobPart], `${base}_${r.from}-${r.to}.pdf`, { type: "application/pdf" }));
  }
  return out;
}
