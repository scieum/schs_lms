import "server-only";
import { check, db, isUuid } from "../supabase";

// 내 정보 · 설정 (Figma N14): 프로필 사진 + 숨긴 메뉴.
// 표는 0018_account_prefs.sql. 적용 전 DB면 읽기는 빈 설정, 저장은 안내 문구로 실패한다.

export interface AccountPrefs { avatar: string | null; hiddenMenus: string[] }
const EMPTY: AccountPrefs = { avatar: null, hiddenMenus: [] };

export interface PrefsRepo {
  getPrefs(accountId: string): Promise<AccountPrefs>;
  setAvatar(accountId: string, avatar: string | null): Promise<void>;
  setHiddenMenus(accountId: string, hrefs: string[]): Promise<void>;
}

const g = globalThis as unknown as { __schsprefs?: Map<string, AccountPrefs> };
const ps = () => (g.__schsprefs ??= new Map());

export const demoPrefs: PrefsRepo = {
  async getPrefs(id) {
    const p = ps().get(id);
    return p ? { ...p, hiddenMenus: [...p.hiddenMenus] } : { ...EMPTY };
  },
  async setAvatar(id, avatar) {
    ps().set(id, { ...(ps().get(id) ?? EMPTY), avatar });
  },
  async setHiddenMenus(id, hrefs) {
    ps().set(id, { ...(ps().get(id) ?? EMPTY), hiddenMenus: [...hrefs] });
  },
};

const NEED18 = "설정을 저장하려면 DB 업데이트(0018)가 필요해요. 관리자에게 알려 주세요";
const missingTable = (e: { message: string } | null) => !!e && /account_prefs/.test(e.message);
type Row = { avatar: string | null; hidden_menus: string[] | null };

export const supabasePrefs: PrefsRepo = {
  async getPrefs(id) {
    if (!isUuid(id)) return { ...EMPTY };
    const res = await db().from("account_prefs").select("avatar, hidden_menus").eq("account_id", id).maybeSingle();
    if (missingTable(res.error)) return { ...EMPTY };
    const r = check(res) as Row | null;
    return r ? { avatar: r.avatar, hiddenMenus: r.hidden_menus ?? [] } : { ...EMPTY };
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
};
