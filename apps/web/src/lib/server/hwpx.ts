import "server-only";
import JSZip from "jszip";
import { HWP_GUIDE, HWPX_MIME, hwpxSectionText, isHwp, isHwpx, sortSections } from "@/lib/domain/hwpx";

/** HWPX(ZIP) → 본문 글. 열 수 없으면 null */
export async function hwpxText(bytes: Uint8Array): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const sections = sortSections(Object.keys(zip.files));
    if (!sections.length) return null;
    const parts = await Promise.all(sections.map(async (n) => hwpxSectionText(await zip.file(n)!.async("string"))));
    const text = parts.filter(Boolean).join("\n\n").trim();
    return text || null;
  } catch {
    return null;
  }
}

export type ReadUpload = { bytes: Uint8Array; name: string; mime: string; text: string | null };

/**
 * 올린 파일을 앱이 다루는 모양으로: HWPX 는 글을 뽑아 둔다(mime = application/hwp+zip), TXT 는 글 그대로.
 * HWP(바이너리)는 읽지 못해 안내 문구를 돌려준다. 다른 종류는 그대로 (검사는 부르는 쪽에서)
 */
export async function readUpload(f: File): Promise<ReadUpload | string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (isHwp(f.name)) return `${f.name}: ${HWP_GUIDE}`;
  if (isHwpx(f.name)) {
    const text = await hwpxText(bytes);
    if (!text) return `${f.name}: HWPX 파일을 열지 못했어요. 한글에서 다시 저장하거나 PDF로 올려 주세요`;
    return { bytes, name: f.name, mime: HWPX_MIME, text };
  }
  const text = f.type === "text/plain" ? new TextDecoder().decode(bytes) : null;
  return { bytes, name: f.name, mime: f.type, text };
}
