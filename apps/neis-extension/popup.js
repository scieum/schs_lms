// 팝업: 앱에서 복사한 자료 붙여넣기(또는 파일) → 반·방식 고르기 → 한 번에 채우기 / 한 명씩 넣기
const TTL_MS = 30 * 60 * 1000; // 학생 자료는 30분만 둔다
const $ = (id) => document.getElementById(id);

function neisBytes(text) {
  let n = 0;
  for (const ch of String(text).replace(/\r\n/g, "\n")) {
    n += /[\u1100-\u11FF\u2E80-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF]/.test(ch) ? 3 : 1;
  }
  return n;
}

let data = null;

async function loadSaved() {
  const { schsData, schsLoadedAt } = await chrome.storage.session.get(["schsData", "schsLoadedAt"]);
  if (schsData && Date.now() - schsLoadedAt < TTL_MS) return schsData;
  await chrome.storage.session.remove(["schsData", "schsLoadedAt"]);
  return null;
}

async function loadSettings() {
  const s = await chrome.storage.local.get(["rowSelector", "fieldSelector", "checkName", "mainWorld", "order"]);
  $("order").checked = s.order !== false;
  $("rowSelector").value = s.rowSelector || "";
  $("fieldSelector").value = s.fieldSelector || "";
  $("checkName").checked = s.checkName !== false;
  $("mainWorld").checked = !!s.mainWorld;
}

function saveSettings() {
  chrome.storage.local.set({
    rowSelector: $("rowSelector").value.trim(),
    fieldSelector: $("fieldSelector").value.trim(),
    checkName: $("checkName").checked,
    mainWorld: $("mainWorld").checked,
    order: $("order").checked,
  });
}

// 동아리는 여러 반이 섞인 한 화면이라 반을 고르지 않는다
const byClass = () => data.kind !== "창체-동아리";

function currentStudents() {
  const cls = Number($("classNo").value);
  const list = byClass() ? data.students.filter((s) => s.classNo === cls) : [...data.students];
  return list.sort((a, b) => a.grade - b.grade || a.classNo - b.classNo || a.number - b.number);
}

// 학번 (학년 1자리 + 반 2자리 + 번호 2자리, 예: 20314) — 동아리처럼 여러 학년·반이 섞일 때 쓴다
const studentNo = (s) => `${s.grade}${String(s.classNo).padStart(2, "0")}${String(s.number).padStart(2, "0")}`;
const noOf = (s) => (byClass() ? String(s.number) : studentNo(s));
// 결과 표시: 한 반이면 '3번', 여러 반이면 학번 (fill.js 는 '학년-반-번호' 로 돌려준다)
const label = (keys) => keys.map((k) => {
  const [g, c, n] = k.split("-").map(Number);
  const s = data.students.find((x) => x.grade === g && x.classNo === c && x.number === n);
  return s ? noOf(s) : k;
}).join(", ");
const mode = () => document.querySelector("input[name=mode]:checked").value;
const maxBytes = () => Number($("maxBytes").value) || data.maxBytes;

function renderList() {
  const max = maxBytes();
  const list = currentStudents();
  $("count").textContent = `${list.length}명`;
  $("list").replaceChildren(
    ...list.map((s) => {
      const li = document.createElement("li");
      const b = neisBytes(s.content);
      if (b > max) li.className = "over";
      li.innerHTML = `<span class="n"></span><span class="name"></span><span class="b"></span>`;
      li.querySelector(".n").textContent = noOf(s);
      li.querySelector(".name").textContent = s.name;
      li.querySelector(".b").textContent = `${b.toLocaleString()}B`;
      return li;
    }),
  );
}

function render() {
  $("load").hidden = !!data;
  $("data").hidden = !data;
  $("clear").hidden = !data;
  $("ver").hidden = !!data;
  if (!data) return;
  $("subject").textContent = data.subject;
  $("kind").textContent = data.kind.replace(/^창체-/, "");
  $("meta").textContent = [byClass() ? `${data.grade}학년${data.semester ? ` ${data.semester}학기` : ""}` : null, data.section, `확정 ${data.students.length}명`].filter(Boolean).join(" · ");
  const classes = [...new Set(data.students.map((s) => s.classNo))].sort((a, b) => a - b);
  $("classNo").replaceChildren(...classes.map((c) => new Option(`${c}반`, String(c))));
  $("classField").hidden = !byClass();
  $("maxBytes").value = data.maxBytes;
  renderList();
}

