// 나이스 입력 북마클릿 (유일한 나이스 입력 방법, 크롬 확장은 2026-10-19 없앰): 북마크바의 "나이스 입력"을 나이스 화면에서 누르면 이 창이 뜬다.
// 앱 '나이스 입력'에서 복사한 자료를 붙여 넣고 → 반·방식 고르기 → 한 번에 채우기 / 한 명씩 넣기.
// 채우기는 cpr-fill.js(나이스 eXbuilder6 그리드에 바로) → fill.js(화면 칸) 순서로 쓴다 (빌드 때 앞에 붙는다). 저장 버튼은 누르지 않는다.
// v0.2.8 (Figma N39): 한 번에 채우기가 끝나면 나이스 칸을 다시 읽어 확정본과 대조 → 다른 것만 다시 채우기 → 흔적 지우기.
// 대조는 나이스 칸 값을 읽기만 한다. 자료는 이 창이 열려 있는 동안 메모리에만 두고, 닫거나 흔적 지우기를 누르면 창 자료와 클립보드를 비운다.
// 서버로 아무것도 보내지 않는다.
(() => {
  // 같은 화면에서 예전 버전 북마클릿을 누른 적이 있으면 그 창을 지우고 새 버전으로 다시 만든다 (v0.2.7)
  const VERSION = "0.2.8";
  if (window.__schsBm) {
    if (window.__schsBm.v === VERSION) return window.__schsBm.open();
    document.getElementById("schs-neis-bookmarklet")?.remove();
    window.__schsBm = null;
  }
  const N = () => window.__schsNeis;

  const ICON = {
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    warn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>',
  };

  const CSS = `
    :host { all: initial; }
    .p { position: fixed; right: 24px; top: 24px; z-index: 2147483647; width: 380px; box-sizing: border-box; max-height: calc(100vh - 48px); overflow: auto;
      display: flex; flex-direction: column; gap: 12px; padding: 17px; border: 1px solid #d9dde3; border-radius: 12px; background: #fff; color: #191f28;
      box-shadow: 0 8px 24px rgba(0,0,0,.12);
      font: 14px/1.5 "Pretendard", system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
    .top { display: flex; align-items: center; gap: 8px; }
    .t { flex: 1; font-size: 15px; font-weight: 700; }
    .v { font-size: 12px; color: #8b95a1; }
    .x { border: 0; background: none; color: #8b95a1; font-size: 20px; line-height: 1; cursor: pointer; padding: 2px 4px; }
    textarea { box-sizing: border-box; width: 100%; height: 88px; resize: vertical; padding: 10px 12px; border: 0; border-radius: 8px; background: #f2f4f6;
      font: 12px/1.5 ui-monospace, Consolas, monospace; color: #191f28; outline: none; }
    textarea:focus { box-shadow: 0 0 0 2px #536dfe; }
    .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .meta { font-size: 12px; color: #8b95a1; }
    .sub { font-weight: 700; }
    .chip { padding: 1px 8px; border-radius: 6px; background: #eef0ff; color: #3d56e0; font-size: 12px; font-weight: 700; }
    label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #4e5968; }
    select, input[type=number] { height: 32px; padding: 0 8px; border: 0; border-radius: 8px; background: #f2f4f6; font: inherit; font-size: 13px; color: #191f28; }
    input[type=number] { width: 72px; text-align: right; }
    ul { margin: 0; padding: 0; list-style: none; max-height: 160px; overflow: auto; border: 1px solid #e5e8eb; border-radius: 10px; }
    li { display: flex; gap: 8px; padding: 6px 10px; font-size: 13px; border-top: 1px solid #f2f4f6; }
    li:first-child { border-top: 0; }
    li .n { width: 44px; color: #8b95a1; font-variant-numeric: tabular-nums; }
    li .name { flex: 1; }
    li .b { color: #4e5968; font-variant-numeric: tabular-nums; }
    li.over .b { color: #f04452; font-weight: 700; }
    .btns { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .btns.wide { grid-template-columns: 1.7fr 1fr; gap: 8px; }
    button.b { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 40px; border: 1px solid #d9dde3; border-radius: 8px; background: #fff; color: #191f28;
      font: inherit; font-weight: 700; cursor: pointer; white-space: nowrap; padding: 0 10px; }
    button.b:disabled { opacity: .4; cursor: default; }
    button.go { border: 0; background: #536dfe; color: #fff; }
    button.link { border: 0; background: none; color: #3d56e0; font: inherit; font-size: 13px; cursor: pointer; padding: 0; }
    .msg { font-size: 12px; color: #8b95a1; }
    .ok { color: #00b86b; } .warn { color: #9a6400; } .bad { color: #f04452; }
    .res { display: flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 8px; background: #e3f8ee; font-size: 12px; font-weight: 700; color: #00b86b; }
    .res.none { background: #f2f4f6; color: #4e5968; }
    .res .warn { color: #9a6400; } .res .bad { color: #f04452; }
    .hr { height: 1px; background: #e5e8eb; }
    .ch { display: flex; align-items: center; }
    .ch b { flex: 1; font-size: 14px; }
    .ch button { display: inline-flex; align-items: center; gap: 4px; border: 0; background: none; color: #3d56e0; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; padding: 0; }
    .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .tile { padding: 10px 12px; border-radius: 10px; }
    .tile span { display: block; font-size: 12px; font-weight: 700; }
    .tile b { display: block; font-size: 20px; line-height: 1.3; color: #191f28; }
    .tile.same { background: #e3f8ee; } .tile.same span { color: #00b86b; }
    .tile.diff { background: #feecee; } .tile.diff span { color: #f04452; }
    .tile.nf { background: #fff5e0; } .tile.nf span { color: #9a6400; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chips button { height: 26px; padding: 0 10px; border: 1px solid #d9dde3; border-radius: 999px; background: #fff; color: #4e5968; font: inherit; font-size: 12px; cursor: pointer; }
    .chips button[aria-pressed=true] { border-color: #eef0ff; background: #eef0ff; color: #3d56e0; font-weight: 700; }
    .list { border: 1px solid #e5e8eb; border-radius: 10px; overflow: hidden; }
    .list .scroll { max-height: 300px; overflow: auto; }
    .it { border-top: 1px solid #f2f4f6; }
    .it:first-child { border-top: 0; }
    .ir { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 40px; padding: 0 10px; border: 0; background: #fff; font: inherit; font-size: 13px; text-align: left; cursor: pointer; color: #191f28; }
    .ir .n { width: 32px; flex: none; font-size: 12px; color: #8b95a1; font-variant-numeric: tabular-nums; }
    .ir .nm { flex: 1; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ir .d { font-size: 12px; color: #4e5968; white-space: nowrap; }
    .ir .st { padding: 1px 6px; border-radius: 6px; font-size: 11px; font-weight: 700; white-space: nowrap; }
    .st.same { background: #e3f8ee; color: #00b86b; } .st.diff { background: #feecee; color: #f04452; } .st.nf { background: #fff5e0; color: #9a6400; }
    .ir .cv { color: #8b95a1; display: inline-flex; transition: transform .15s; }
    .it.open .ir { background: #f9fafb; }
    .it.open .cv { transform: rotate(90deg); }
    .box { padding: 10px 12px; background: #f5f6f8; font-size: 12px; color: #333d4b; }
    .box .ln { display: flex; gap: 8px; margin-bottom: 4px; }
    .box .ln i { flex: none; width: 40px; font-style: normal; font-weight: 700; font-size: 11px; color: #4e5968; }
    .box .ln span { word-break: break-all; }
    .box .add { color: #00b86b; font-weight: 700; text-decoration: underline; }
    .box .cut { color: #f04452; font-weight: 700; }
    .box .why { margin-top: 6px; font-size: 11px; color: #8b95a1; }
    .box .one { display: inline-block; margin-top: 6px; border: 0; background: none; color: #3d56e0; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; padding: 0; }
    .fold { display: flex; align-items: center; justify-content: space-between; padding: 9px 10px; border-top: 1px solid #f2f4f6; background: #fafbfc; font-size: 12px; color: #8b95a1; }
    .fold button { border: 0; background: none; color: #3d56e0; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; padding: 0; }
    .foot { display: flex; gap: 8px; padding: 9px 12px; border-radius: 8px; background: #f5f6f8; font-size: 11px; line-height: 1.5; color: #8b95a1; }
    .foot svg { flex: none; margin-top: 1px; }
    [hidden] { display: none !important; }
    .toast { position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; display: flex; align-items: center; gap: 12px; max-width: 480px; padding: 12px 18px;
      border-radius: 10px; background: #1c2033; color: #fff; box-shadow: 0 8px 24px rgba(0,0,0,.18);
      font: 14px/1.4 "Pretendard", system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
    .toast .ic { display: inline-flex; color: #00b86b; } .toast .ic.w { color: #ffb020; }
    .toast b { display: block; font-size: 14px; }
    .toast span { display: block; font-size: 12px; color: #c4cad1; }
  `;

  let host, q, data = null;
  // 대조 상태: 채울 때 만든 기대값(학생 키 → 글) · 마지막 대조 결과 · 거르기 · 펼친 줄
  let expected = {};
  let cmp = null;
  let filter = "diff";
  let openKey = null;
  let marked = [];

  const studentNo = (s) => `${s.grade}${String(s.classNo).padStart(2, "0")}${String(s.number).padStart(2, "0")}`;
  const byClass = () => data.kind !== "창체-동아리"; // 동아리는 여러 반이 섞인 한 화면
  const noOf = (s) => (byClass() ? `${s.number}번` : studentNo(s));
  const maxBytes = () => Number(q(".max").value) || data.maxBytes;
  const mode = () => (q(".append").checked ? "append" : "replace");
  const current = () => {
    const cls = Number(q(".cls").value);
    const list = byClass() ? data.students.filter((s) => s.classNo === cls) : [...data.students];
    return list.sort((a, b) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number);
  };
  const byKey = (k) => data.students.find((s) => N().keyOf(s) === k);
  const label = (keys) => keys.map((k) => { const s = byKey(k); return s ? noOf(s) : k; }).join(", ");
  const hhmm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function say(target, parts) {
    target.replaceChildren(...parts.flatMap(([text, tone], i) => {
      const span = el("span", tone || "", text);
      return i ? [document.createTextNode(" · "), span] : [span];
    }));
  }

  function renderList() {
    const max = maxBytes();
    const list = current();
    q(".count").textContent = `${list.length}명`;
    q("ul").replaceChildren(...list.map((s) => {
      const li = el("li");
      const b = N().neisBytes(s.content);
      if (b > max) li.className = "over";
      for (const [cls, text] of [["n", noOf(s)], ["name", s.name], ["b", `${b.toLocaleString()}B`]]) li.appendChild(el("span", cls, text));
      return li;
    }));
  }

  function render() {
    q(".load").hidden = !!data;
    q(".data").hidden = !data;
    if (!data) return;
    q(".sub").textContent = data.subject;
    q(".chip").textContent = data.kind.replace(/^창체-/, "");
    q(".meta").textContent = [byClass() ? `${data.grade}학년${data.semester ? ` ${data.semester}학기` : ""}` : null, data.section, `확정 ${data.students.length}명`].filter(Boolean).join(" · ");
    const classes = [...new Set(data.students.map((s) => s.classNo))].sort((a, b) => a - b);
    const keep = q(".cls").value;
    q(".cls").replaceChildren(...classes.map((c) => new Option(`${c}반`, String(c))));
    if (keep && classes.includes(Number(keep))) q(".cls").value = keep;
    q(".clsField").hidden = !byClass();
    if (!q(".max").value) q(".max").value = data.maxBytes;
    renderList();
    renderCmp();
  }

  function use(text) {
    try {
      const json = JSON.parse(text);
      if (json.format !== "schs-neis/1" || !Array.isArray(json.students)) throw new Error("학생관리시스템에서 복사한 자료가 아니에요");
      data = json;
      expected = {};
      cmp = null;
      q(".paste").value = "";
      q(".max").value = "";
      say(q(".loadMsg"), []);
      render();
    } catch (err) {
      say(q(".loadMsg"), [[err instanceof SyntaxError ? "학생관리시스템 › 나이스 입력에서 '복사'를 먼저 눌러 주세요" : err.message, "bad"]]);
    }
  }

  // 같은 출처의 프레임 안 문서까지 (나이스 화면이 프레임 안에 그려질 수 있다)
  function docs(win = window, out = []) {
    try {
      out.push(win.document);
      for (let i = 0; i < win.frames.length; i++) docs(win.frames[i], out);
    } catch { /* 다른 출처 프레임은 건너뛴다 */ }
    return out;
  }

  /** 채우기: students·방식을 주면 그 학생만 (다른 것만 다시 채우기는 기대값을 덮어쓰기로 다시 넣는다) */
  async function fillAll(students = current(), how = mode()) {
    // 나이스(eXbuilder6) 그리드면 그리드 데이터에 바로 넣는다 (칸을 누르지 않아 한 번에 끝난다)
    const viaGrid = window.__schsCprFill && window.__schsCprFill({ students, mode: how, maxBytes: maxBytes() });
    if (viaGrid && viaGrid.filled.length) return viaGrid;
    const base = { students, mode: how, maxBytes: maxBytes(), checkName: true, order: false };
    const total = { filled: [], overLimit: [], nameMismatch: [], notFound: [], ordered: false, fieldsSeen: 0, expected: {} };
    const seen = new Set();
    for (const doc of docs()) {
      const r = await window.__schsNeisFillAll({ ...base, doc });
      for (const k of ["filled", "overLimit", "nameMismatch"]) for (const x of r[k]) if (!seen.has(k + x)) { seen.add(k + x); total[k].push(x); }
      Object.assign(total.expected, r.expected || {});
      total.fieldsSeen += r.fieldsSeen;
    }
    // 이름으로 하나도 못 찾았으면 위 문서에서 순서대로 넣는다 (이름을 꼭 확인)
    if (!total.filled.length && !total.nameMismatch.length && !total.overLimit.length) {
      const r = window.__schsNeisFill({ ...base, order: true });
      Object.assign(total, { filled: r.filled, overLimit: r.overLimit, ordered: r.ordered, fieldsSeen: r.fieldsSeen, expected: r.expected || {} });
    }
    const done = new Set([...total.filled, ...total.overLimit, ...total.nameMismatch]);
    total.notFound = students.map((s) => N().keyOf(s)).filter((k) => !done.has(k));
    return total;
  }

  function report(total, refilled) {
    const parts = refilled != null
      ? [[`다른 ${refilled}명을 다시 채웠어요`, "ok"]]
      : [[`${total.via === "grid" ? "그리드에 " : total.ordered ? "순서대로 " : ""}${total.filled.length}명 채움`, "ok"]];
    if (total.ordered) parts.push(["이름을 확인해 주세요", "warn"]);
    if (total.overLimit.length) parts.push([`바이트 초과 ${label(total.overLimit)}`, "bad"]);
    if (total.nameMismatch.length) parts.push([`이름 불일치 ${label(total.nameMismatch)}`, "warn"]);
    if (!cmp && total.notFound.length) parts.push([`화면에 없음 ${label(total.notFound)}`, "warn"]);
    parts.push(["저장은 직접", "warn"]);
    if (!total.filled.length) parts.push(["칸을 못 찾았으면 '한 명씩 넣기'를 써 주세요", "bad"]);
    const box = q(".result");
    box.hidden = false;
    box.classList.toggle("none", !total.filled.length);
    box.innerHTML = total.filled.length ? ICON.check : "";
    const txt = el("span");
    say(txt, parts);
    box.appendChild(txt);
  }

  // ---------- 대조 ----------

  function unmark() {
    for (const m of marked) { try { m.style.outline = m.dataset.schsOutline || ""; m.style.outlineOffset = ""; } catch { /* 지워진 칸 */ } }
    marked = [];
  }

  /** 다름 칸 2px 빨강 (그리드면 그 학생 줄을 이름으로 찾아 표시하고 그 줄로 스크롤) */
  function markDiff(scrollKey) {
    unmark();
    if (!cmp) return;
    for (const r of cmp.results.filter((x) => x.status === "diff")) {
      let target = cmp.els && cmp.els[r.key];
      if (!target) {
        const s = byKey(r.key);
        for (const doc of docs()) {
          const name = s && N().findText(doc, s.name)[0];
          if (name) { target = name.closest("tr, [role=row]") || name; break; }
        }
      }
      if (!target) continue;
      target.dataset.schsOutline = target.style.outline;
      target.style.outline = "2px solid #F04452";
      target.style.outlineOffset = "1px";
      marked.push(target);
      if (r.key === scrollKey) target.scrollIntoView({ block: "center" });
    }
  }

  /** 나이스 칸을 다시 읽어 기대값과 견준다. 읽기만 한다 */
  function compare(note) {
    const students = current();
    const p = { students, expected };
    let res = window.__schsCprRead && window.__schsCprRead(p);
    if (!res) {
      // 화면 칸: 문서(프레임)마다 읽어 찾은 학생을 합친다
      const best = {};
      const els = {};
      for (const doc of docs()) {
        const r = window.__schsNeisRead({ ...p, doc });
        for (const x of r.results) if (!best[x.key] || (best[x.key].status === "notFound" && x.status !== "notFound")) best[x.key] = x;
        Object.assign(els, r.els);
      }
      res = { via: "screen", results: students.map((s) => best[N().keyOf(s)] || { key: N().keyOf(s), status: "notFound" }), els };
    }
    cmp = { ...res, at: hhmm(), note };
    const n = counts();
    filter = n.diff ? "diff" : n.nf ? "nf" : "same";
    openKey = null;
    markDiff();
    renderCmp();
  }

  const counts = () => {
    const r = cmp ? cmp.results : [];
    return { all: r.length, same: r.filter((x) => x.status === "same").length, diff: r.filter((x) => x.status === "diff").length, nf: r.filter((x) => x.status === "notFound").length };
  };

  function why(r) {
    if (r.status === "notFound") return "화면에 이름 없음";
    if (r.kind === "cut") return `${r.missingBytes.toLocaleString()}B 덜 들어감`;
    return "나이스에서 고친 글";
  }

  const clip = (t, n = 48) => (t.length > n ? `${t.slice(0, n)}…` : t);

  function diffBox(r, s) {
    const box = el("div", "box");
    if (r.status === "notFound") {
      box.appendChild(el("div", "", `이 나이스 화면에 '${s.name}'이 없어요. 다른 반 화면이거나 나이스 이름이 달라요(예: 띄어쓰기).`));
      const one = el("button", "one", "이 학생만 한 명씩 넣기 ›");
      one.addEventListener("click", () => stepIn([s]));
      box.appendChild(one);
      return box;
    }
    const line = (name, parts) => {
      const ln = el("div", "ln");
      ln.appendChild(el("i", "", name));
      const span = el("span");
      for (const [t, cls] of parts) span.appendChild(cls ? el("span", cls, t) : document.createTextNode(t));
      ln.appendChild(span);
      return ln;
    };
    box.appendChild(line("확정본", [[r.prefix], [clip(r.wantPart), "add"]]));
    box.appendChild(line("나이스", r.kind === "cut" ? [[r.prefix], ["‹여기서 끊김›", "cut"]] : [[r.prefix], [clip(r.gotPart), "cut"]]));
    box.appendChild(el("div", "why", r.kind === "cut"
      ? `끝 ${r.missingBytes.toLocaleString()}B가 덜 들어갔어요. 나이스 칸을 눌러 보거나 '다른 것만 다시 채우기'를 눌러 주세요`
      : "나이스에서 고친 것 같아요. 그대로 두려면 넘어가고, 확정본으로 돌리려면 '다른 것만 다시 채우기'를 눌러 주세요"));
    return box;
  }

  function renderCmp() {
    const on = !!(data && cmp);
    q(".again").hidden = !on;
    q(".reset").hidden = on;
    q(".setup").hidden = on;
    q(".cmp").hidden = !on;
    q(".fillBtns").hidden = on;
    q(".cmpBtns").hidden = !on;
    if (!on) return;
    const n = counts();
    q(".cmpNote").textContent = cmp.note ? `다시 읽어 봤어요 (${cmp.at}) · ${n.diff ? `다른 칸 ${n.diff}개` : "다른 칸 없음"}` : `나이스 칸을 다시 읽어 확정본과 견줘 봤어요 (${cmp.at})`;
    q(".tSame").textContent = `${n.same}명`;
    q(".tDiff").textContent = `${n.diff}명`;
    q(".tNf").textContent = `${n.nf}명`;
    const chips = [["all", `전체 ${n.all}`], ["diff", `다름 ${n.diff}`], ["nf", `못 찾음 ${n.nf}`], ["same", `일치 ${n.same}`]];
    q(".chips").replaceChildren(...chips.map(([k, t]) => {
      const b = el("button", "", t);
      b.setAttribute("aria-pressed", String(filter === k));
      b.addEventListener("click", () => { filter = k; openKey = null; renderCmp(); });
      return b;
    }));
    // 다름 = 다름 + 못 찾음(확인할 것), 못 찾음 = 못 찾음만. 일치는 접어 둔다
    const order = { diff: 0, notFound: 1, same: 2 };
    const shown = cmp.results
      .filter((r) => filter === "all" || (filter === "diff" ? r.status !== "same" : filter === "nf" ? r.status === "notFound" : r.status === "same"))
      .sort((a, b) => order[a.status] - order[b.status]);
    const items = shown.map((r) => {
      const s = byKey(r.key);
      const it = el("div", `it${openKey === r.key ? " open" : ""}`);
      const row = el("button", "ir");
      row.type = "button";
      row.appendChild(el("span", "n", s ? noOf(s) : ""));
      row.appendChild(el("span", "nm", s ? s.name : r.key));
      if (r.status !== "same") row.appendChild(el("span", "d", why(r)));
      else row.appendChild(el("span", "d", `${r.neisBytes.toLocaleString()}B`));
      const tone = r.status === "same" ? "same" : r.status === "diff" ? "diff" : "nf";
      row.appendChild(el("span", `st ${tone}`, r.status === "same" ? "일치" : r.status === "diff" ? "다름" : "못 찾음"));
      const cv = el("span", "cv");
      cv.innerHTML = ICON.chev;
      if (r.status !== "same") row.appendChild(cv);
      row.addEventListener("click", () => {
        if (r.status === "same") return;
        openKey = openKey === r.key ? null : r.key;
        if (openKey && r.status === "diff") markDiff(r.key);
        renderCmp();
      });
      it.appendChild(row);
      if (openKey === r.key && s) it.appendChild(diffBox(r, s));
      return it;
    });
    const scroll = q(".list .scroll");
    scroll.replaceChildren(...items);
    const folded = !!n.same && filter !== "same" && filter !== "all";
    q(".fold").hidden = !folded;
    q(".list").hidden = !items.length && !folded;
    q(".foldTxt").textContent = `일치 ${n.same}명은 접어 뒀어요`;
    // 버튼: 다름이 있으면 "다른 것만 다시 채우기 · n명" + 흔적 지우기, 없으면 "흔적 지우기 하고 닫기" + 한 명씩 넣기
    q(".refill").hidden = !n.diff;
    q(".refill").textContent = `다른 것만 다시 채우기 · ${n.diff}명`;
    q(".wipe2").hidden = !n.diff;
    q(".wipeClose").hidden = !!n.diff;
    q(".stepNf").hidden = !!n.diff;
  }

  // ---------- 흔적 지우기 ----------

  function toast(ok, title, sub) {
    const t = document.createElement("div");
    t.id = "schs-neis-toast";
    const root = t.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><div class="toast" role="status"><span class="ic${ok ? "" : " w"}">${ok ? ICON.check : ICON.warn}</span><div><b></b><span></span></div></div>`;
    root.querySelector("b").textContent = title;
    root.querySelector("div span:not(.ic)").textContent = sub;
    document.getElementById("schs-neis-toast")?.remove();
    document.documentElement.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  async function clearClipboard() {
    try { await navigator.clipboard.writeText(""); return true; } catch { return false; }
  }

  /** 창 자료(메모리) 비움 → 클립보드에 빈 글자 → 창 닫기 → 토스트 4초. 나이스 칸에 채운 글은 그대로 */
  async function wipe() {
    const n = data ? data.students.length : 0;
    const ok = await clearClipboard();
    close();
    if (ok) toast(true, "흔적을 지웠어요", `창 자료 ${n}명 · 클립보드 비움 · 나이스 칸에 채운 글은 그대로예요 — 저장은 직접`);
    else toast(false, "창 자료는 지웠어요", "클립보드는 못 비웠어요 — 아무 글자나 한 번 복사해 덮어 주세요");
  }

  function stepIn(students) {
    window.__schsNeisPanel({ students, maxBytes: maxBytes(), mode: mode() });
    close();
  }

  function close() {
    unmark();
    data = null;
    expected = {};
    cmp = null;
    if (host) host.remove();
    host = null;
  }

  function build() {
    host = document.createElement("div");
    host.id = "schs-neis-bookmarklet";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style>
      <div class="p" role="dialog" aria-label="SCHS 나이스 입력">
        <div class="top"><span class="t">SCHS 나이스 입력</span><span class="v">v${VERSION}</span><button class="x" aria-label="닫기">×</button></div>
        <div class="load">
          <textarea class="paste" aria-label="복사한 자료" placeholder="학생관리시스템 › 나이스 입력에서 '복사'한 자료를 여기에 붙여 넣기 (Ctrl+V)"></textarea>
          <div class="row" style="margin-top:8px"><button class="link clip">클립보드에서 읽기</button><span class="msg loadMsg"></span></div>
        </div>
        <div class="data" hidden style="display:flex;flex-direction:column;gap:12px">
          <div class="row"><span class="sub"></span><span class="chip"></span><span class="meta"></span></div>
          <div class="setup" style="display:flex;flex-direction:column;gap:10px">
            <div class="row">
              <label class="clsField">반 <select class="cls" aria-label="반"></select></label>
              <label><input type="radio" name="m" class="replace" checked> 덮어쓰기</label>
              <label><input type="radio" name="m" class="append"> 이어쓰기</label>
            </div>
            <div class="row"><label>바이트 한도 <input type="number" class="max" min="1" aria-label="바이트 한도"></label><span class="msg count"></span></div>
            <ul></ul>
          </div>
          <div class="btns fillBtns"><button class="b go fill">한 번에 채우기</button><button class="b step">한 명씩 넣기</button></div>
          <div class="res result" hidden></div>
          <div class="cmp" hidden style="display:flex;flex-direction:column;gap:12px">
            <div class="hr"></div>
            <div>
              <div class="ch"><b>채운 뒤 대조</b><button class="reread" type="button">${ICON.refresh}다시 읽기</button></div>
              <div class="msg cmpNote" style="margin-top:2px"></div>
            </div>
            <div class="tiles">
              <div class="tile same"><span>일치</span><b class="tSame"></b></div>
              <div class="tile diff"><span>다름</span><b class="tDiff"></b></div>
              <div class="tile nf"><span>못 찾음</span><b class="tNf"></b></div>
            </div>
            <div class="chips" role="group" aria-label="거르기"></div>
            <div class="list"><div class="scroll"></div><div class="fold"><span class="foldTxt"></span><button class="unfold" type="button">펼치기</button></div></div>
          </div>
          <div class="btns wide cmpBtns" hidden>
            <button class="b go refill"></button><button class="b wipe2">${ICON.trash}흔적 지우기</button>
            <button class="b go wipeClose">${ICON.trash}흔적 지우기 하고 닫기</button><button class="b stepNf">한 명씩 넣기</button>
          </div>
          <div class="row"><button class="link reset">다른 자료 붙여넣기</button><button class="link again" hidden>반·방식 다시 고르기</button></div>
          <div class="foot">${ICON.lock}<span>자료는 이 창에만 있어요 · 닫거나 '흔적 지우기'를 누르면 창 자료와 클립보드를 비워요</span></div>
        </div>
      </div>`;
    q = (c) => root.querySelector(c);
    // × 로 닫을 때도 창 자료와 클립보드를 비운다 (누른 동작이라 클립보드 쓰기가 된다 · 막히면 창 자료만)
    q(".x").addEventListener("click", () => { const had = !!data; close(); if (had) clearClipboard(); });
    q(".paste").addEventListener("paste", (e) => { e.preventDefault(); use(e.clipboardData.getData("text")); });
    q(".paste").addEventListener("input", (e) => { if (e.target.value.trim().endsWith("}")) use(e.target.value); });
    q(".clip").addEventListener("click", async () => {
      try { use(await navigator.clipboard.readText()); }
      catch { say(q(".loadMsg"), [["클립보드를 못 읽었어요. 위 칸에 Ctrl+V 해 주세요", "bad"]]); }
    });
    q(".cls").addEventListener("change", renderList);
    q(".max").addEventListener("input", renderList);
    q(".fill").addEventListener("click", async () => {
      const btn = q(".fill");
      btn.disabled = true;
      q(".result").hidden = false;
      q(".result").classList.add("none");
      say(q(".result"), [["채우는 중…", "warn"]]);
      try {
        const total = await fillAll();
        Object.assign(expected, total.expected || {});
        cmp = null;
        // 한 번에 채우기가 끝나면 자동으로 대조 (못 찾은 학생은 대조 목록에 나온다)
        if (total.filled.length) compare();
        report(total);
      } catch (err) { say(q(".result"), [[err.message || "채우지 못했어요", "bad"]]); } finally { btn.disabled = false; }
    });
    q(".step").addEventListener("click", () => stepIn(current()));
    q(".reread").addEventListener("click", () => compare(cmp && cmp.note));
    q(".unfold").addEventListener("click", () => { filter = "all"; renderCmp(); });
    q(".refill").addEventListener("click", async () => {
      const btn = q(".refill");
      btn.disabled = true;
      try {
        const keys = cmp.results.filter((r) => r.status === "diff").map((r) => r.key);
        const students = keys.map(byKey).filter(Boolean).map((s) => ({ ...s, content: expected[N().keyOf(s)] ?? s.content }));
        const total = await fillAll(students, "replace");
        report(total, total.filled.length);
        compare(true);
      } catch (err) { say(q(".result"), [[err.message || "채우지 못했어요", "bad"]]); } finally { btn.disabled = false; }
    });
    q(".wipe2").addEventListener("click", wipe);
    q(".wipeClose").addEventListener("click", wipe);
    q(".stepNf").addEventListener("click", () => {
      const nf = cmp.results.filter((r) => r.status === "notFound").map((r) => byKey(r.key)).filter(Boolean);
      stepIn(nf.length ? nf : current());
    });
    q(".again").addEventListener("click", () => { unmark(); cmp = null; q(".result").hidden = true; render(); });
    q(".reset").addEventListener("click", () => { unmark(); data = null; expected = {}; cmp = null; q(".result").hidden = true; render(); });
    document.documentElement.appendChild(host);
    render();
    q(".paste").focus();
  }

  window.__schsBm = { v: VERSION, open: () => { if (!host || !document.contains(host)) build(); } };
  window.__schsBm.open();
})();
