"use client";
import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { FileUp, Users } from "lucide-react";
import { Button, Card, cx } from "@/components/ui";
import { previewRoster, saveRoster, type RosterPreview, type RosterSave } from "./roster-actions";

export type RosterSection = { name: string; count: number };
export type RosterCourse = { id: string; label: string; meta: string; sections: RosterSection[] };

// 이동반 분반 명단 (Figma N2 179:1456): 이동반 과목 → 분반마다 나이스 명단 파일을 올리거나 표를 붙여 넣으면 학생을 자동으로 찾는다 → 확인 후 저장
export function RosterBox({ teacherId, courses, fixedNote }: { teacherId: string; courses: RosterCourse[]; fixedNote: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!courses.length) return null;
  return (
    <Card title="이동반 명단" action={<span className="text-[13px] text-mute">이동반 과목만 · 분반마다 나이스 명단</span>}>
      <div className="flex flex-col gap-4">
        {courses.map((c) => (
          <div key={c.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-[14px]">
              <span className="font-bold">{c.label}</span>
              <span className="text-[12px] text-mute">{c.meta}</span>
              <span className="rounded-chip bg-key-soft px-2 py-0.5 text-[12px] font-bold text-key-strong">이동반 · {c.sections.length}분반</span>
            </div>
            <ul className="flex flex-col gap-2">
              {c.sections.map((s) => {
                const key = `${c.id}|${s.name}`;
                return (
                  <li key={key} className="rounded-inner bg-white p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 font-bold">{c.label} · {s.name}</span>
                      <span className={cx("rounded-chip px-2 py-0.5 text-[12px]", s.count ? "bg-key-soft text-key-strong" : "bg-soft text-mute")}>{s.count ? `명단 ${s.count}명` : "명단 없음"}</span>
                      <Button type="button" size="sm" kind="outline" onClick={() => setOpen(open === key ? null : key)}>
                        <Users size={14} /> {s.count ? "명단 바꾸기" : "명단 올리기"}
                      </Button>
                    </div>
                    {open === key && <RosterEditor key={key} teacherId={teacherId} courseId={c.id} section={s.name} count={s.count} onDone={() => setOpen(null)} />}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {fixedNote && <p className="text-[12px] text-mute">고정반 과목은 학생 등록의 반 명단을 그대로 써요 · {fixedNote}</p>}
      </div>
    </Card>
  );
}

function RosterEditor({ teacherId, courseId, section, count, onDone }: { teacherId: string; courseId: string; section: string; count: number; onDone: () => void }) {
  const [preview, previewAction, reading] = useActionState<RosterPreview, FormData>(previewRoster, {});
  const [save, saveAction, saving] = useActionState<RosterSave, FormData>(saveRoster, {});
  const [fileName, setFileName] = useState("");
  const [drop, setDrop] = useState<Set<string>>(new Set());
  const matched = preview.matched ?? [];

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
      <form action={previewAction} className="flex flex-col gap-2.5">
        <input type="hidden" name="teacherId" value={teacherId} />
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="section" value={section} />
        <label className={cx("flex cursor-pointer items-center gap-3 rounded-inner border-2 border-dashed border-hair bg-soft px-4 py-3.5", fileName && "border-key")}>
          <FileUp size={20} className="shrink-0 text-key" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium">{fileName || "나이스 명단 파일 고르기"}</span>
            <span className="block text-[12px] text-mute">나이스 출석부·명단 엑셀(.xlsx·.xls)·CSV, 또는 양식</span>
          </span>
          <input type="file" name="file" accept=".xlsx,.xls,.csv,text/csv" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
        </label>
        <textarea name="pasted" rows={3} placeholder={"또는 나이스 화면의 명단을 복사해 붙여 넣기\n예) 1	20605	박지훈"} className="w-full resize-y rounded-field bg-soft p-3 text-[13px] outline-none focus:ring-2 focus:ring-key" />
        <div className="flex items-center gap-2">
          <Link href="/students/list-template" prefetch={false} className="mr-auto whitespace-nowrap text-[13px] font-medium text-key-strong">양식 받기</Link>
          <Button size="sm" kind="soft" disabled={reading}>{reading ? "읽는 중…" : "명단 읽기"}</Button>
        </div>
      </form>
      {preview.error && <p className="text-sm text-bad" role="alert">{preview.error}</p>}

      {preview.matched && (
        <form action={saveAction} className="flex flex-col gap-2.5">
          <input type="hidden" name="teacherId" value={teacherId} />
          <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="section" value={section} />
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-bold text-ok">찾음 {matched.length - drop.size}명</span>
            {(preview.unmatched?.length ?? 0) > 0 && <span className="font-bold text-wait">못 찾음 {preview.unmatched!.length}명</span>}
            {(preview.duplicates ?? 0) > 0 && <span className="text-mute">중복 {preview.duplicates}줄 뺌</span>}
            <span className="text-mute">· 누르면 빼기</span>
          </div>
          <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto rounded-inner bg-soft p-2.5">
            {matched.map((s) => {
              const off = drop.has(s.id);
              return (
                <button key={s.id} type="button" onClick={() => { const d = new Set(drop); if (off) d.delete(s.id); else d.add(s.id); setDrop(d); }}
                  className={cx("rounded-chip px-2 py-0.5 text-[12px] tabular-nums", off ? "bg-white text-faint line-through" : "bg-white text-ink")}>
                  {s.label}
                </button>
              );
            })}
          </div>
          {matched.filter((s) => !drop.has(s.id)).map((s) => <input key={s.id} type="hidden" name="studentId" value={s.id} />)}
          {(preview.unmatched?.length ?? 0) > 0 && (
            <p className="text-[12px] text-[#9A6400]">찾지 못함: {preview.unmatched!.slice(0, 10).join(", ")}{preview.unmatched!.length > 10 ? ` 외 ${preview.unmatched!.length - 10}줄` : ""} · 잘 안 맞으면 양식에 옮겨 올려 주세요</p>
          )}
          {save.error && <p className="text-sm text-bad" role="alert">{save.error}</p>}
          {save.done && <p className="text-sm text-ok" role="status">{save.done}</p>}
          <div className="flex justify-end gap-2">
            {count > 0 && (
              <Button type="button" size="sm" kind="outline" disabled={saving}
                onClick={() => { const fd = new FormData(); fd.set("teacherId", teacherId); fd.set("courseId", courseId); fd.set("section", section); startTransition(() => saveAction(fd)); }}>
                명단 비우기
              </Button>
            )}
            <Button size="sm" disabled={saving || matched.length - drop.size === 0}>{saving ? "저장 중…" : `${matched.length - drop.size}명 명단 저장`}</Button>
            {save.done && <Button type="button" size="sm" kind="outline" onClick={onDone}>닫기</Button>}
          </div>
        </form>
      )}
    </div>
  );
}
