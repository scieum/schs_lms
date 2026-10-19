// 나이스(eXbuilder6) 그리드에 바로 넣기 (v0.2.6): 화면의 칸을 누르지 않고 그리드 데이터에 학생별 값을 넣는다.
// 2026-10-19 실제 나이스 동아리 화면에서 확인한 구조: cpr.core.Platform.INSTANCE → 실행 중인 앱 → 그리드(grdMain) →
// dataSet 열 stuFlnm(성명) · speclActSpablMteCn(특기사항) · length(바이트). setCellValue 로 넣으면 나이스가 직접 고친 것처럼 '수정됨'이 된다.
// 페이지 환경에서 돌아간다 (북마클릿). 저장 버튼은 누르지 않는다.
(() => {
  const norm = (s) => String(s ?? "").replace(/\s+/g, "").trim();
  const neisBytes = (text) => {
    let n = 0;
    for (const ch of String(text).replace(/\r\n/g, "\n")) n += /[ᄀ-ᇿ⺀-鿿ꥠ-꥿가-퟿豈-﫿]/.test(ch) ? 3 : 1;
    return n;
  };
  const keyOf = (s) => `${s.grade}-${s.classNo}-${s.number}`;
  const NAME_COL = /^(stuFlnm|stuNm|flnm|stuName|studentNm)$/i;
  // 글을 넣을 열: 특기사항·세특·행발 내용 (…Cn). 여러 개면 지금 화면에서 편집칸이 붙은 열 → 이름이 긴 것
  const TEXT_COL = /(Mte|Spabl|Spcl|Specl|Setuk|Bhvr|Opin|Rmrk|Cntn)\w*Cn$|Cn$/;

  function grids() {
    const out = [];
    try {
      const P = window.cpr && window.cpr.core && window.cpr.core.Platform && window.cpr.core.Platform.INSTANCE;
      if (!P) return out;
      for (const app of P.getAllRunningAppInstances()) {
        let kids = [];
        try { kids = app.getContainer().getAllRecursiveChildren(); } catch { continue; }
        for (const c of kids) {
          if (!c || c.type !== "grid" || !c.dataSet || typeof c.dataSet.getColumnNames !== "function") continue;
          try { if (c.getHtmlElement && !c.getHtmlElement().getClientRects().length) continue; } catch { /* 보이는지 몰라도 계속 */ }
          out.push(c);
        }
      }
    } catch { /* 나이스가 아니면 빈 목록 */ }
    return out;
  }

  /** 학생 표: 성명 열과 내용 열이 있는 그리드 */
  function pickGrid(students) {
    let best = null;
    for (const g of grids()) {
      const cols = g.dataSet.getColumnNames();
      const nameCol = cols.find((c) => NAME_COL.test(c));
      const textCols = cols.filter((c) => TEXT_COL.test(c));
      if (!nameCol || !textCols.length) continue;
      const n = g.dataSet.getRowCount();
      const names = new Set(students.map((s) => norm(s.name)));
      let hits = 0;
      for (let i = 0; i < n; i++) if (names.has(norm(g.dataSet.getValue(i, nameCol)))) hits++;
      const prefer = (c) => (/Mte|Spabl|Setuk|Bhvr|Opin/.test(c) ? 1 : 0);
      const textCol = textCols.sort((a, b) => prefer(b) - prefer(a) || b.length - a.length)[0];
      if (!best || hits > best.hits) best = { g, nameCol, textCol, cols, hits };
    }
    return best && best.hits ? best : null;
  }

  /** 성명이 같은 줄 하나 (같은 이름이 여럿이면 번호·반이 같은 값이 있는 줄). 못 찾으면 -1 */
  function rowOf(pick, s, used) {
    const { g, nameCol, cols } = pick;
    const ds = g.dataSet;
    let rows = [];
    for (let i = 0; i < ds.getRowCount(); i++) if (!used.has(i) && norm(ds.getValue(i, nameCol)) === norm(s.name)) rows.push(i);
    if (rows.length > 1) {
      const narrowed = rows.filter((i) => cols.some((c) => c !== nameCol && String(ds.getValue(i, c)).trim() === String(s.number)));
      if (narrowed.length) rows = narrowed;
    }
    return rows.length === 1 ? rows[0] : -1;
  }

  window.__schsCprFill = function (p) {
    const pick = pickGrid(p.students);
    if (!pick) return null; // eXbuilder 그리드가 아니면 화면 방식으로
    const { g, textCol, cols } = pick;
    const ds = g.dataSet;
    const n = ds.getRowCount();
    const report = { filled: [], overLimit: [], nameMismatch: [], notFound: [], ordered: false, fieldsSeen: n, via: "grid", column: textCol, expected: {} };
    const used = new Set();
    for (const s of p.students) {
      const i = rowOf(pick, s, used);
      if (i < 0) { report.notFound.push(keyOf(s)); continue; }
      used.add(i);
      const before = String(ds.getValue(i, textCol) ?? "");
      const next = window.__schsNeis ? window.__schsNeis.nextValue(before, s.content, p.mode) : (p.mode === "append" && before.trim() ? `${before.trimEnd()} ${s.content}` : s.content);
      report.expected[keyOf(s)] = next;
      if (neisBytes(next) > p.maxBytes) { report.overLimit.push(keyOf(s)); continue; }
      try {
        g.setCellValue(i, textCol, next);
      } catch { /* 아래에서 데이터셋으로 */ }
      if (String(ds.getValue(i, textCol) ?? "") !== next) ds.setValue(i, textCol, next);
      // 바이트 열이 있으면 같이 맞춘다 (나이스 화면의 'n / 1500 Byte')
      if (cols.includes("length")) { try { const v = ds.getValue(i, "length"); if (v === "" || v == null || !isNaN(Number(v))) ds.setValue(i, "length", neisBytes(next)); } catch { /* 없으면 그대로 */ } }
      report.filled.push(keyOf(s));
    }
    try { g.redraw && g.redraw(); } catch { /* 다시 그리기 실패는 무시 */ }
    return report;
  };
  /**
   * 대조 (v0.2.8): 채운 뒤 그리드 값을 다시 읽어 기대값(p.expected[key] — 채울 때 만든 값)과 견준다.
   * 읽기만 한다 (setValue·저장 없음). 읽은 값은 창 안에서만 쓰고 어디로도 보내지 않는다.
   * 결과: { via: "grid", results: [{ key, status: "same"|"diff"|"notFound", neisBytes, wantBytes, firstDiff, … }], rows: { key: 줄 번호 } }
   */
  window.__schsCprRead = function (p) {
    const pick = pickGrid(p.students);
    if (!pick) return null;
    const ds = pick.g.dataSet;
    const used = new Set();
    const results = [];
    const rows = {};
    for (const s of p.students) {
      const k = keyOf(s);
      const i = rowOf(pick, s, used);
      if (i < 0) { results.push({ key: k, status: "notFound" }); continue; }
      used.add(i);
      rows[k] = i;
      results.push({ key: k, ...window.__schsNeis.compareText(p.expected[k] ?? s.content, String(ds.getValue(i, pick.textCol) ?? "")) });
    }
    return { via: "grid", results, rows, grid: pick.g, column: pick.textCol };
  };
})();
