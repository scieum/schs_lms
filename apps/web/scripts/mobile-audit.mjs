// 모바일 전수 점검: 모든 화면을 412px 로 열어 ① 화면보다 넓은 페이지 ② 두 줄로 꺾인 버튼·탭·칩 ③ 화면 밖으로 나간 요소를 찾는다.
// node scripts/mobile-audit.mjs <out 폴더> [포트=3200] [폭=412]   (데모 서버: SUPABASE_URL= … npx next start -p 3200)
// 결과: <out>/report.json, 문제가 있는 화면은 <out>/<이름>.png
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignJWT } from "jose";

const [out = "audit", portArg, widthArg] = process.argv.slice(2);
const base = `http://localhost:${portArg ?? 3200}`;
const width = Number(widthArg ?? 412);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(out, { recursive: true });

// [계정, 경로] — 동적 경로는 부모 화면의 첫 링크로 채운다 (from: 정규식)
const PAGES = [
  ["none", "/"], ["none", "/login"], ["none", "/signup"],
  ...["/teacher", "/teacher/drafts", "/teacher/programs", "/teacher/programs/new", "/teacher/service", "/teacher/subjects", "/teacher/setuk", "/teacher/write",
    "/teacher/club", "/teacher/joint", "/teacher/counseling", "/teacher/logs", "/teacher/pieces", "/teacher/neis", "/teacher/library", "/students", "/students/new", "/schedule", "/me", "/menu"].map((p) => ["t-subject", p]),
  ["t-subject", { from: "/teacher/programs", match: /^\/teacher\/programs\/(?!new)[^/?]+$/, extra: ["", "/edit", "/materials", "/split"] }],
  ["t-subject", { from: "/teacher/setuk", match: /^\/teacher\/setuk\/activity\/[^/?]+$/, extra: [""] }],
  ...["/homeroom", "/homeroom/menu", "/homeroom/behavior", "/homeroom/drafts", "/homeroom/minimum", "/homeroom/night", "/homeroom/scores", "/homeroom/service", "/homeroom/students",
    "/teacher/write?area=%EC%A7%84%EB%A1%9C", "/teacher/pieces"].map((p) => ["t-homeroom", p]),
  ["t-homeroom", { from: "/homeroom/students", match: /^\/homeroom\/students\/[^/?]+$/, extra: [""] }],
  ["t-homeroom", { from: "/teacher/write?area=%EC%9E%90%EC%9C%A8%C2%B7%EC%9E%90%EC%B9%98", match: /^\/teacher\/write\/activity\/[^/?]+$/, extra: [""] }],
  ...["/admin", "/admin/accounts", "/admin/accounts/new", "/admin/audit", "/admin/curriculum", "/admin/errors", "/admin/offerings", "/admin/pipeline"].map((p) => ["t-admin", p]),
  ["t-admin", { from: "/admin/accounts", match: /^\/admin\/accounts\/(?!new)[^/?]+$/, extra: [""] }],
  ...["/student", "/student/courses", "/student/night", "/student/record", "/student/recs", "/student/scores", "/student/submit", "/schedule", "/me"].map((p) => ["s-2", p]), ...["/menu"].map((p) => ["s-2", p]),
];

