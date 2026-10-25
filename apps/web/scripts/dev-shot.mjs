// 개발용: 데모 서버 화면을 역할별로 로그인한 채 캡처한다 (시안 비교용).
// 사용: node scripts/dev-shot.mjs <경로> <계정id|none> <폭 1440|412> <저장할 png> [포트=3200]
//   계정 id: t-admin(정다은·관리자) t-subject(이서연·교과) t-homeroom(박지훈·담임) s-3(박서준·학생)
// 파일 올리기 시험: SHOT_FILE="<선택자>|<경로>" (아래 참고)
// 데모 서버는 SESSION_SECRET 없이 켜야 데모용 서명 키를 쓴다:
//   SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= SESSION_SECRET= ANTHROPIC_API_KEY= npx next start -p 3200
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignJWT } from "jose";

const [rawPath, account, widthArg, out, portArg] = process.argv.slice(2);
// Git Bash 는 "/homeroom" 을 "C:/Program Files/Git/homeroom" 으로 바꿔 넘긴다 → 되돌린다. "homeroom" 처럼 앞 / 없이 써도 된다
const path = "/" + (rawPath ?? "").replace(/^[A-Za-z]:[\/].*?Git[\/]/, "").replace(/^\/+/, "");
if (!rawPath || !account || !widthArg || !out) {
  console.error("사용: node scripts/dev-shot.mjs <경로> <계정id|none> <폭> <out.png> [포트]");
  process.exit(1);
}
const width = Number(widthArg);
const base = `http://localhost:${portArg ?? 3200}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdpPort = 9400 + Math.floor(Math.random() * 500);
// SHOT_FAKE_MIC=<wav 경로>: 그 파일을 마이크 소리로 (발표 녹음 N73 시험)
const mic = process.env.SHOT_FAKE_MIC ? ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${process.env.SHOT_FAKE_MIC}`] : [];
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", `--remote-debugging-port=${cdpPort}`, "--disable-gpu", `--user-data-dir=${mkdtempSync(join(tmpdir(), "shot-"))}`, ...mic, "about:blank",
], { stdio: "ignore" });

try {
  let list;
  for (let i = 0; i < 60 && !list; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json(); } catch { await sleep(250); }
  }
  const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const waiting = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result ?? { error: m.error }); waiting.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

  const mobile = width < 768;
  await send("Emulation.setDeviceMetricsOverride", { width, height: mobile ? 900 : 1000, deviceScaleFactor: 1, mobile });
  await send("Network.enable");
  // SHOT_CPU=4: CPU 를 4배 느리게 (느린 학교 PC · 휴대폰 받아쓰기 시간 재기)
  if (process.env.SHOT_CPU) await send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.SHOT_CPU) });
  // SHOT_MEDIA=print: 인쇄 화면으로 찍기 (A4 인쇄 확인)
  if (process.env.SHOT_MEDIA) await send("Emulation.setEmulatedMedia", { media: process.env.SHOT_MEDIA });
  if (account !== "none") {
    const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(account).setIssuedAt().setExpirationTime("2h")
      .sign(new TextEncoder().encode(process.env.SHOT_SECRET || "demo-only-session-secret-change-me-please"));
    await send("Network.setCookie", { name: "schs_session", value: token, url: base, path: "/" });
  }
  await send("Page.enable");
  const nav = await send("Page.navigate", { url: base + path });
  if (process.env.SHOT_DEBUG) console.log("navigate:", JSON.stringify(nav));
  await sleep(5000);
  // SHOT_PRE: 찍기 전에 실행할 스크립트 (버튼 누르기 등). 화면이 바뀔 시간을 준다
  if (process.env.SHOT_PRE) { await send("Runtime.evaluate", { expression: process.env.SHOT_PRE }); await sleep(Number(process.env.SHOT_WAIT) || 800); }
  // SHOT_FILE="<css 선택자>|<파일 경로>": 그 파일 칸에 파일을 넣고 SHOT_FILE_WAIT(기본 20초) 기다린다 (업로드 · AI 읽기 시험)
  if (process.env.SHOT_FILE) {
    const [sel, file] = process.env.SHOT_FILE.split("|");
    const { root } = await send("DOM.getDocument", { depth: -1 });
    const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
    await send("DOM.setFileInputFiles", { nodeId, files: [file] });
    await sleep(Number(process.env.SHOT_FILE_WAIT) || 20000);
  }
  const h = (await send("Runtime.evaluate", { expression: "document.documentElement.scrollHeight", returnByValue: true })).result.value;
  await send("Emulation.setDeviceMetricsOverride", { width, height: Math.min(h, 12000), deviceScaleFactor: 1, mobile });
  await sleep(1200);
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height: Math.min(h, 12000), scale: 1 } });
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  if (process.env.SHOT_EVAL) console.log("eval:", JSON.stringify((await send("Runtime.evaluate", { expression: process.env.SHOT_EVAL, returnByValue: true })).result));
  const url = (await send("Runtime.evaluate", { expression: "location.pathname", returnByValue: true })).result.value;
  console.log(`saved ${out} (${width}x${Math.min(h, 12000)}) at ${url}`);
  ws.close();
} finally {
  chrome.kill();
}
