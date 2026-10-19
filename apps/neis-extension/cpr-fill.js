// 나이스(eXbuilder6) 그리드에 바로 넣기 (v0.2.6): 화면의 칸을 누르지 않고 그리드 데이터에 학생별 값을 넣는다.
// 2026-10-19 실제 나이스 동아리 화면에서 확인한 구조: cpr.core.Platform.INSTANCE → 실행 중인 앱 → 그리드(grdMain) →
// dataSet 열 stuFlnm(성명) · speclActSpablMteCn(특기사항) · length(바이트). setCellValue 로 넣으면 나이스가 직접 고친 것처럼 '수정됨'이 된다.
// 페이지 환경(MAIN world)에서만 돌아간다 (북마클릿은 그대로, 확장은 world: "MAIN" 으로 넣는다). 저장 버튼은 누르지 않는다.
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

  window.__schsCprFill = function (p) {
    const pick = pickGrid(p.students);
    if (!pick) return null; // eXbuilder 그리드가 아니면 화면 방식으로
    const { g, nameCol, textCol, cols } = pick;
    const ds = g.dataSet;
    const n = ds.getRowCount();
    const report = { filled: [], overLimit: [], nameMismatch: [], notFound: [], ordered: false, fieldsSeen: n, via: "grid", column: textCol };
    const used = new Set();
    for (const s of p.students) {
      // 성명이 같은 줄 (같은 이름이 여럿이면 번호·반이 같은 값이 있는 줄)
      let rows = [];
      for (let i = 0; i < n; i++) if (!used.has(i) && norm(ds.getValue(i, nameCol)) === norm(s.name)) rows.push(i);
      if (rows.length > 1) {
        const narrowed = rows.filter((i) => cols.some((c) => c !== nameCol && String(ds.getValue(i, c)).trim() === String(s.number)));
        if (narrowed.length) rows = narrowed;
      }
      if (rows.length !== 1) { report.notFound.push(keyOf(s)); continue; }
      const i = rows[0];
      used.add(i);
      const before = String(ds.getValue(i, textCol) ?? "");
      const next = p.mode === "append" && before.trim() ? `${before.trimEnd()} ${s.content}` : s.content;
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
})();