// 페이지 안에서 도는 점검
const PROBE = `(() => {
  const W = innerWidth, issues = [];
  const scroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  const hidden = (el) => { const r = el.getBoundingClientRect(); return r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden"; };
  const path = (el) => { const parts = []; for (let e = el; e && parts.length < 3; e = e.parentElement) parts.unshift(e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.split(" ").slice(0, 3).join(".") : "")); return parts.join(" > "); };
  if (document.documentElement.scrollWidth > W + 1) issues.push({ kind: "page-wide", text: "scrollWidth " + document.documentElement.scrollWidth });
  // 두 줄로 꺾인 버튼·탭·칩 (글자가 짧은데 줄이 둘 이상)
  const short = [...document.querySelectorAll("button, a, [role=tab], label, select, span[class*=rounded-chip], span[class*=rounded-full]")];
  for (const el of short) {
    if (hidden(el)) continue;
    const t = (el.innerText || "").trim();
    if (!t || t.length > 24 || t.includes("\\n")) continue;
    // 글자 덩어리(텍스트 노드) 하나가 두 줄로 꺾였는지만 본다 (아이콘 위·글자 아래처럼 일부러 쌓은 건 제외)
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
      if (tops.size > 1) { issues.push({ kind: "wrapped", text: t, at: path(el) }); break; }
    }
  }
  // 버튼·탭 줄이 두 줄로 넘어감: 자식이 모두 버튼·링크·칩인 가로 줄에서 자식들의 윗변이 다르다
  const ctrl = (c) => /^(BUTTON|A|LABEL|SELECT)$/.test(c.tagName) || c.getAttribute("role") === "tab" || /rounded-(chip|full)/.test(c.className || "");
  for (const row of document.querySelectorAll("nav, [role=tablist], div, form")) {
    if (hidden(row)) continue;
    const kids = [...row.children].filter((c) => !hidden(c));
    if (kids.length < 2 || !kids.every(ctrl)) continue;
    const cs = getComputedStyle(row);
    if (cs.display !== "flex" || cs.flexDirection.startsWith("column")) continue;
    if (kids.length > 6) continue; // 칩 구름(과목·학생 칩)은 여러 줄이 정상
    const rs = kids.map((c) => c.getBoundingClientRect());
    // 세로로 겹치지 않는 두 자식이 있으면 = 다른 줄로 넘어감 (가운데 정렬로 윗변만 다른 건 제외)
    const broken = rs.some((a) => rs.some((b) => b.top >= a.bottom - 1));
    if (broken) issues.push({ kind: "row-wrapped", text: kids.map((c) => (c.innerText || "").trim()).join(" | ").slice(0, 60), at: path(row) });
  }
  // 버튼 글자가 잘림 (말줄임 없이 넘침)
  for (const el of document.querySelectorAll("button, a, [role=tab]")) {
    if (hidden(el)) continue;
    const st = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && st.overflow !== "visible" && st.textOverflow !== "ellipsis" && (el.innerText || "").trim()) issues.push({ kind: "clipped", text: el.innerText.trim().slice(0, 30), at: path(el) });
  }
  // 화면 밖으로 나간 요소 (가로 스크롤 영역 안은 제외)
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (hidden(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 1 && r.left < W && !scroller(el) && getComputedStyle(el).position !== "fixed") {
      const key = path(el); if (seen.has(key)) continue; seen.add(key);
      issues.push({ kind: "off-screen", text: (el.innerText || "").trim().slice(0, 30), at: key, right: Math.round(r.right) });
    }
  }
  return issues.slice(0, 40);
})()`;

const cdpPort = 9600 + Math.floor(Math.random() * 300);
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", `--remote-debugging-port=${cdpPort}`, "--disable-gpu", `--user-data-dir=${mkdtempSync(join(tmpdir(), "audit-"))}`, "about:blank",
], { stdio: "ignore" });

const report = [];
try {
  let list;
  for (let i = 0; i < 60 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json(); } catch { await sleep(250); } }
  const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const waiting = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result ?? { error: m.error }); waiting.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.value;
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: true });
  await send("Network.enable");
  await send("Page.enable");

  const login = async (account) => {
    await send("Network.clearBrowserCookies");
    if (account === "none") return;
    const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(account).setIssuedAt().setExpirationTime("2h")
      .sign(new TextEncoder().encode(process.env.SHOT_SECRET || "demo-only-session-secret-change-me-please"));
    await send("Network.setCookie", { name: "schs_session", value: token, url: base, path: "/" });
  };
  const visit = async (account, path) => {
    await send("Page.navigate", { url: base + path });
    await sleep(3500);
    const issues = (await evaluate(PROBE)) ?? [{ kind: "error", text: "점검 실패" }];
    const at = await evaluate("location.pathname + location.search");
    const name = `${account}${path}`.replace(/[^a-zA-Z0-9가-힣]+/g, "_");
    if (issues.length) {
      const h = Math.min(await evaluate("document.documentElement.scrollHeight"), 8000);
      await send("Emulation.setDeviceMetricsOverride", { width, height: h, deviceScaleFactor: 1, mobile: true });
      await sleep(600);
      const shot = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(out, `${name}.png`), Buffer.from(shot.data, "base64"));
      await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: true });
    }
    report.push({ account, path, at, issues });
    console.log(`${issues.length ? "✗" : "✓"} ${account} ${path}${at !== path ? ` (→ ${at})` : ""} ${issues.length ? issues.length + "건" : ""}`);
  };

  let current = null;
  for (const [account, p] of PAGES) {
    if (account !== current) { await login(account); current = account; }
    if (typeof p === "string") { await visit(account, p); continue; }
    await send("Page.navigate", { url: base + p.from });
    await sleep(3000);
    const hrefs = (await evaluate(`[...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"))`)) ?? [];
    const first = hrefs.find((h) => p.match.test(h));
    if (!first) { console.log(`- ${account} ${p.from} 에서 상세 링크를 못 찾음`); continue; }
    for (const x of p.extra) await visit(account, first + x);
  }
  ws.close();
} finally {
  chrome.kill();
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\n문제 있는 화면 ${report.filter((r) => r.issues.length).length} / ${report.length}`);
}
