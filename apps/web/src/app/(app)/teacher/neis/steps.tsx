"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { cx } from "@/components/ui";

// 나이스 입력 세 단계 (Figma N9 211:2307)
function Num({ n, soft }: { n: number; soft?: boolean }) {
  return <span className={cx("flex size-[22px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold", soft ? "bg-key-soft text-key-strong" : "bg-key text-white")}>{n}</span>;
}

/** ① 도우미 설치 ② 기록 복사 ③ 나이스에서 채우기 — '설치 방법'을 누르면 세 줄 안내가 펼쳐진다 */
export function Steps() {
  const [open, setOpen] = useState(false);
  return (
    <section className="surface rounded-card p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-2.5 rounded-inner bg-[#F5F6F8] p-4">
            <p className="flex items-center gap-2 text-[15px] font-bold"><Num n={1} />도우미 설치</p>
            <div className="flex items-center gap-3">
              <a href="/neis-helper.zip" download className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-control bg-key-soft px-3.5 text-[13px] font-bold text-key-strong hover:bg-key-soft/70 md:flex-none">
                <Download size={15} />도우미 받기 (zip)
              </a>
              <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-[13px] font-bold text-key-strong">설치 방법</button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-inner bg-[#F5F6F8] p-4 md:flex-col md:items-start md:justify-start">
            <p className="flex items-center gap-2 text-[15px] font-bold"><Num n={2} />기록 복사</p>
            <p className="text-[13px] text-sub">아래 목록 › 복사</p>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-inner bg-[#F5F6F8] p-4 md:flex-col md:items-start md:justify-start">
            <p className="flex items-center gap-2 text-[15px] font-bold"><Num n={3} />나이스에서 채우기</p>
            <p className="hidden text-[13px] text-sub md:block">도우미 › 붙여넣기 › 채우기</p>
            <span className="rounded-chip bg-soft px-2 py-0.5 text-[11px] font-bold text-sub">PC 크롬</span>
          </div>
        </div>
        {open && <ol className="mt-3 flex flex-col gap-2 rounded-inner border border-line px-4 py-3 text-[13px] md:flex-row md:gap-6">
          {["chrome://extensions", "개발자 모드 켜기", "압축 푼 폴더 선택"].map((t, i) => (
            <li key={t} className="flex items-center gap-2"><Num n={i + 1} soft /><span className={i === 0 ? "font-bold" : ""}>{t}</span></li>
          ))}
        </ol>}
    </section>
  );
}
