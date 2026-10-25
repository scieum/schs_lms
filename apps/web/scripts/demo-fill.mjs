// 화면 점검용 예시 기록 채우기: DEMO_FILL=1 로 켠 데모 서버에 한 번 부른다 (src/app/api/dev-fill).
// node scripts/demo-fill.mjs [포트=3200]
import { SignJWT } from "jose";

const base = `http://localhost:${process.argv[2] ?? 3200}`;
const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("t-admin").setIssuedAt().setExpirationTime("1h")
  .sign(new TextEncoder().encode(process.env.SHOT_SECRET || "demo-only-session-secret-change-me-please"));
const r = await fetch(`${base}/api/dev-fill`, { method: "POST", headers: { cookie: `schs_session=${token}` } });
console.log(r.status, await r.text());
