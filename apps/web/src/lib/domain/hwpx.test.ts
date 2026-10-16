import { describe, expect, it } from "vitest";
import { hwpxSectionText, isHwp, isHwpx, sortSections } from "./hwpx";

const xml = `<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="s" xmlns:hp="p">
<hp:p id="1"><hp:run charPrIDRef="0"><hp:t>2026학년도 과학 탐구 발표 운영 계획(안)</hp:t></hp:run></hp:p>
<hp:p id="2"><hp:run><hp:t>1. 기간: 2026. 10. 14. ~ 10. 21.</hp:t></hp:run><hp:run><hp:t> &amp; 대상 2학년</hp:t></hp:run></hp:p>
<hp:p id="3"><hp:run><hp:tbl><hp:tr>
<hp:tc><hp:subList><hp:p><hp:run><hp:t>구분</hp:t></hp:run></hp:p></hp:subList></hp:tc>
<hp:tc><hp:subList><hp:p><hp:run><hp:t>내용</hp:t></hp:run></hp:p></hp:subList></hp:tc>
</hp:tr><hp:tr>
<hp:tc><hp:subList><hp:p><hp:run><hp:t>주제</hp:t></hp:run></hp:p></hp:subList></hp:tc>
<hp:tc><hp:subList><hp:p><hp:run><hp:t>생활 속 과학 현상</hp:t></hp:run></hp:p><hp:p><hp:run><hp:t>모둠별 실험</hp:t></hp:run></hp:p></hp:subList></hp:tc>
</hp:tr></hp:tbl></hp:run></hp:p>
<hp:p id="4"><hp:run><hp:t/></hp:run></hp:p>
<hp:p id="5"><hp:run><hp:t>끝.</hp:t></hp:run></hp:p>
</hs:sec>`;

describe("HWPX 글 뽑기 (hwpx 스킬 text_extract 방식)", () => {
  it("문단은 줄마다, 표 칸은 | 로, 엔티티는 풀어서", () => {
    const t = hwpxSectionText(xml).split("\n");
    expect(t[0]).toBe("2026학년도 과학 탐구 발표 운영 계획(안)");
    expect(t[1]).toBe("1. 기간: 2026. 10. 14. ~ 10. 21. & 대상 2학년");
    expect(t).toContain("구분 | 내용");
    expect(t.some((l) => l.startsWith("주제 | 생활 속 과학 현상") && l.includes("모둠별 실험"))).toBe(true);
    expect(t.at(-1)).toBe("끝.");
  });
  it("파일 종류와 section 순서", () => {
    expect(isHwpx("계획서.HWPX")).toBe(true);
    expect(isHwp("기안문.hwp")).toBe(true);
    expect(isHwp("기안문.hwpx")).toBe(false);
    expect(sortSections(["Contents/section10.xml", "Contents/header.xml", "Contents/section2.xml", "Contents/section0.xml"]))
      .toEqual(["Contents/section0.xml", "Contents/section2.xml", "Contents/section10.xml"]);
  });
});
