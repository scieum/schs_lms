import "server-only";
import { PDFDocument } from "pdf-lib";

/** PDF 쪽수. 읽지 못하면 null */
export async function pdfPages(bytes: Uint8Array): Promise<number | null> {
  try {
    return (await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
  } catch {
    return null;
  }
}

/** 쪽 구간마다 새 PDF 로 나눈다 (1부터 셈) */
export async function splitPdf(bytes: Uint8Array, ranges: { from: number; to: number }[]): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out: Uint8Array[] = [];
  for (const r of ranges) {
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from - 1 + i));
    pages.forEach((p) => doc.addPage(p));
    out.push(await doc.save());
  }
  return out;
}
