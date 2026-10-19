// 나이스 입력 화면에 학생별 내용을 채운다. 저장 버튼은 절대 누르지 않는다 (교사가 직접 저장).
// 북마클릿(bookmarklet/launcher.js)이 이 파일을 앞에 붙여 쓰고 window.__schsNeisFillAll(payload) 를 부른다.
// 한 명씩 넣기 패널(panel.js)도 여기의 함수(window.__schsNeis)를 같이 쓴다.
(() => {
  // 나이스 바이트: 한글(·한자) 3, 영어·숫자·기호·공백 1, 엔터 1 (웹 lib/domain/length.ts 와 같다)
  function neisBytes(text) {
    let n = 0;
    for (const ch of String(text).replace(/\r\n/g, "\n")) {
      n += /[\u1100-\u11FF\u2E80-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF]/.test(ch) ? 3 : 1;
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

  const keyOf = (s) => `${s.grade}-${s.classNo}-${s.number}`;

  /** 채울 때 만든 값: 덮어쓰기 = 확정본, 이어쓰기 = 이전 글 + " " + 확정본 (대조의 기대값도 이 값) */
  const nextValue = (before, content, mode) => (mode === "append" && String(before || "").trim() ? `${String(before).trimEnd()} ${content}` : content);

  /**
   * 대조 (v0.2.8, 순수 함수): 기대값(want)과 나이스 칸 값(got)을 견준다. 줄바꿈(\r\n→\n)과 끝 공백은 무시.
   * 다르면 앞에서부터 같은 글자까지를 "…" + 끝 18자로 줄여 보이고, 그 뒤 다른 부분과 바이트 차를 돌려준다.
   * kind: "cut" = 나이스 쪽이 앞부분만 있음(덜 들어감) · "edited" = 나이스 쪽이 더 길거나 가운데가 다름(나이스에서 고친 글)
   */
  function compareText(want, got) {
    const clean = (t) => String(t ?? "").replace(/\r\n?/g, "\n").replace(/\s+$/, "");
    const a = clean(want);
    const b = clean(got);
    const wantBytes = neisBytes(a);
    const gotBytes = neisBytes(b);
    if (a === b) return { status: "same", wantBytes, neisBytes: gotBytes };
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    const head = a.slice(0, p);
    const prefix = head.length > 18 ? `…${head.slice(-18)}` : head;
    const wantPart = a.slice(p);
    const gotPart = b.slice(p);
    const kind = gotPart === "" ? "cut" : "edited";
    return { status: "diff", kind, prefix, wantPart, gotPart, firstDiff: p, missingBytes: neisBytes(wantPart), byteDiff: wantBytes - gotBytes, wantBytes, neisBytes: gotBytes };
  }

  window.__schsNeis = { neisBytes, isEditable, typeInto, getValue, matchRow, keyOf, norm, nextValue, compareText, findText: (doc, t) => findText(doc, t) };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const centerY = (r) => r.top + r.height / 2;
  const overlapY = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);

  /** 화면에 이 글자 그대로 보이는 요소들 (학생 이름 칸) */
  function findText(doc, text) {
    const out = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (norm(n.textContent) === text && n.parentElement && n.parentElement.getClientRects().length) out.push(n.parentElement);
    }
    return out;
  }

  /** 입력칸 열 위치: 이미 있는 입력칸, 없으면 '특기사항·세부능력·종합의견·내용' 머리글 */
  function editorColumnX(doc, fields) {
    const f = fields.find((el) => el.getClientRects().length);
    if (f) { const r = f.getBoundingClientRect(); return r.left + r.width / 2; }
    for (const el of doc.querySelectorAll("th, td, [role=columnheader], div, span")) {
      if (el.children.length > 2) continue;
      const t = norm(el.innerText);
      if (/^(특기사항|세부능력\s?및\s?특기사항|행동특성\s?및\s?종합의견|특기\s?사항|내용)$/.test(t)) { const r = el.getBoundingClientRect(); if (r.width) return r.left + r.width / 2; }
    }
    return null;
  }

  /** 그 높이(학생 줄)에 있는 입력칸 */
  function editorInBand(doc, band, fieldSel) {
    const cands = [...doc.querySelectorAll(fieldSel)].filter((el) => isEditable(el) && el.getClientRects().length && overlapY(el.getBoundingClientRect(), band) > band.height * 0.4);
    if (cands.length) return cands.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    const a = doc.activeElement;
    return a && isEditable(a) ? a : null;
  }

  /** 마우스로 누른 것처럼 (그리드가 입력칸을 연다) */
  function press(el, x, y) {
    const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: el.ownerDocument.defaultView };
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const E = t.startsWith("pointer") && el.ownerDocument.defaultView.PointerEvent ? el.ownerDocument.defaultView.PointerEvent : el.ownerDocument.defaultView.MouseEvent;
      el.dispatchEvent(new E(t, o));
    }
    el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent("dblclick", o));
  }

  /**
   * 한 번에 모두 넣기 (v0.2.5): 학생마다 입력칸이 늘 있는 표는 바로 채우고,
   * 누르면 입력칸이 열리는 그리드(나이스)는 그 학생 줄의 특기사항 칸을 눌러 열고 넣은 뒤 다음 학생으로 넘어간다.
   * 이름 표와 입력칸 표가 따로 그려져도 같은 높이로 찾는다. 저장 버튼은 누르지 않는다.
   */
  window.__schsNeisFillAll = async function (p) {
    const doc = p.doc || document;
    const fieldSel = p.fieldSelector || "textarea, [contenteditable=true]";
    const report = window.__schsNeisFill({ ...p, order: false });
    const done = new Set([...report.filled, ...report.overLimit, ...report.nameMismatch]);
    const fields = [...doc.querySelectorAll(fieldSel)].filter((el) => !el.disabled && !el.readOnly);
    const rest = p.students.filter((s) => !done.has(keyOf(s)));
    for (const s of rest) {
      // 이름 칸 (같은 이름이 여럿이면 같은 줄의 번호로 가른다)
      let names = findText(doc, s.name);
      if (names.length > 1) {
        names = names.filter((el) => {
          const band = el.getBoundingClientRect();
          return [...doc.querySelectorAll("td, [role=gridcell], div, span")].some((c) => norm(c.innerText) === String(s.number) && overlapY(c.getBoundingClientRect(), band) > 0);
        });
      }
      const nameEl = names[0];
      if (!nameEl) continue;
      nameEl.scrollIntoView({ block: "center" });
      await sleep(60);
      const rowEl = nameEl.closest(p.rowSelector || "tr, [role=row]") || nameEl;
      const band = rowEl.getBoundingClientRect();
      let el = editorInBand(doc, band, fieldSel);
      if (!el || !overlapY(el.getBoundingClientRect(), band)) {
        const x = editorColumnX(doc, fields);
        if (x == null) continue;
        const y = centerY(band);
        const target = doc.elementFromPoint(x, y);
        if (!target) continue;
        press(target, x, y);
        await sleep(180);
        el = editorInBand(doc, band, fieldSel);
      }
      if (!el) continue;
      const before = getValue(el);
      const next = nextValue(before, s.content, p.mode);
      done.add(keyOf(s));
      report.expected[keyOf(s)] = next;
      if (neisBytes(next) > p.maxBytes) { report.overLimit.push(keyOf(s)); continue; }
      typeInto(el, next);
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.style.outline = "2px solid #536DFE";
      el.blur();
      el.dispatchEvent(new Event("blur", { bubbles: true }));
      await sleep(120);
      report.filled.push(keyOf(s));
    }
    report.notFound = p.students.filter((s) => !done.has(keyOf(s))).map(keyOf);
    // 이름을 하나도 못 찾았으면 예전처럼 순서대로 넣기 (설정에서 켠 경우)
    if (!report.filled.length && !report.overLimit.length && !report.nameMismatch.length && p.order !== false) return window.__schsNeisFill(p);
    return report;
  };

  window.__schsNeisFill = function (p) {
    const fieldSel = p.fieldSelector || "textarea, [contenteditable=true]";
    const rowSel = p.rowSelector || "tr, [role=row]";
    // p.doc: 같은 출처의 프레임 안 화면도 채울 때 넘긴다
    const fields = [...(p.doc || document).querySelectorAll(fieldSel)].filter((el) => !el.disabled && !el.readOnly);
    const report = { filled: [], overLimit: [], nameMismatch: [], notFound: [], rowsWithoutStudent: 0, fieldsSeen: fields.length, ordered: false, expected: {} };
    const done = new Set();

    for (const el of fields) {
      // 줄(tr·row) 안에 있는 칸만: 화면 전체에 떠 있는 그리드 편집칸은 아래 위치 찾기가 맡는다 (엉뚱한 학생에게 들어가지 않게)
      const row = el.closest(rowSel);
      if (!row) { report.rowsWithoutStudent++; continue; }
      const { s, mismatch } = matchRow(row, p.students, p.checkName);
      if (mismatch) { report.nameMismatch.push(keyOf(mismatch)); done.add(keyOf(mismatch)); continue; }
      if (!s) { report.rowsWithoutStudent++; continue; }
      const before = getValue(el);
      const next = nextValue(before, s.content, p.mode);
      done.add(keyOf(s));
      report.expected[keyOf(s)] = next;
      if (neisBytes(next) > p.maxBytes) { report.overLimit.push(keyOf(s)); continue; }
      setValue(el, next);
      el.style.outline = "2px solid #536DFE";
      el.style.outlineOffset = "1px";
      report.filled.push(keyOf(s));
    }
    // 순서대로 넣기: 줄에서 이름을 하나도 못 찾았으면(나이스 그리드가 이름과 입력칸을 따로 그리는 경우)
    // 화면에 보이는 입력칸에 확정 학생을 위에서부터 차례로 넣는다. 결과에 '순서대로'를 알려 이름을 확인하게 한다
    if (p.order !== false && !report.filled.length && !report.nameMismatch.length && !report.overLimit.length) {
      const visible = fields.filter((el) => el.offsetParent !== null || el.getClientRects().length);
      report.ordered = true;
      report.fieldsSeen = visible.length;
      p.students.forEach((s, i) => {
        const el = visible[i];
        if (!el) return;
        const before = getValue(el);
        const next = nextValue(before, s.content, p.mode);
        done.add(keyOf(s));
        report.expected[keyOf(s)] = next;
        if (neisBytes(next) > p.maxBytes) { report.overLimit.push(keyOf(s)); return; }
        setValue(el, next);
        el.style.outline = "2px solid #536DFE";
        el.style.outlineOffset = "1px";
        report.filled.push(keyOf(s));
      });
    }
    report.notFound = p.students.filter((s) => !done.has(keyOf(s))).map(keyOf);
    return report;
  };
  /**
   * 대조용 읽기 (v0.2.8): 화면 칸 방식. 학생 줄의 입력칸(textarea.value)이나 특기사항 칸 글자를 읽기만 한다.
   * 누르지도 고치지도 않고, 읽은 값은 어디로도 보내지 않는다. 기대값(p.expected[key])과 compareText 로 견준다.
   * 못 찾으면 notFound. 결과 키를 찾은 칸(els)은 다름 표시(빨강 테두리)에 쓴다.
   */
  window.__schsNeisRead = function (p) {
    const doc = p.doc || document;
    const fieldSel = p.fieldSelector || "textarea, [contenteditable=true]";
    const rowSel = p.rowSelector || "tr, [role=row]";
    const fields = [...doc.querySelectorAll(fieldSel)].filter((el) => el.getClientRects().length);
    const found = {};
    for (const el of fields) {
      const row = el.closest(rowSel);
      if (!row) continue;
      const { s } = matchRow(row, p.students, true);
      if (s && !found[keyOf(s)]) found[keyOf(s)] = { value: getValue(el), el };
    }
    for (const s of p.students) {
      if (found[keyOf(s)]) continue;
      let names = findText(doc, s.name);
      if (names.length > 1) {
        names = names.filter((el) => {
          const band = el.getBoundingClientRect();
          return [...doc.querySelectorAll("td, [role=gridcell], div, span")].some((c) => norm(c.innerText) === String(s.number) && overlapY(c.getBoundingClientRect(), band) > 0);
        });
      }
      const nameEl = names[0];
      if (!nameEl) continue;
      const rowEl = nameEl.closest(rowSel) || nameEl;
      const band = rowEl.getBoundingClientRect();
      const ed = fields.filter((el) => isEditable(el) && overlapY(el.getBoundingClientRect(), band) > band.height * 0.4).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
      if (ed) { found[keyOf(s)] = { value: getValue(ed), el: ed }; continue; }
      // 누르면 열리는 그리드: 그 줄 높이의 특기사항 칸 글자를 읽는다 (칸을 누르지 않는다)
      const x = editorColumnX(doc, fields);
      if (x == null) continue;
      const hit = doc.elementFromPoint(x, centerY(band));
      const cell = hit && (hit.closest("td, [role=gridcell]") || hit);
      if (cell && !cell.contains(nameEl) && overlapY(cell.getBoundingClientRect(), band) > 0) found[keyOf(s)] = { value: cell.innerText || "", el: cell };
    }
    const results = [];
    const els = {};
    for (const s of p.students) {
      const k = keyOf(s);
      const f = found[k];
      if (!f) { results.push({ key: k, status: "notFound" }); continue; }
      els[k] = f.el;
      results.push({ key: k, ...compareText(p.expected[k] ?? s.content, f.value) });
    }
    return { via: "screen", results, els };
  };
})();
