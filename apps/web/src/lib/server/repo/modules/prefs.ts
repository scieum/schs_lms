import "server-only";
import type { MenuLayout } from "@/components/shell/nav";
import { check, db, isUuid } from "../supabase";

// 내 정보 · 설정 (Figma N14 · N53): 프로필 사진 + 숨긴 메뉴 + 메뉴 순서.
// 표는 0018_account_prefs.sql(순서 칸은 0027). 적용 전 DB면 읽기는 빈 설정, 저장은 안내 문구로 실패한다.

export interface AccountPrefs { avatar: string | null; hiddenMenus: string[]; menuLayout: MenuLayout | null }
export const EMPTY_PREFS: AccountPrefs = { avatar: null, hiddenMenus: [], menuLayout: null };

export interface PrefsRepo {
  getPrefs(accountId: string): Promise<AccountPrefs>;
  setAvatar(accountId: string, avatar: string | null): Promise<void>;
  setHiddenMenus(accountId: string, hrefs: string[]): Promise<void>;
  setMenuLayout(accountId: string, layout: MenuLayout | null): Promise<void>;
}

const g = globalThis as unknown as { __schsprefs?: Map<string, AccountPrefs> };
const ps = () => (g.__schsprefs ??= new Map());

export const demoPrefs: PrefsRepo = {
  async getPrefs(id) {
    const p = ps().get(id);
    return p ? { ...p, hiddenMenus: [...p.hiddenMenus], menuLayout: p.menuLayout ? structuredClone(p.menuLayout) : null } : { ...EMPTY_PREFS };
  },
  async setAvatar(id, avatar) {
    ps().set(id, { ...(ps().get(id) ?? EMPTY_PREFS), avatar });
  },
  async setHiddenMenus(id, hrefs) {
    ps().set(id, { ...(ps().get(id) ?? EMPTY_PREFS), hiddenMenus: [...hrefs] });
  },
  async setMenuLayout(id, layout) {
    ps().set(id, { ...(ps().get(id) ?? EMPTY_PREFS), menuLayout: layout ? structuredClone(layout) : null });
  },
};

const NEED18 = "설정을 저장하려면 DB 업데이트(0018)가 필요해요. 관리자에게 알려 주세요";
const NEED27 = "메뉴 순서를 저장하려면 DB 업데이트(0027)가 필요해요. 관리자에게 알려 주세요";
const missingTable = (e: { message: string } | null) => !!e && /account_prefs/.test(e.message);
const missingLayout = (e: { message: string } | null) => !!e && /menu_layout/.test(e.message);
type Row = { avatar: string | null; hidden_menus: string[] | null; menu_layout?: MenuLayout | null };

export const supabasePrefs: PrefsRepo = {
  async getPrefs(id) {
    if (!isUuid(id)) return { ...EMPTY_PREFS };
    let res = await db().from("account_prefs").select("avatar, hidden_menus, menu_layout").eq("account_id", id).maybeSingle();
    // 0027 전 DB: 순서 칸 없이 다시 읽는다
    if (missingLayout(res.error)) res = await db().from("account_prefs").select("avatar, hidden_menus").eq("account_id", id).maybeSingle();
    if (missingTable(res.error)) return { ...EMPTY_PREFS };
    const r = check(res) as Row | null;
    return r ? { avatar: r.avatar, hiddenMenus: r.hidden_menus ?? [], menuLayout: Array.isArray(r.menu_layout) ? r.menu_layout : null } : { ...EMPTY_PREFS };
  },
  async setAvatar(id, avatar) {
    const res = await db().from("account_prefs").upsert({ account_id: id, avatar, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
    if (missingTable(res.error)) throw new Error(NEED18);
    check(res);
  },
  async setHiddenMenus(id, hrefs) {
    const res = await db().from("account_prefs").upsert({ account_id: id, hidden_menus: hrefs, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
    if (missingTable(res.error)) throw new Error(NEED18);
    check(res);
  },
  async setMenuLayout(id, layout) {
    const res = await db().from("account_prefs").upsert({ account_id: id, menu_layout: layout, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
    if (missingTable(res.error)) throw new Error(NEED18);
    if (missingLayout(res.error)) throw new Error(NEED27);
    check(res);
  },
};
