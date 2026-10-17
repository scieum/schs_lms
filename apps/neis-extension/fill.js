// 나이스 입력 화면에 학생별 내용을 채운다. 저장 버튼은 절대 누르지 않는다 (교사가 직접 저장).
// 팝업이 chrome.scripting 으로 이 파일을 넣은 뒤 window.__schsNeisFill(payload) 를 부른다.
// 한 명씩 넣기 패널(panel.js)도 여기의 함수(window.__schsNeis)를 같이 쓴다.
(() => {
  // 나이스 바이트: 한글 등 3, 영문·숫자·공백·기호 1, 줄바꿈 2 (웹 lib/domain/length.ts 와 같다)
  function neisBytes(text) {
    let n = 0;
    for (const ch of String(text).replace(/\r\n/g, "\n")) {
      if (ch === "\n") n += 2;
      else n += ch.charCodeAt(0) <= 0x7f ? 1 : 3;
    }
    return n;
  }

  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const isEditable = (el) => !!el && !el.disabled && !el.readOnly && (el.tagName === "TEXTAREA" || el.isContentEditable || (el.tagName === "INPUT" && /^(text|search|)$/i.test(el.type)));

  // 프레임워크(React·그리드)가 알아채도록 원래 setter 로 값을 넣고 이벤트를 보낸다
  function setValue(el, value) {
    if (el.isContentEditable) {
      el.focus();
      el.textContent = value;
    } else {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;
    }
    for (const type of ["input", "change"]) el.dispatchEvent(new Event(type, { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " " }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  /** 커서가 있는 칸에 사람이 친 것처럼 넣는다 (그리드 편집기도 알아챈다). 안 되면 setValue */
  function typeInto(el, value) {
    el.focus();
    if (el.isContentEditable) {
      const r = document.createRange();
      r.selectNodeContents(el);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    } else {
      el.select();
    }
    const ok = document.execCommand && document.execCommand("insertText", false, value);
    if (!ok || getValue(el) !== value) setValue(el, value);
  }

  const getValue = (el) => (el.isContentEditable ? el.textContent : el.value) || "";

  /** 줄 안의 숫자만 있는 칸들 (학년·반·번호 순일 수 있다) */
  function numberCells(row) {
    const out = [];
    for (const c of row.querySelectorAll("td, th, [role=gridcell], [role=cell]")) {
      const t = norm(c.innerText);
      if (/^\d{1,2}$/.test(t)) out.push(Number(t));
    }
    if (!out.length) for (const m of norm(row.innerText).matchAll(/(?:^|\s)(\d{1,2})(?=\s|$)/g)) out.push(Number(m[1]));
    return out;
  }

  /**
   * 이 줄의 학생 찾기. 이름이 맞는 학생을 먼저 찾고, 같은 이름이 여럿이면 번호(·반)로 가른다.
   * 이름 확인을 끄면 번호만 본다 (한 반짜리 화면에서만).
   * @returns {{ s: object|null, mismatch: object|null }}
   */
  function matchRow(row, students, checkName) {
    const text = norm(row.innerText);
    const nums = numberCells(row);
    const byName = students.filter((s) => s.name && text.includes(s.name));
    if (byName.length === 1) return { s: byName[0], mismatch: null };
    if (byName.length > 1) {
      const narrowed = byName.filter((s) => nums.includes(s.number) && (nums.length < 2 || nums.includes(s.classNo)));
      return { s: narrowed.length === 1 ? narrowed[0] : null, mismatch: null };
    }
    const num = nums.length ? nums[nums.length - 1] : null;
    const byNum = num == null ? [] : students.filter((s) => s.number === num);
    if (byNum.length !== 1) return { s: null, mismatch: null };
    if (checkName !== false && byNum[0].name) return { s: null, mismatch: byNum[0] };
    return { s: byNum[0], mismatch: null };
  }

  const keyOf = (s) => `${s.classNo}-${s.number}`;

  window.__schsNeis = { neisBytes, isEditable, typeInto, getValue, matchRow, keyOf, norm };

  window.__schsNeisFill = function (p) {
    const fieldSel = p.fieldSelector || "textarea, [contenteditable=true]";
    const rowSel = p.rowSelector || "tr, [role=row]";
    const fields = [...document.querySelectorAll(fieldSel)].filter((el) => !el.disabled && !el.readOnly);
    const report = { filled: [], overLimit: [], nameMismatch: [], notFound: [], rowsWithoutStudent: 0, fieldsSeen: fields.length };
    const done = new Set();

    for (const el of fields) {
      const row = el.closest(rowSel) || el.parentElement;
      if (!row) continue;
      const { s, mismatch } = matchRow(row, p.students, p.checkName);
      if (mismatch) { report.nameMismatch.push(keyOf(mismatch)); done.add(keyOf(mismatch)); continue; }
      if (!s) { report.rowsWithoutStudent++; continue; }
      const before = getValue(el);
      const next = p.mode === "append" && before.trim() ? `${before.trimEnd()} ${s.content}` : s.content;
      done.add(keyOf(s));
      if (neisBytes(next) > p.maxBytes) { report.overLimit.push(keyOf(s)); continue; }
      setValue(el, next);
      el.style.outline = "2px solid #536DFE";
      el.style.outlineOffset = "1px";
      report.filled.push(keyOf(s));
    }
    report.notFound = p.students.filter((s) => !done.has(keyOf(s))).map(keyOf);
    return report;
  };
})();
