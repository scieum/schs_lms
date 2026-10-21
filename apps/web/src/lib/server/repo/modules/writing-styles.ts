import "server-only";
import { emptyStyle, type StyleArea, type WritingStyle } from "@/lib/domain/writing-style";
import { check, db, isUuid } from "../supabase";

// 내 스타일 (Figma N58): 교사 · 영역마다 한 줄. 표 0031_n58_writing_styles.sql. 적용 전 DB면 읽기는 빈 스타일, 저장은 안내 문구로 실패.

export interface WritingStylesRepo {
  getWritingStyle(teacherId: string, area: StyleArea): Promise<WritingStyle>;
  saveWritingStyle(teacherId: string, area: StyleArea, s: { prompt: string; refs: string[] }): Promise<void>;
}

const g = globalThis as unknown as { __schsstyles?: Map<string, WritingStyle> };
const mem = () => (g.__schsstyles ??= new Map());

export const demoWritingStyles: WritingStylesRepo = {
  async getWritingStyle(id, area) { const s = mem().get(`${id}:${area}`); return s ? { ...s, refs: [...s.refs] } : emptyStyle(area); },
  async saveWritingStyle(id, area, s) { mem().set(`${id}:${area}`, { area, prompt: s.prompt, refs: [...s.refs], updatedAt: new Date().toISOString() }); },
};

const NEED31 = "내 스타일을 저장하려면 DB 업데이트(0031)가 필요해요. 관리자에게 알려 주세요";
const missing = (e: { message: string } | null) => !!e && /writing_styles/.test(e.message);

export const supabaseWritingStyles: WritingStylesRepo = {
  async getWritingStyle(id, area) {
    if (!isUuid(id)) return emptyStyle(area);
    const res = await db().from("writing_styles").select("prompt, refs, updated_at").eq("teacher_id", id).eq("area", area).maybeSingle();
    if (missing(res.error)) return emptyStyle(area);
    const r = check(res) as { prompt: string; refs: string[] | null; updated_at: string } | null;
    return r ? { area, prompt: r.prompt ?? "", refs: r.refs ?? [], updatedAt: r.updated_at } : emptyStyle(area);
  },
  async saveWritingStyle(id, area, s) {
    const res = await db().from("writing_styles").upsert({ teacher_id: id, area, prompt: s.prompt, refs: s.refs, updated_at: new Date().toISOString() }, { onConflict: "teacher_id,area" });
    if (missing(res.error)) throw new Error(NEED31);
    check(res);
  },
};
