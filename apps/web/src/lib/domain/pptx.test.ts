import { describe, expect, it } from "vitest";
import { isPpt, isPptx, slidesText, slideText, sortSlides } from "./pptx";

describe("PPTX 글 뽑기", () => {
  it("슬라이드는 번호 순, 슬라이드가 아닌 파일은 뺀다", () => {
    expect(sortSlides(["ppt/slides/slide10.xml", "ppt/slides/slide2.xml", "ppt/slides/_rels/slide2.xml.rels", "ppt/notesSlides/notesSlide1.xml", "ppt/slides/slide1.xml"]))
      .toEqual(["ppt/slides/slide1.xml", "ppt/slides/slide2.xml", "ppt/slides/slide10.xml"]);
  });
  it("문단마다 한 줄, 한 문단의 여러 조각은 이어 붙이고 &amp; 를 푼다", () => {
    const xml = `<p:sld><a:p><a:r><a:t>반응 속도</a:t></a:r><a:r><a:t xml:space="preserve"> 실험</a:t></a:r></a:p><a:p><a:r><a:t>농도 &amp; 온도</a:t></a:r></a:p><a:p></a:p></p:sld>`;
    expect(slideText(xml)).toBe("반응 속도 실험\n농도 & 온도");
  });
  it("슬라이드 머리를 붙여 한 글로, 빈 슬라이드는 건너뜀", () => {
    expect(slidesText(["가설", "", "결론"])).toBe("[슬라이드 1]\n가설\n\n[슬라이드 3]\n결론");
    expect(isPptx("발표.PPTX")).toBe(true);
    expect(isPpt("발표.ppt")).toBe(true);
  });
});
