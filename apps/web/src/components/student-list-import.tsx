"use client";
import { useState, useTransition } from "react";
import { FileUp } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { ExcelButtons } from "@/components/excel-buttons";
import { matchRoster, type RosterStudent } from "@/lib/domain/class-roster";
import { readStudentListFile } from "@/app/(app)/students/list-actions";

type Found = { matched: RosterStudent[]; unmatched: string[]; duplicates: number };

/**
 * 엑셀로 학생 넣기 (Figma N25 342:8638, N17 대신): "엑셀로 넣기"를 누르면 패널 안에 엑셀 버튼 줄만.
 * 명단_양식.xlsx → 학번·학년반번호·이름으로 이 화면에서 고를 수 있는 학생(pool) 안에서 찾기 → 확인 후 선택에 더한다.
 * 저장은 화면의 저장 버튼이 한다.
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
  const [found, setFound] = useState<Found | null>(null);
  const [drop, setDrop] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [reading, start] = useTransition();

  const have = new Set(picked);
  const fresh = found ? found.matched.filter((s) => !have.has(s.id) && !drop.has(s.id)) : [];
  const already = found ? found.matched.filter((s) => have.has(s.id)).length : 0;

  const close = () => { setFound(null); setDrop(new Set()); setError(null); setOpen(false); };

  const read = (file: File) => start(async () => {
    setError(null);
    setFound(null);
    setDrop(new Set());
    const fd = new FormData();
    fd.set("file", file);
    const r = await readStudentListFile(fd).catch(() => ({ error: "파일을 읽지 못했어요", lines: undefined }));
    if (!r.lines) return setError(r.error ?? "파일을 읽지 못했어요");
    const m = matchRoster(r.lines, pool, grade);
    setFound({
      matched: m.matched,
      duplicates: m.duplicates,
      unmatched: m.unmatched.map((l) => [l.studentNo, l.name].filter(Boolean).join(" ") || l.raw),
    });
  });

  return (
    <div className={cx("flex w-full flex-col gap-2.5", className)}>
      <Button type="button" kind="outline" size="sm" className="self-start" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <FileUp size={14} /> 엑셀로 넣기
      </Button>
      {open && (
        <div className="flex w-full flex-col gap-2.5 rounded-inner border border-line bg-[#fff] p-3.5">
          <ExcelButtons kind="list" onPick={read} busy={reading} error={error} />

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
                        className={cx("rounded-chip bg-[#fff] px-2 py-0.5 text-[12px] tabular-nums", off ? "text-faint line-through" : "text-ink")}>
                        {s.studentNo} {s.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {found.unmatched.length > 0 && (
                <p className="text-[12px] text-wait">찾지 못함: {found.unmatched.slice(0, 8).join(", ")}{found.unmatched.length > 8 ? ` 외 ${found.unmatched.length - 8}줄` : ""}</p>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button type="button" kind="outline" size="sm" onClick={close}>닫기</Button>
                <Button type="button" size="sm" disabled={!fresh.length} onClick={() => { onAdd(fresh.map((s) => s.id)); close(); }}>
                  {fresh.length ? `${fresh.length}명 넣기` : "넣을 학생 없음"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
