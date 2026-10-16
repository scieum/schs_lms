// 첫 관리자 계정 만들기 (Supabase 연결 후 한 번만)
// 사용: npm run seed:admin -- <이름> [부서]
// 첫 비밀번호는 INITIAL_AUTH_CODE 이고, 첫 로그인 때 바꾸게 된다 (C9).
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const [name, dept = "교육과정부"] = process.argv.slice(2);
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, INITIAL_AUTH_CODE: code } = process.env;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
if (!name) fail("이름을 넣어 주세요: npm run seed:admin -- 홍길동");
if (!url || !key) fail(".env.local 에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 를 넣어 주세요");
// 코드 저장소에 적힌 기본값은 누구나 알 수 있어서 실제 DB에는 쓰지 않는다
if (!code || code === "schs-2026" || code.length < 8) fail("INITIAL_AUTH_CODE 를 8자 이상, 기본값과 다르게 정해 주세요");

const db = createClient(url, key, { auth: { persistSession: false } });

const { data: exists, error: e1 } = await db.from("accounts").select("id").eq("kind", "teacher").eq("login_id", name).maybeSingle();
if (e1) fail(e1.message);
if (exists) fail(`이미 있는 교사 이름이에요: ${name}`);

const { data: account, error: e2 } = await db
  .from("accounts")
  .insert({ kind: "teacher", login_id: name, password_hash: await bcrypt.hash(code, 10), must_change_password: true })
  .select("id")
  .single();
if (e2) fail(e2.message);

const { error: e3 } = await db.from("teachers").insert({ id: account.id, name, roles: ["admin", "subject"], dept });
if (e3) fail(e3.message);

await db.from("audit_logs").insert({ actor_id: account.id, action: "admin.seed", target: null });
console.log(`관리자 계정을 만들었어요: ${name} (첫 비밀번호 = INITIAL_AUTH_CODE)`);
