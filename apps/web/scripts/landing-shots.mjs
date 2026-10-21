// 상세페이지 핵심 기능 그림(public/landing/core-0N.png · core-0N-m.png)을 데모 화면에서 다시 찍는다 (N65).
// 사용: 데모 서버(3200)를 켠 뒤 node scripts/landing-shots.mjs  — dev-shot 과 같은 로그인 쿠키 · 헤드리스 크롬
// 그림 틀: 인디고 바탕(#EEF0FF, r24) 위 흰 창(테두리 #E5E8EB) — 창 안은 화면 한 부분을 2배로 찍어 채운다.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignJWT } from "jose";
import sharp from "sharp";

const base = "http://localhost:3200";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// React 입력칸에 값 넣기 (네이티브 setter + input 이벤트)
const TYPE = `window.__type=(el,v)=>{const p=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,"value").set.call(el,v);el.dispatchEvent(new Event("input",{bubbles:true}));};
document.querySelectorAll("*").forEach((e)=>{if(getComputedStyle(e).position==="fixed")e.style.visibility="hidden";});
window.__btn=(t)=>[...document.querySelectorAll("button")].find(b=>b.textContent.trim().startsWith(t));`;
const BODY = "농도를 세 단계로 바꾸며 기체 발생 시간을 측정하고 온도를 수조로 고정해 변인을 통제함. 그래프 기울기로 농도와 반응 속도의 비례 관계를 설명하고, 초시계 반응 시간을 오차 원인으로 짚어 센서 측정을 대안으로 제안함. 발표에서 활성화 에너지와 충돌 횟수로 온도 효과를 해석하고 질문에 근거를 들어 답함.";

/** 찍을 것: 경로 · 계정 · 미리 할 일 · 영역(선택자 또는 고정 좌표, CSS px) */
const SHOTS = [
  { n: 1, path: "/teacher/setuk/collect?course=c-5", who: "t-subject",
    pre: `document.querySelectorAll("ul button[aria-pressed]")[0].click();document.querySelectorAll("ul button[aria-pressed]")[1].click();document.querySelectorAll("ul button[aria-pressed]")[4].click();
      __type(document.querySelector("input[placeholder^='예: 빗면']"),"반응 속도 실험");__type(document.querySelector("textarea"),"농도를 세 단계로 바꾸며 기체 발생 시간을 재고 변인을 통제함");`,
    pc: "section.surface", m: "section.surface" },
  { n: 2, path: "/teacher/setuk/assessments?course=c-5", who: "t-subject", pc: "section.surface", m: "section.surface" },
  { n: 3, path: "/teacher/setuk/compose?course=c-5", who: "t-subject",
    pre: `__type(document.querySelector("form textarea"),${JSON.stringify(BODY)});`, pc: "section[aria-label='세특 글']", m: "section[aria-label='세특 글']", wait: 1500 },
  { n: 4, path: "/teacher/setuk/compose?course=c-5", who: "t-subject",
    pre: `__type(document.querySelector("form textarea"),${JSON.stringify(BODY)});`, pc: "section[aria-label='역량 확인']", m: "section[aria-label='역량 확인']", wait: 1500 },
  { n: 5, path: "/teacher/neis", who: "t-subject", pc: "[data-shell-main] section", m: "[data-shell-main] section", pick: 1, vw: 1040 },
  { n: 6, path: "/homeroom/drafts", who: "t-homeroom", pc: "[data-shell-main] header + *", m: "[data-shell-main] header + *", vw: 1040 },
];

async function browser() {
  const port = 9400 + Math.floor(Math.random() * 500);
  const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", `--remote-debugging-port=${port}`, "--disable-gpu", `--user-data-dir=${mkdtempSync(join(tmpdir(), "shot-"))}`, "about:blank"], { stdio: "ignore" });
  let list;
  for (let i = 0; i < 60 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(250); } }
  const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const waiting = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result ?? { error: m.error }); waiting.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return { send, close: () => { ws.close(); chrome.kill(); } };
}

/** 흰 창 + 인디고 바탕으로 감싼다: W×H 그림, 창은 (pad, pad) 에서 오른쪽 · 아래로 넘친다 */
async function frame(shot, W, H, pad) {
  const winW = W - pad, winH = H - pad;
  const inner = await sharp(shot).resize({ width: winW - 2, height: winH - 1, fit: "cover", position: "top" }).png().toBuffer();
  const mask = Buffer.from(`<svg width="${winW}" height="${winH}"><rect x="0" y="0" width="${winW + 40}" height="${winH + 40}" rx="24" fill="#fff"/></svg>`);
  const win = await sharp({ create: { width: winW, height: winH, channels: 4, background: "#E5E8EB" } })
    .composite([{ input: inner, left: 1, top: 1 }, { input: mask, blend: "dest-in" }]).png().toBuffer();
  const bg = Buffer.from(`<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="24" fill="#EEF0FF"/></svg>`);
  return sharp(bg).composite([{ input: win, left: pad, top: pad }]).png();
}

async function capture(b, s, width) {
  const mobile = width < 768;
  await b.send("Emulation.setDeviceMetricsOverride", { width, height: mobile ? 900 : 1000, deviceScaleFactor: 2, mobile });
  await b.send("Page.navigate", { url: base + s.path });
  await sleep(4500);
  await b.send("Runtime.evaluate", { expression: TYPE });
  if (s.pre) { await b.send("Runtime.evaluate", { expression: s.pre }); await sleep(s.wait ?? 800); }
  const sel = mobile ? s.m : s.pc;
  const expr = s.find ?? `[...document.querySelectorAll(${JSON.stringify(sel)})][${s.pick ?? 0}]`;
  const r = (await b.send("Runtime.evaluate", { expression: `(()=>{const el=${expr};el.scrollIntoView({block:"start"});window.scrollBy(0,-16);const q=el.getBoundingClientRect();return {x:q.left+scrollX,y:q.top+scrollY,w:q.width,h:q.height};})()`, returnByValue: true })).result.value;
  await sleep(600);
  // 창 비율(PC 1120:720 · 모바일 696:712)로 위에서부터 자른다
  const ratio = mobile ? 712 / 696 : 720 / 1120;
  // maxW: 넓은 칸은 한쪽(왼쪽 · right 면 오른쪽)만 — 글씨가 너무 작아지지 않게
  const w = Math.min(r.w + 16, width, mobile ? width : (s.maxW ?? width)), h = Math.min(w * ratio, 2400);
  const x = s.right && !mobile ? r.x + r.w + 8 - w : r.x - 8;
  const clip = { x: Math.max(0, x), y: Math.max(0, r.y - 8), width: w, height: h, scale: 2 };
  await b.send("Emulation.setDeviceMetricsOverride", { width, height: Math.ceil(clip.y + h + 50), deviceScaleFactor: 2, mobile });
  await sleep(400);
  const shot = await b.send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true });
  return Buffer.from(shot.data, "base64");
}

const b = await browser();
try {
  for (const s of SHOTS) {
    for (const width of [s.vw ?? 1440, 412]) {
      const mobile = width < 768;
      const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(s.who).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("demo-only-session-secret-change-me-please"));
      await b.send("Network.enable");
      await b.send("Network.setCookie", { name: "schs_session", value: token, url: base, path: "/" });
      await b.send("Page.enable");
      const png = await capture(b, s, width);
      const out = `public/landing/n65/core-0${s.n}${mobile ? "-m" : ""}.png`;
      await (await frame(png, mobile ? 744 : 1200, mobile ? 760 : 800, mobile ? 48 : 80)).toFile(out);
      console.log("saved", out);
    }
  }
} finally {
  b.close();
}
