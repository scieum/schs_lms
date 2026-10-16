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

/** PDF 문서 정보(제목·주제·키워드). 한글에서 PDF 로 저장하면 제목이 들어 있는 경우가 많다 (AI 없는 자동 채우기용) */
export async function pdfInfo(bytes: Uint8Array): Promise<string | null> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const parts = [doc.getTitle(), doc.getSubject(), doc.getKeywords()].map((x) => (x ?? "").trim()).filter(Boolean);
    return parts.length ? parts.join("\n") : null;
  } catch {
    return null;
  }
}
