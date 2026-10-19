// 나이스 입력 북마클릿 (확장 프로그램 없이): 북마크바의 "나이스 입력"을 나이스 화면에서 누르면 이 창이 뜬다.
// 앱 '나이스 입력'에서 복사한 자료를 붙여 넣고 → 반·방식 고르기 → 한 번에 채우기 / 한 명씩 넣기.
// 채우기는 확장과 같은 fill.js · panel.js 를 쓴다 (빌드 때 앞에 붙는다). 저장 버튼은 누르지 않는다.
// 자료는 이 창이 열려 있는 동안 메모리에만 두고, 닫으면 지운다. 서버로 아무것도 보내지 않는다.
(() => {
  if (window.__schsBm) return window.__schsBm.open();
  const N = () => window.__schsNeis;

  const CSS = `
    :host { all: initial; }
    .p { position: fixed; right: 24px; top: 24px; z-index: 2147483647; width: 340px; max-height: calc(100vh - 48px); overflow: auto;
      display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid #c4cad1; border-radius: 12px; background: #fff; color: #191f28;
      font: 14px/1.5 "Pretendard", system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
    .top { display: flex; align-items: center; gap: 8px; }
    .t { flex: 1; font-weight: 700; }
    .x { border: 0; background: none; color: #8b95a1; font-size: 18px; line-height: 1; cursor: pointer; padding: 2px 4px; }
    textarea { box-sizing: border-box; width: 100%; height: 88px; resize: vertical; padding: 10px 12px; border: 0; border-radius: 8px; background: #f2f4f6;
      font: 12px/1.5 ui-monospace, Consolas, monospace; color: #191f28; outline: none; }
    textarea:focus { box-shadow: 0 0 0 2px #536dfe; }
    .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .meta { font-size: 12px; color: #8b95a1; }
    .sub { font-weight: 700; }
    .chip { padding: 2px 8px; border-radius: 6px; background: #eef0ff; color: #3d56e0; font-size: 12px; font-weight: 700; }
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
    button.b { height: 40px; border: 1px solid #d9dde3; border-radius: 8px; background: #fff; color: #191f28; font: inherit; font-weight: 700; cursor: pointer; white-space: nowrap; }
    button.b:disabled { opacity: .4; cursor: default; }
    button.go { border: 0; background: #536dfe; color: #fff; }
    button.link { border: 0; background: none; color: #3d56e0; font: inherit; font-size: 13px; cursor: pointer; padding: 0; }
    .msg { font-size: 12px; color: #8b95a1; }
    .ok { color: #00b86b; } .warn { color: #9a6400; } .bad { color: #f04452; }
    [hidden] { display: none !important; }
  `;

  let host, q, data = null;

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
  const label = (keys) => keys.map((k) => {
    const [g, c, n] = k.split("-").map(Number);
    const s = data.students.find((x) => x.grade === g && x.classNo === c && x.number === n);
    return s ? noOf(s) : k;
  }).join(", ");

  function say(el, parts) {
    el.replaceChildren(...parts.flatMap(([text, tone], i) => {
      const span = document.createElement("span");
      span.textContent = text;
      if (tone) span.className = tone;
      return i ? [document.createTextNode(" · "), span] : [span];
    }));
  }

  function renderList() {
    const max = maxBytes();
    const list = current();
    q(".count").textContent = `${list.length}명`;
    q("ul").replaceChildren(...list.map((s) => {
      const li = document.createElement("li");
      const b = N().neisBytes(s.content);
      if (b > max) li.className = "over";
      for (const [cls, text] of [["n", noOf(s)], ["name", s.name], ["b", `${b.toLocaleString()}B`]]) {
        const span = document.createElement("span");
        span.className = cls;
        span.textContent = text;
        li.appendChild(span);
      }
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
    q(".cls").replaceChildren(...classes.map((c) => new Option(`${c}반`, String(c))));
    q(".clsField").hidden = !byClass();
    q(".max").value = data.maxBytes;
    renderList();
  }

  function use(text) {
    try {
      const json = JSON.parse(text);
      if (json.format !== "schs-neis/1" || !Array.isArray(json.students)) throw new Error("학생관리시스템에서 복사한 자료가 아니에요");
      data = json;
      q(".paste").value = "";
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

  async function fillAll() {
    // 나이스(eXbuilder6) 그리드면 그리드 데이터에 바로 넣는다 (칸을 누르지 않아 한 번에 끝난다)
    const viaGrid = window.__schsCprFill && window.__schsCprFill({ students: current(), mode: mode(), maxBytes: maxBytes() });
    if (viaGrid && viaGrid.filled.length) return report(viaGrid);
    const students = current();
    const base = { students, mode: mode(), maxBytes: maxBytes(), checkName: true, order: false };
    const total = { filled: [], overLimit: [], nameMismatch: [], notFound: [], ordered: false, fieldsSeen: 0 };
    const seen = new Set();
    for (const doc of docs()) {
      const r = await window.__schsNeisFillAll({ ...base, doc });
      for (const k of ["filled", "overLimit", "nameMismatch"]) for (const x of r[k]) if (!seen.has(k + x)) { seen.add(k + x); total[k].push(x); }
      total.fieldsSeen += r.fieldsSeen;
    }
    // 이름으로 하나도 못 찾았으면 확장처럼 위 문서에서 순서대로 넣는다 (이름을 꼭 확인)
    if (!total.filled.length && !total.nameMismatch.length && !total.overLimit.length) {
      const r = window.__schsNeisFill({ ...base, order: true });
      Object.assign(total, { filled: r.filled, overLimit: r.overLimit, ordered: r.ordered, fieldsSeen: r.fieldsSeen });
    }
    const done = new Set([...total.filled, ...total.overLimit, ...total.nameMismatch]);
    total.notFound = students.map((s) => N().keyOf(s)).filter((k) => !done.has(k));
    report(total);
  }

  function report(total) {
    const parts = [[`${total.via === "grid" ? "그리드에 " : total.ordered ? "순서대로 " : ""}${total.filled.length}명 채움`, "ok"]];
    if (total.ordered) parts.push(["이름을 확인해 주세요", "warn"]);
    if (total.overLimit.length) parts.push([`바이트 초과 ${label(total.overLimit)}`, "bad"]);
    if (total.nameMismatch.length) parts.push([`이름 불일치 ${label(total.nameMismatch)}`, "warn"]);
    if (total.notFound.length) parts.push([`화면에 없음 ${label(total.notFound)}`, "warn"]);
    parts.push(["저장은 직접", "warn"]);
    if (!total.filled.length) parts.push(["칸을 못 찾았으면 '한 명씩 넣기'를 써 주세요", "bad"]);
    say(q(".result"), parts);
  }

  function close() {
    data = null;
    host.remove();
    host = null;
  }

  function build() {
    host = document.createElement("div");
    host.id = "schs-neis-bookmarklet";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style>
      <div class="p" role="dialog" aria-label="SCHS 나이스 입력">
        <div class="top"><span class="t">SCHS 나이스 입력</span><button class="x" aria-label="닫기">×</button></div>
        <div class="load">
          <textarea class="paste" aria-label="복사한 자료" placeholder="학생관리시스템 › 나이스 입력에서 '복사'한 자료를 여기에 붙여 넣기 (Ctrl+V)"></textarea>
          <div class="row" style="margin-top:8px"><button class="link clip">클립보드에서 읽기</button><span class="msg loadMsg"></span></div>
        </div>
        <div class="data" hidden>
          <div class="row"><span class="sub"></span><span class="chip"></span><span class="meta"></span></div>
          <div class="row" style="margin-top:10px">
            <label class="clsField">반 <select class="cls" aria-label="반"></select></label>
            <label><input type="radio" name="m" class="replace" checked> 덮어쓰기</label>
            <label><input type="radio" name="m" class="append"> 이어쓰기</label>
          </div>
          <div class="row" style="margin-top:8px"><label>바이트 한도 <input type="number" class="max" min="1" aria-label="바이트 한도"></label><span class="msg count"></span></div>
          <ul style="margin-top:10px"></ul>
          <div class="btns" style="margin-top:10px"><button class="b go fill">한 번에 채우기</button><button class="b step">한 명씩 넣기</button></div>
          <div class="row" style="margin-top:8px"><span class="msg result"></span></div>
          <div class="row" style="margin-top:4px"><button class="link reset">다른 자료 붙여넣기</button></div>
        </div>
      </div>`;
    q = (c) => root.querySelector(c);
    q(".x").addEventListener("click", close);
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
      say(q(".result"), [["채우는 중…", "warn"]]);
      try { await fillAll(); } catch (err) { say(q(".result"), [[err.message || "채우지 못했어요", "bad"]]); } finally { btn.disabled = false; }
    });
    q(".step").addEventListener("click", () => {
      window.__schsNeisPanel({ students: current(), maxBytes: maxBytes(), mode: mode() });
      close();
    });
    q(".reset").addEventListener("click", () => { data = null; say(q(".result"), []); render(); });
    document.documentElement.appendChild(host);
    render();
    q(".paste").focus();
  }

  window.__schsBm = { open: () => { if (!host || !document.contains(host)) build(); } };
  window.__schsBm.open();
})();
