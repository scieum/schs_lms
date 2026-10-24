"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Download } from "lucide-react";
import { Button, cx } from "@/components/ui";
import {
  STAMP_COLORS, STAMP_DEFAULT_COLOR, STAMP_FONTS, STAMP_MAX_CHARS, STAMP_SHAPES, STAMP_SIZES,
  fitGlyph, normalizeHex, stampCells, stampChars, stampFileName, stampFontsHref, stampOutline,
  type StampFont, type StampShape,
} from "@/lib/domain/stamp";

// 도장 만들기 (Figma N71 a · b): PC = 왼쪽 설정 · 오른쪽 미리보기(같은 높이), 모바일 = 미리보기 → 설정 → 바닥 [PNG 내려받기].

type Opts = { chars: string[]; shape: StampShape; font: StampFont; color: string };

function drawStamp(canvas: HTMLCanvasElement, size: number, o: Opts) {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = o.color;
  ctx.fillStyle = o.color;
  const line = stampOutline(o.shape);
  const lw = line.stroke * size;
  const w = line.w * size - lw, h = line.h * size - lw;
  ctx.lineWidth = lw;
  ctx.beginPath();
  if (o.shape === "사각") ctx.roundRect(size / 2 - w / 2, size / 2 - h / 2, w, h, line.radius * size);
  else ctx.ellipse(size / 2, size / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  // 글자 하나씩: 실제 글자 모양(bbox)을 재서 칸 가운데에 맞추고 칸을 채우게 늘린다
  ctx.font = `${o.font.weight} 100px "${o.font.family}"`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const c of stampCells(o.chars, o.shape)) {
    const m = ctx.measureText(c.char);
    const gw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, gh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const { sx, sy } = fitGlyph({ w: gw, h: gh }, { w: c.w * size, h: c.h * size });
    ctx.save();
    ctx.translate(c.cx * size, c.cy * size);
    ctx.scale(sx, sy);
    ctx.fillText(c.char, -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    ctx.restore();
  }
}

const toBlob = (canvas: HTMLCanvasElement) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));

const CHECKER = { backgroundImage: "conic-gradient(#f2f4f6 25%, #fff 0 50%, #f2f4f6 0 75%, #fff 0)", backgroundSize: "32px 32px" };

function ShapeIcon({ shape, on }: { shape: StampShape; on: boolean }) {
  return <span aria-hidden className={cx("inline-block border-2", on ? "border-key-strong" : "border-mute", shape === "사각" ? "size-3.5 rounded-[3px]" : shape === "타원" ? "h-[17px] w-3 rounded-full" : "size-4 rounded-full")} />;
}

