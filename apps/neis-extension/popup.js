// 팝업: 내보낸 파일 불러오기 → 반·방식·최대 바이트 고르기 → 열어 둔 나이스 화면에 채우기
const TTL_MS = 30 * 60 * 1000; // 학생 자료는 30분만 둔다
const $ = (id) => document.getElementById(id);

function neisBytes(text) {
  let n = 0;
  for (const ch of String(text).replace(/\r\n/g, "\n")) {
    if (ch === "\n") n += 2;
    else n += ch.charCodeAt(0) <= 0x7f ? 1 : 3;
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
  const s = await chrome.storage.local.get(["rowSelector", "fieldSelector", "checkName", "mainWorld"]);
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
  });
}

function currentStudents() {
  const cls = Number($("classNo").value);
  return data.students.filter((s) => s.classNo === cls).sort((a, b) => a.number - b.number);
}

function renderList() {
  const max = Number($("maxBytes").value) || data.maxBytes;
  const list = $("list");
  list.replaceChildren(
    ...currentStudents().map((s) => {
      const li = document.createElement("li");
      const b = neisBytes(s.content);
      if (b > max) li.className = "over";
      li.innerHTML = `<span class="n"></span><span class="name"></span><span class="b"></span>`;
      li.querySelector(".n").textContent = s.number;
      li.querySelector(".name").textContent = s.name;
      li.querySelector(".b").textContent = `${b.toLocaleString()}B`;
      return li;
    }),
  );
}

function render() {
  $("load").hidden = !!data;
  $("data").hidden = !data;
  if (!data) return;
  $("subject").textContent = `${data.subject} · ${data.grade}학년 ${data.semester}학기`;
  $("meta").textContent = `${data.kind} · 확정 ${data.students.length}명 · ${new Date(data.exportedAt).toLocaleString("ko-KR")} 내보냄`;
  const classes = [...new Set(data.students.map((s) => s.classNo))].sort((a, b) => a - b);
  $("classNo").replaceChildren(...classes.map((c) => new Option(`${c}반`, String(c))));
  $("maxBytes").value = data.maxBytes;
  renderList();
}

$("file").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const json = JSON.parse(await f.text());
    if (json.format !== "schs-neis/1" || !Array.isArray(json.students)) throw new Error("학생관리시스템에서 내보낸 파일이 아니에요");
    data = json;
    await chrome.storage.session.set({ schsData: data, schsLoadedAt: Date.now() });
    render();
  } catch (err) {
    $("load").querySelector(".hint").textContent = err.message || "파일을 읽지 못했어요";
  }
});

$("clear").addEventListener("click", async () => {
  data = null;
  await chrome.storage.session.remove(["schsData", "schsLoadedAt"]);
  $("result").textContent = "";
  render();
});

$("classNo").addEventListener("change", renderList);
$("maxBytes").addEventListener("input", renderList);
for (const id of ["rowSelector", "fieldSelector", "checkName", "mainWorld"]) $(id).addEventListener("change", saveSettings);

$("fill").addEventListener("click", async () => {
  const btn = $("fill");
  const out = $("result");
  btn.disabled = true;
  out.textContent = "채우는 중…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("열린 탭을 찾지 못했어요");
    const world = $("mainWorld").checked ? "MAIN" : "ISOLATED";
    const payload = {
      students: currentStudents(),
      mode: document.querySelector("input[name=mode]:checked").value,
      maxBytes: Number($("maxBytes").value) || data.maxBytes,
      rowSelector: $("rowSelector").value.trim(),
      fieldSelector: $("fieldSelector").value.trim(),
      checkName: $("checkName").checked,
    };
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["fill.js"], world });
    const [{ result: r }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world,
      func: (p) => window.__schsNeisFill(p),
      args: [payload],
    });
    const parts = [`<span class="ok">${r.filled.length}명 채움</span>`];
    if (r.overLimit.length) parts.push(`<span class="bad">바이트 초과 ${r.overLimit.join(", ")}번</span>`);
    if (r.nameMismatch.length) parts.push(`<span class="warn">이름 불일치 ${r.nameMismatch.join(", ")}번</span>`);
    if (r.notFound.length) parts.push(`<span class="warn">화면에 없음 ${r.notFound.join(", ")}번</span>`);
    if (r.fieldsSeen === 0) parts.push(`<span class="bad">입력칸을 못 찾았어요. 아래 '화면 찾기 설정'을 확인해 주세요</span>`);
    out.innerHTML = parts.join(" · ");
  } catch (err) {
    out.innerHTML = `<span class="bad"></span>`;
    out.firstChild.textContent = err.message || "채우지 못했어요";
  } finally {
    btn.disabled = false;
  }
});

(async () => {
  await loadSettings();
  data = await loadSaved();
  render();
})();