function showError(el, msg) {
  el.innerHTML = `<span class="bad"></span>`;
  el.firstChild.textContent = msg;
}

async function useText(text) {
  try {
    const json = JSON.parse(text);
    if (json.format !== "schs-neis/1" || !Array.isArray(json.students)) throw new Error("학생관리시스템에서 복사한 자료가 아니에요");
    data = json;
    await chrome.storage.session.set({ schsData: data, schsLoadedAt: Date.now() });
    $("loadMsg").textContent = "";
    render();
  } catch (err) {
    showError($("loadMsg"), err instanceof SyntaxError ? "학생관리시스템 › 나이스 입력에서 '복사'를 먼저 눌러 주세요" : err.message);
  }
}

// 붙여넣기: 앱 '나이스 입력'에서 복사한 자료를 바로 읽는다 (파일 저장 없이)
$("paste").addEventListener("click", async () => {
  try {
    await useText(await navigator.clipboard.readText());
  } catch {
    showError($("loadMsg"), "복사한 자료를 읽지 못했어요. 파일 불러오기를 써 주세요");
  }
});

$("file").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (f) await useText(await f.text());
});

$("clear").addEventListener("click", async () => {
  data = null;
  await chrome.storage.session.remove(["schsData", "schsLoadedAt"]);
  $("result").textContent = "";
  render();
});

$("classNo").addEventListener("change", renderList);
$("maxBytes").addEventListener("input", renderList);
for (const id of ["rowSelector", "fieldSelector", "checkName", "mainWorld", "order"]) $(id).addEventListener("change", saveSettings);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("열린 탭을 찾지 못했어요");
  return tab;
}

// 한 번에 채우기: 화면의 학생 줄을 찾아 모두 채운다
$("fill").addEventListener("click", async () => {
  const btn = $("fill");
  const out = $("result");
  btn.disabled = true;
  out.textContent = "";
  try {
    const tab = await activeTab();
    const world = $("mainWorld").checked ? "MAIN" : "ISOLATED";
    const payload = {
      students: currentStudents(),
      mode: mode(),
      maxBytes: maxBytes(),
      rowSelector: $("rowSelector").value.trim(),
      fieldSelector: $("fieldSelector").value.trim(),
      checkName: $("checkName").checked,
      order: $("order").checked,
    };
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["fill.js"], world });
    const [{ result: r }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world,
      func: (p) => window.__schsNeisFill(p),
      args: [payload],
    });
    const n = payload.students.length;
    const parts = [`<span class="ok">${r.ordered ? "순서대로 " : ""}${r.filled.length}명 채움</span>`];
    if (r.ordered) parts.push(`<span class="warn">${r.fieldsSeen === n ? "이름을 확인해 주세요" : `칸 ${r.fieldsSeen}개 · 학생 ${n}명, 이름을 확인해 주세요`}</span>`);
    if (r.overLimit.length) parts.push(`<span class="bad">바이트 초과 ${label(r.overLimit)}번</span>`);
    if (r.nameMismatch.length) parts.push(`<span class="warn">이름 불일치 ${label(r.nameMismatch)}번</span>`);
    if (r.notFound.length) parts.push(`<span class="warn">화면에 없음 ${label(r.notFound)}번</span>`);
    parts.push(`<span class="warn">저장은 직접</span>`);
    if (!r.filled.length) parts.push(`<span class="bad">칸을 못 찾았으면 '한 명씩 넣기'를 써 주세요</span>`);
    out.innerHTML = parts.join(" · ");
  } catch (err) {
    showError(out, err.message || "채우지 못했어요");
  } finally {
    btn.disabled = false;
  }
});

// 한 명씩 넣기: 화면 구조를 몰라도 된다. 나이스 화면에 작은 패널을 띄우고 팝업은 닫는다
$("step").addEventListener("click", async () => {
  try {
    const tab = await activeTab();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["fill.js", "panel.js"] });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (p) => window.__schsNeisPanel(p),
      args: [{ students: currentStudents(), maxBytes: maxBytes(), mode: mode() }],
    });
    window.close();
  } catch (err) {
    showError($("result"), err.message || "패널을 띄우지 못했어요");
  }
});

(async () => {
  await loadSettings();
  data = await loadSaved();
  render();
})();
