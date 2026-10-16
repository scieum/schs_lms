// 관리자 계정을 처음 상태로 되돌리기 (없으면 만든다)
// 사용: npm run reset:admin -- <이름> [부서]
// - 비밀번호를 INITIAL_AUTH_CODE 로 되돌리고, 잠금을 풀고, 관리자 역할을 확인한다
// - 첫 로그인 때 비밀번호를 바꾸게 된다 (C9)
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const [name, dept = "교육과정부"] = process.argv.slice(2);
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, INITIAL_AUTH_CODE: code } = process.env;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
if (!name) fail("이름을 넣어 주세요: npm run reset:admin -- 홍길동");
if (!url || !key) fail(".env.local 에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 를 넣어 주세요");
if (!code || code === "schs-2026" || code.length < 8) fail("INITIAL_AUTH_CODE 를 8자 이상, 기본값과 다르게 정해 주세요");

const db = createClient(url, key, { auth: { persistSession: false } });
const hash = await bcrypt.hash(code, 10);

const { data: acc, error: e1 } = await db.from("accounts").select("id").eq("kind", "teacher").eq("login_id", name).maybeSingle();
if (e1) fail(e1.message);

let id = acc?.id;
if (id) {
  const { error } = await db.from("accounts").update({ password_hash: hash, must_change_password: true, failed_count: 0, locked_until: null }).eq("id", id);
  if (error) fail(error.message);
} else {
  const { data, error } = await db.from("accounts").insert({ kind: "teacher", login_id: name, password_hash: hash, must_change_password: true }).select("id").single();
  if (error) fail(error.message);
  id = data.id;
}

const { data: t, error: e2 } = await db.from("teachers").select("roles").eq("id", id).maybeSingle();
if (e2) fail(e2.message);
if (!t) {
  const { error } = await db.from("teachers").insert({ id, name, roles: ["admin", "subject"], dept });
  if (error) fail(error.message);
} else if (!t.roles.includes("admin")) {
  const { error } = await db.from("teachers").update({ roles: [...new Set(["admin", ...t.roles])] }).eq("id", id);
  if (error) fail(error.message);
}

await db.from("audit_logs").insert({ actor_id: id, action: acc ? "admin.reset" : "admin.seed", target: null });
console.log(`${acc ? "되돌렸어요" : "만들었어요"}: ${name} · 관리자 · 비밀번호 = INITIAL_AUTH_CODE (첫 로그인 때 변경)`);
