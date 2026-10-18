"use client";
import { useRef } from "react";
import { CircleAlert, FileSpreadsheet, Upload } from "lucide-react";
import { cx } from "@/components/ui";
import { TEMPLATE_HINT, TEMPLATES, type TemplateKind } from "@/lib/domain/excel-template";

// 엑셀 양식 (Figma N25 "엑셀 버튼 줄" 341:239 · "양식 시트" 341:425).
// 엑셀을 받는 모든 곳이 이 버튼 줄 하나를 쓴다: 초록 "양식 받기" + 검정 "명단 업로드", 아래 한 줄(안내 또는 오류).
// 양식에 맞춘 .xlsx 만 읽는다 (서버 lib/server/excel.ts readTemplateFile).

const TEMPLATE_HREF: Record<TemplateKind, string> = {
  register: "/students/template",
  list: "/students/list-template",
  teacher: "/admin/accounts/template",
};

const BTN = "inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-3.5 text-[14px] font-bold text-white transition-colors md:h-10 md:flex-none";

export function ExcelButtons({ kind, onPick, busy, error, file, className }: {
  kind: TemplateKind;
  /** 고른 파일 (.xlsx) — 올리기·읽기는 부르는 쪽이 한다 */
  onPick: (file: File) => void;
  busy?: boolean;
  /** 읽지 못한 이유 (양식이 아니면 TEMPLATE_ERROR) */
  error?: string | null;
  /** 올린 파일 줄 (이름 + 오른쪽 태그) */
  file?: { name: string; tag: string; failed?: boolean } | null;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {file && (
        <div className="flex min-w-0 items-center gap-2 rounded-field bg-[#fff] px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{file.name}</span>
          <span className={cx("shrink-0 rounded-chip px-2 py-0.5 text-[12px] font-bold", file.failed ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok")}>{file.tag}</span>
        </div>
      )}
      <div className="flex gap-2">
        <a href={TEMPLATE_HREF[kind]} download={TEMPLATES[kind].file} className={cx(BTN, "bg-[#1D6F42] hover:bg-[#185C37]")}>
          <FileSpreadsheet size={16} aria-hidden /> 양식 받기
        </a>
        <button type="button" disabled={busy} onClick={() => input.current?.click()}
          className={cx(BTN, "bg-[#191F28] hover:bg-[#333D4B] disabled:cursor-wait disabled:opacity-60")}>
          <Upload size={16} aria-hidden /> {busy ? "읽는 중…" : "명단 업로드"}
        </button>
        <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" aria-label="명단 엑셀 파일"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // 같은 파일을 고쳐서 다시 올릴 수 있게
            if (f) onPick(f);
          }} />
      </div>
      {error ? (
        <p className="flex items-start gap-1 text-[12px] font-medium text-bad" role="alert">
          <CircleAlert size={14} className="mt-px shrink-0" aria-hidden /> {error}
        </p>
      ) : (
        <p className="text-[12px] text-mute">{TEMPLATE_HINT}</p>
      )}
    </div>
  );
}

const ROW_NO = 32;

/** 양식 그림: 열 글자 줄 · 1행 제목(파란 바탕, 틀 고정 선) · 예시 2행 · 시트 탭 줄. 좁으면 옆으로 스크롤 */
export function TemplateSheet({ kind, className }: { kind: TemplateKind; className?: string }) {
  const t = TEMPLATES[kind];
  const width = ROW_NO + t.widths.reduce((a, b) => a + b, 0);
  const cell = "h-6 border-b border-r border-line px-1.5 text-left align-middle";
  return (
    <div className={cx("w-full overflow-hidden rounded-inner border border-hair bg-[#fff]", className)} style={{ maxWidth: width + 2 }}>
      <div className="overflow-x-auto">
        <table className="table-fixed border-collapse text-[12px] [&_tr>*:last-child]:border-r-0" style={{ width }} aria-label={`${t.file} 양식`}>
          <colgroup>
            <col style={{ width: ROW_NO }} />
            {t.widths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr className="h-[22px] bg-soft text-[11px] text-mute">
              <th className="border-b border-r border-line font-normal" aria-hidden />
              {t.columns.map((_, i) => <th key={i} className="border-b border-r border-line text-center font-normal" aria-hidden>{String.fromCharCode(65 + i)}</th>)}
            </tr>
            <tr className="border-b-2 border-mute">
              <td className="border-r border-line bg-soft text-center text-[11px] text-mute">1</td>
              {t.columns.map((c) => <th key={c} scope="col" className="h-6 truncate border-r border-line bg-[#DFE3FF] px-1.5 text-left font-bold text-[#26348C]">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {t.examples.map((r, i) => (
              <tr key={i}>
                <td className="h-6 border-b border-r border-line bg-soft text-center text-[11px] text-mute">{i + 2}</td>
                {r.map((v, j) => <td key={j} className={cx(cell, "truncate text-ink")}>{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex h-7 items-stretch gap-3 bg-bg">
        <span className="flex items-center border-b-2 border-[#1D6F42] bg-[#fff] px-3 text-[12px] font-bold text-[#1D6F42]">양식</span>
        <span className="flex min-w-0 items-center truncate text-[11px] text-mute">{t.file}</span>
      </div>
    </div>
  );
}