export function StampMaker() {
  const [text, setText] = useState("");
  const [withIn, setWithIn] = useState(false);
  const [shape, setShape] = useState<StampShape>("원형");
  const [fontId, setFontId] = useState(STAMP_FONTS[0].id);
  const [color, setColor] = useState<string>(STAMP_DEFAULT_COLOR);
  const [hexDraft, setHexDraft] = useState(STAMP_DEFAULT_COLOR.slice(1));
  const [size, setSize] = useState<number>(600);
  const [copied, setCopied] = useState("");
  const [tick, setTick] = useState(0);
  const preview = useRef<HTMLCanvasElement>(null);
  const font = STAMP_FONTS.find((f) => f.id === fontId) ?? STAMP_FONTS[0];
  const chars = stampChars(text, withIn);
  const typed = Array.from(text.replace(/\s+/g, "")).length;
  const sample = chars.join("") || "김속초";

  // 글꼴은 이 화면에서만 받는다 (Google Fonts, 한 번)
  useEffect(() => {
    const id = "stamp-fonts";
    const bump = () => setTick((n) => n + 1);
    document.fonts.addEventListener("loadingdone", bump);
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = stampFontsHref();
      link.onload = bump;
      document.head.appendChild(link);
    }
    return () => document.fonts.removeEventListener("loadingdone", bump);
  }, []);

  // 고른 글꼴로 이 글자들이 다 받아진 뒤에 다시 그린다 (한글 글꼴은 글자 묶음별로 나눠 받는다)
  useEffect(() => {
    let live = true;
    const draw = () => { if (live && preview.current) drawStamp(preview.current, 600, { chars, shape, font, color }); };
    draw();
    document.fonts.load(`${font.weight} 100px "${font.family}"`, chars.join("") || "가").then(draw).catch(() => {});
    return () => { live = false; };
    // chars 는 text · withIn 으로 정해진다. tick = 글꼴 파일이 새로 받아짐
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, withIn, shape, fontId, color, tick]);

  const render = async () => {
    await document.fonts.load(`${font.weight} 100px "${font.family}"`, chars.join("")).catch(() => {});
    const c = document.createElement("canvas");
    drawStamp(c, size, { chars, shape, font, color });
    return toBlob(c);
  };
  const download = async () => {
    const blob = await render();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = stampFileName(text, size);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async () => {
    try {
      const blob = await render();
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied("복사했어요");
    } catch {
      setCopied("이 브라우저는 복사가 안 돼요");
    }
    setTimeout(() => setCopied(""), 1800);
  };
  const pickColor = (hex: string) => { setColor(hex); setHexDraft(hex.slice(1)); };
  const custom = !STAMP_COLORS.some((c) => c.hex === color);
  const empty = chars.length === 0;

  const sizeChips = (short: boolean) => (
    <div className="flex items-center gap-1.5">
      <span className="mr-0.5 text-[13px] font-bold text-sub md:text-[14px]">크기</span>
      {STAMP_SIZES.map((s) => (
        <button key={s} type="button" onClick={() => setSize(s)} aria-pressed={size === s}
          className={cx("h-8 whitespace-nowrap rounded-control border px-2.5 text-[13px]", size === s ? "border-key bg-key-soft font-bold text-key-strong" : "border-hair bg-[#fff] font-medium text-sub")}>
          {short ? `${s}px` : `${s === 300 ? "작게" : s === 600 ? "보통" : "크게"} ${s}px`}
        </button>
      ))}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,640px)_minmax(0,1fr)] md:gap-6">
      {/* 미리보기 — 모바일은 맨 위, PC는 오른쪽 */}
      <section className="surface flex flex-col gap-3 rounded-card p-4 md:col-start-2 md:row-start-1 md:gap-5 md:p-7" aria-label="미리보기">
        <div className="hidden items-center justify-between md:flex">
          <h2 className="text-[15px] font-bold">미리보기</h2>
          <span className="text-[12px] text-mute">투명 배경 PNG</span>
        </div>
        <div className="flex aspect-[17/12] items-center justify-center overflow-hidden rounded-inner md:aspect-square" style={CHECKER}>
          <canvas ref={preview} width={600} height={600} className="aspect-square h-[83%] w-auto max-w-full md:h-[64%]" role="img" aria-label={empty ? "도장 테두리" : `${chars.join("")} 도장`} />
        </div>
        <div className="md:hidden">{sizeChips(true)}</div>
        <div className="hidden md:block">{sizeChips(false)}</div>
        <div className="hidden gap-2 md:flex">
          <Button className="h-12 flex-1" onClick={download} disabled={empty}><Download size={18} /> PNG 내려받기</Button>
          <Button kind="outline" className="h-12 font-bold" onClick={copy} disabled={empty}>{copied || "이미지 복사"}</Button>
        </div>
      </section>

      {/* 설정 */}
      <section className="surface flex flex-col gap-6 rounded-card px-4 py-5 md:col-start-1 md:row-start-1 md:gap-7 md:p-7" aria-label="설정">
        <div className="flex flex-col gap-2.5 md:gap-3">
          <div className="flex items-center justify-between">
            <label htmlFor="stamp-text" className="text-[15px] font-bold">새길 글자</label>
            <span className="text-[12px] text-mute">{Math.min(typed, STAMP_MAX_CHARS)} / {STAMP_MAX_CHARS}자</span>
          </div>
          <input id="stamp-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="이름 — 예: 김속초" autoComplete="off"
            className="h-12 rounded-control bg-soft px-4 text-[16px] font-medium outline-none focus:ring-2 focus:ring-key" />
          <label className={cx("flex items-center gap-2 self-start text-[14px] font-medium text-sub", typed >= STAMP_MAX_CHARS && "opacity-40")}>
            <input type="checkbox" checked={withIn} onChange={(e) => setWithIn(e.target.checked)} disabled={typed >= STAMP_MAX_CHARS} className="size-5 accent-key" />
            끝에 ‘인’ 붙이기
          </label>
        </div>

        <div className="flex flex-col gap-2.5 md:gap-3">
          <h3 className="text-[15px] font-bold">모양</h3>
          <div className="flex gap-2">
            {STAMP_SHAPES.map((s) => (
              <button key={s} type="button" onClick={() => setShape(s)} aria-pressed={shape === s}
                className={cx("flex h-11 flex-1 items-center justify-center gap-2 rounded-control border text-[14px] md:w-[120px] md:flex-none", shape === s ? "border-key bg-key-soft font-bold text-key-strong" : "border-hair bg-[#fff] font-medium text-sub")}>
                <ShapeIcon shape={s} on={shape === s} />{s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 md:gap-3">
          <h3 className="text-[15px] font-bold">글꼴</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-2.5">
            {STAMP_FONTS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFontId(f.id)} aria-pressed={fontId === f.id}
                className={cx("flex h-20 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-inner border px-2 md:h-[92px]", fontId === f.id ? "border-2 border-key bg-[#f5f7ff]" : "border-line bg-[#fff] hover:bg-soft")}>
                <span className="max-w-full truncate text-[22px] leading-tight text-ink md:text-[24px]" style={{ fontFamily: `"${f.family}"`, fontWeight: f.weight }}>{sample}</span>
                <span className={cx("text-[12px]", fontId === f.id ? "font-bold text-key-strong" : "text-mute")}>{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 md:gap-3">
          <h3 className="text-[15px] font-bold">색</h3>
          <div className="flex flex-wrap items-center gap-1 md:gap-1.5">
            {STAMP_COLORS.map((c) => (
              <button key={c.hex} type="button" onClick={() => pickColor(c.hex)} aria-label={c.name} aria-pressed={color === c.hex}
                className={cx("flex size-10 items-center justify-center rounded-full border-2", color === c.hex ? "border-ink" : "border-transparent")}>
                <span className="flex size-[30px] items-center justify-center rounded-full" style={{ background: c.hex }}>{color === c.hex && <Check size={16} strokeWidth={3} className="text-[#fff]" />}</span>
              </button>
            ))}
            <label className={cx("relative flex size-10 cursor-pointer items-center justify-center rounded-full border-2", custom ? "border-ink" : "border-transparent")} aria-label="색 직접 고르기">
              <span className="size-[30px] rounded-full" style={{ background: "conic-gradient(#ff3333, #ffd91a, #33cc66, #4d73ff, #cc33ff, #ff3333)" }} />
              <input type="color" value={color.toLowerCase()} onChange={(e) => pickColor(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
            <span className="flex h-10 w-full items-center gap-1.5 rounded-control bg-soft px-3 md:ml-1.5 md:w-[120px]">
              <span className="text-[14px] font-medium text-mute">#</span>
              <input value={hexDraft} aria-label="색 값" maxLength={7} spellCheck={false}
                onChange={(e) => { setHexDraft(e.target.value.replace(/^#/, "")); const h = normalizeHex(e.target.value); if (h) setColor(h); }}
                onBlur={() => setHexDraft(color.slice(1))}
                className="min-w-0 flex-1 bg-transparent text-[14px] font-medium uppercase outline-none" />
            </span>
          </div>
          <p className="hidden text-[12px] text-mute md:block">{STAMP_COLORS.map((c) => c.name).join(" · ")} · 직접</p>
        </div>
      </section>

      <div data-sticky-cta className="sticky bottom-[calc(env(safe-area-inset-bottom)+66px)] z-20 -mx-4 flex gap-2 border-t border-line bg-[#fff] px-4 py-3 md:hidden">
        <Button className="h-12 flex-1" onClick={download} disabled={empty}><Download size={18} /> PNG 내려받기</Button>
        <Button kind="outline" className="h-12 font-bold" onClick={copy} disabled={empty}>{copied ? "복사됨" : "복사"}</Button>
      </div>
    </div>
  );
}
