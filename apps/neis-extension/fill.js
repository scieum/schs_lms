// 나이스 입력 화면에 학생별 내용을 채운다. 저장 버튼은 절대 누르지 않는다 (교사가 직접 저장).
// 팝업이 chrome.scripting 으로 이 파일을 넣은 뒤 window.__schsNeisFill(payload) 를 부른다.
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

  const getValue = (el) => (el.isContentEditable ? el.textContent : el.value) || "";

  /** 줄 안의 학생 번호: 1~2자리 숫자만 있는 첫 칸 */
  function rowNumber(row) {
    const cells = row.querySelectorAll("td, th, [role=gridcell], [role=cell]");
    for (const c of cells) {
      const t = norm(c.innerText);
      if (/^\d{1,2}$/.test(t)) return Number(t);
    }
    const m = norm(row.innerText).match(/(?:^|\s)(\d{1,2})(?:\s|$)/);
    return m ? Number(m[1]) : null;
  }

  window.__schsNeisFill = function (p) {
    const fieldSel = p.fieldSelector || "textarea, [contenteditable=true]";
    const rowSel = p.rowSelector || "tr, [role=row]";
    const fields = [...document.querySelectorAll(fieldSel)].filter((el) => !el.disabled && !el.readOnly);
    const report = { filled: [], overLimit: [], nameMismatch: [], notFound: [], rowsWithoutStudent: 0, fieldsSeen: fields.length };
    const used = new Set();

    for (const el of fields) {
      const row = el.closest(rowSel) || el.parentElement;
      if (!row) continue;
      const num = rowNumber(row);
      const s = num == null ? null : p.students.find((x) => x.number === num);
      if (!s) { report.rowsWithoutStudent++; continue; }
      if (p.checkName !== false && s.name && !norm(row.innerText).includes(s.name)) {
        report.nameMismatch.push(num);
        continue;
      }
      const before = getValue(el);
      const next = p.mode === "append" && before.trim() ? `${before.trimEnd()} ${s.content}` : s.content;
      if (neisBytes(next) > p.maxBytes) { report.overLimit.push(num); continue; }
      setValue(el, next);
      el.style.outline = "2px solid #536DFE";
      el.style.outlineOffset = "1px";
      report.filled.push(num);
      used.add(num);
    }
    report.notFound = p.students.filter((s) => !used.has(s.number) && !report.overLimit.includes(s.number) && !report.nameMismatch.includes(s.number)).map((s) => s.number);
    return report;
  };
})();
