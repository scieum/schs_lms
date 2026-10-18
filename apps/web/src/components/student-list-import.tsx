"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { FileUp } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { matchRoster, readRosterTable, splitPasted, type RosterStudent } from "@/lib/domain/class-roster";
import { readStudentListFile } from "@/app/(app)/students/list-actions";

type Found = { matched: RosterStudent[]; unmatched: string[]; duplicates: number };

/**
 * 엑셀로 학생 넣기 (Figma N17): 명단 파일(엑셀·CSV·나이스 명단)이나 복사한 표 → 학번·학년반번호·이름으로
 * 이 화면에서 고를 수 있는 학생(pool) 안에서 찾기 → 확인 후 선택에 더한다. 저장은 화면의 저장 버튼이 한다.
 */
export function StudentListImport({ pool, picked, onAdd, grade, className }: {
  pool: RosterStudent[];
  picked: Iterable<string>;
  onAdd: (ids: string[]) => void;
  /** 한 학년만 고르는 화면이면 반·번호만 있어도 찾는다 */
  grade?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [drop, setDrop] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [reading, start] = useTransition();

  const have = new Set(picked);
  const fresh = found ? found.matched.filter((s) => !have.has(s.id) && !drop.has(s.id)) : [];
  const already = found ? found.matched.filter((s) => have.has(s.id)).length : 0;

  const reset = () => { setFile(null); setText(""); setFound(null); setDrop(new Set()); setError(null); };
  const close = () => { reset(); setOpen(false); };

  const read = () => start(async () => {
    setError(null);
    setFound(null);
    setDrop(new Set());
    let rows: string[][];
    if (file) {
      const fd = new FormData();
      fd.set("file", file);
      const r = await readStudentListFile(fd).catch(() => ({ error: "파일을 읽지 못했어요", rows: undefined }));
      if (!r.rows) return setError(r.error ?? "파일을 읽지 못했어요");
      rows = r.rows;
    } else if (text.trim()) {
      rows = splitPasted(text);
    } else {
      return setError("명단 파일을 고르거나 표를 붙여 넣어 주세요");
    }
    const lines = readRosterTable(rows);
    if (!lines.length) return setError("학번이나 이름을 찾지 못했어요. 학번·이름 열이 있는지 확인해 주세요");
    const m = matchRoster(lines, pool, grade);
    setFound({
      matched: m.matched,
      duplicates: m.duplicates,
      unmatched: m.unmatched.map((l) => [l.studentNo, l.name].filter(Boolean).join(" ") || l.raw),
    });
  });

  if (!open) {
    return (
      <Button type="button" kind="outline" size="sm" className={className} onClick={() => setOpen(true)}>
        <FileUp size={14} /> 엑셀로 넣기
      </Button>
    );
  }

  return (
    <div className={cx("flex w-full flex-col gap-2.5 rounded-inner border border-line bg-white p-3.5", className)}>
      <label className={cx("flex min-w-0 cursor-pointer items-center gap-3 rounded-inner border-2 border-dashed border-hair bg-white px-3.5 py-3", file && "border-key")}>
        <FileUp size={20} className="shrink-0 text-key" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{file?.name || "명단 파일 고르기"}</span>
          <span className="block text-[12px] text-mute">엑셀·CSV · 학번이나 학년·반·번호, 이름 열</span>
        </span>
        <input type="file" accept=".xlsx,.xls,.csv,text/csv" className="sr-only" aria-label="명단 파일"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setFound(null); setError(null); }} />
      </label>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setFound(null); }} rows={3} maxLength={20000} aria-label="명단 붙여 넣기"
        placeholder={"또는 표를 복사해 붙여 넣기\n예) 20312	김민지"}
        className="w-full resize-y rounded-field bg-soft p-3 text-[13px] leading-6 outline-none focus:ring-2 focus:ring-key" />
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}

      {found && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className="font-bold text-ok">찾음 {found.matched.length - drop.size}명</span>
            {found.unmatched.length > 0 && <span className="font-bold text-wait">못 찾음 {found.unmatched.length}명</span>}
            {already > 0 && <span className="text-mute">이미 고름 {already}명</span>}
            {found.duplicates > 0 && <span className="text-mute">중복 {found.duplicates}줄 뺌</span>}
            {found.matched.length > 0 && <span className="text-mute">· 누르면 빼기</span>}
          </div>
          {found.matched.length > 0 && (
            <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-inner bg-soft p-2.5">
              {found.matched.map((s) => {
                const off = drop.has(s.id);
                return (
                  <button key={s.id} type="button" aria-pressed={!off}
                    onClick={() => setDrop((d) => { const n = new Set(d); if (off) n.delete(s.id); else n.add(s.id); return n; })}
                    className={cx("rounded-chip bg-white px-2 py-0.5 text-[12px] tabular-nums", off ? "text-faint line-through" : "text-ink")}>
                    {s.studentNo} {s.name}
                  </button>
                );
              })}
            </div>
          )}
          {found.unmatched.length > 0 && (
            <p className="text-[12px] text-wait">찾지 못함: {found.unmatched.slice(0, 8).join(", ")}{found.unmatched.length > 8 ? ` 외 ${found.unmatched.length - 8}줄` : ""}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Link href="/students/list-template" prefetch={false} className="mr-auto whitespace-nowrap text-[13px] font-medium text-key-strong">양식 받기</Link>
        <Button type="button" kind="outline" size="sm" onClick={close}>닫기</Button>
        {found ? (
          <Button type="button" size="sm" disabled={!fresh.length} onClick={() => { onAdd(fresh.map((s) => s.id)); close(); }}>
            {fresh.length ? `${fresh.length}명 넣기` : "넣을 학생 없음"}
          </Button>
        ) : (
          <Button type="button" kind="soft" size="sm" disabled={reading || (!file && !text.trim())} onClick={read}>
            {reading ? "읽는 중…" : "명단 읽기"}
          </Button>
        )}
      </div>
    </div>
  );
}
