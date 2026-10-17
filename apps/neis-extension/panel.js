// 한 명씩 넣기: 나이스 화면 오른쪽 아래에 작은 패널을 띄운다.
// 선생님이 나이스에서 학생을 고르고 입력칸을 누른 뒤 '넣기' → 그 칸에 이 학생 내용을 넣는다.
// 화면 구조를 몰라도 쓸 수 있는 방법. 저장 버튼은 누르지 않는다.
// 팝업이 fill.js → panel.js 를 넣은 뒤 window.__schsNeisPanel(payload) 를 부른다.
(() => {
  if (window.__schsNeisPanel) return;
  const N = () => window.__schsNeis;

  const CSS = `
    :host { all: initial; }
    .p { position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; width: 320px; display: flex; flex-direction: column;
      gap: 12px; padding: 16px; border: 1px solid #c4cad1; border-radius: 12px; background: #fff; color: #191f28;
      font: 14px/1.5 "Pretendard", system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
    .top { display: flex; align-items: center; gap: 8px; }
    .pos { font-weight: 700; color: #536dfe; font-variant-numeric: tabular-nums; }
    .who { flex: 1; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .x { border: 0; background: none; color: #8b95a1; font-size: 18px; line-height: 1; cursor: pointer; padding: 2px 4px; }
    .txt { height: 148px; overflow: auto; padding: 10px 12px; border-radius: 10px; background: #f2f4f6; font-size: 13px; white-space: pre-wrap; }
    .meta { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #8b95a1; }
    .bar { flex: 1; height: 4px; border-radius: 2px; background: #eef0ff; overflow: hidden; }
    .bar i { display: block; height: 100%; background: #536dfe; }
    .bar i.over { background: #f04452; }
    .meta b { color: #191f28; font-variant-numeric: tabular-nums; }
    .meta b.over { color: #f04452; }
    .btns { display: grid; grid-template-columns: 44px 1fr 44px; gap: 6px; }
    button.b { height: 44px; font-size: 18px; border: 1px solid #d5dae3; border-radius: 8px; background: #fff; color: #4e5968; font: inherit; cursor: pointer; }
    button.b:disabled { opacity: .4; cursor: default; }
    button.go { font-size: 15px; border: 0; background: #536dfe; color: #fff; font-weight: 700; }
    .row { display: flex; align-items: center; justify-content: space-between; }
    .msg { font-size: 12px; color: #8b95a1; }
    .msg.ok { color: #1f9d55; } .msg.bad { color: #f04452; }
    .copy { border: 0; background: none; color: #3d56e0; font: inherit; font-size: 12px; cursor: pointer; padding: 0; }
  `;

  let host, ui, state, last = null;

  // 마지막으로 누른 입력칸 기억 + 그 줄의 학생으로 자동 맞춤
  document.addEventListener("focusin", (e) => {
    const el = e.composedPath ? e.composedPath()[0] : e.target;
    if (!state || !N().isEditable(el) || (host && host.contains(el))) return;
    last = el;
    const row = el.closest("tr, [role=row]");
    if (!row) return;
    const { s } = N().matchRow(row, state.students, true);
    if (s) {
      const i = state.students.indexOf(s);
      if (i >= 0 && i !== state.i) { state.i = i; render("이 줄 학생으로 맞췄어요"); }
    }
  }, true);

  function render(msg, tone) {
    const s = state.students[state.i];
    const bytes = N().neisBytes(s.content);
    ui.pos.textContent = `${state.i + 1} / ${state.students.length}`;
    ui.who.textContent = `· ${s.name} ${s.number}번`;
    ui.txt.textContent = s.content;
    ui.bytes.textContent = `${bytes.toLocaleString()} / ${state.maxBytes.toLocaleString()}B`;
    ui.bytes.className = bytes > state.maxBytes ? "over" : "";
    ui.fill.style.width = `${Math.min(100, (bytes / state.maxBytes) * 100)}%`;
    ui.fill.className = bytes > state.maxBytes ? "over" : "";
    ui.prev.disabled = state.i === 0;
    ui.next.disabled = state.i === state.students.length - 1;
    ui.msg.textContent = msg ?? "나이스 입력칸을 누른 뒤 넣기";
    ui.msg.className = `msg${tone ? ` ${tone}` : ""}`;
  }

  function put() {
    const s = state.students[state.i];
    const el = last && document.contains(last) ? last : N().isEditable(document.activeElement) ? document.activeElement : null;
    if (!el) return render("먼저 나이스 입력칸을 눌러 주세요", "bad");
    // 다른 학생 줄의 칸이면 넣지 않고 그 학생으로 옮긴다 (엉뚱한 학생에게 들어가지 않게)
    const row = el.closest("tr, [role=row]");
    const hit = row ? N().matchRow(row, state.students, true).s : null;
    if (hit && hit !== s) {
      state.i = state.students.indexOf(hit);
      return render(`이 칸은 ${hit.number}번 ${hit.name} 줄이에요. 다시 넣기`, "bad");
    }
    const before = N().getValue(el);
    const next = state.mode === "append" && before.trim() ? `${before.trimEnd()} ${s.content}` : s.content;
    if (N().neisBytes(next) > state.maxBytes) return render("바이트를 넘어서 넣지 않았어요", "bad");
    N().typeInto(el, next);
    el.style.outline = "2px solid #536DFE";
    el.style.outlineOffset = "1px";
    state.done.add(state.i);
    if (state.i < state.students.length - 1) state.i++;
    render(`${s.number}번 ${s.name} 넣었어요 · 저장은 직접`, "ok");
  }

  function build() {
    host = document.createElement("div");
    host.id = "schs-neis-panel";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style>
      <div class="p" role="dialog" aria-label="한 명씩 넣기">
        <div class="top"><span class="pos"></span><span class="who"></span><button class="x" aria-label="닫기">×</button></div>
        <div class="txt"></div>
        <div class="meta"><span class="bar"><i></i></span><b></b></div>
        <div class="btns"><button class="b prev" aria-label="이전 학생">‹</button><button class="b go">넣기</button><button class="b next" aria-label="다음 학생">›</button></div>
        <div class="row"><span class="msg"></span><button class="copy">복사</button></div>
      </div>`;
    const q = (c) => root.querySelector(c);
    ui = { fill: q(".bar i"), pos: q(".pos"), who: q(".who"), txt: q(".txt"), bytes: q(".meta b"), prev: q(".prev"), next: q(".next"), msg: q(".msg") };
    // 버튼을 눌러도 나이스 입력칸의 커서가 빠지지 않게
    root.addEventListener("mousedown", (e) => { if (e.target.closest("button")) e.preventDefault(); });
    q(".go").addEventListener("click", put);
    ui.prev.addEventListener("click", () => { state.i = Math.max(0, state.i - 1); render(); });
    ui.next.addEventListener("click", () => { state.i = Math.min(state.students.length - 1, state.i + 1); render(); });
    q(".x").addEventListener("click", () => { host.remove(); host = null; state = null; });
    q(".copy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(state.students[state.i].content); render("복사했어요 · 입력칸에 붙여넣기", "ok"); }
      catch { render("복사하지 못했어요", "bad"); }
    });
    document.documentElement.appendChild(host);
  }

  window.__schsNeisPanel = function (p) {
    state = { students: p.students, maxBytes: p.maxBytes, mode: p.mode, i: 0, done: new Set() };
    if (!host || !document.contains(host)) build();
    render();
    return { ok: true, count: p.students.length };
  };
})();
