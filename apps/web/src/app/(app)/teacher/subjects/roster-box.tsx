"use client";
import { startTransition, useActionState, useState } from "react";
import { FileUp, Users } from "lucide-react";
import { Button, Card, cx } from "@/components/ui";
import { previewRoster, saveRoster, type RosterPreview, type RosterSave } from "./roster-actions";

export type RosterCourse = { id: string; label: string; grade: number; classes: number[]; count: number; updatedAt: string | null };

// 이동반 명단 (2·3학년 선택 과목): 나이스 명단 파일을 올리거나 표를 붙여 넣으면 학생을 자동으로 찾는다 → 확인 후 저장
export function RosterBox({ teacherId, courses }: { teacherId: string; courses: RosterCourse[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!courses.length) return null;
  return (
    <Card title="이동반 명단" action={<span className="text-[13px] text-mute">선택 과목은 반 대신 명단으로</span>}>
      <ul className="flex flex-col gap-2">
        {courses.map((c) => (
          <li key={c.id} className="rounded-inner bg-white p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 font-bold">{c.label}</span>
              <span className={cx("rounded-chip px-2 py-0.5 text-[12px]", c.count ? "bg-key-soft text-key-strong" : "bg-soft text-mute")}>
                {c.count ? `명단 ${c.count}명` : c.classes.length ? `반 기준 · ${c.classes.join(", ")}반` : "반·명단 없음"}
              </span>
              <Button type="button" size="sm" kind="outline" onClick={() => setOpen(open === c.id ? null : c.id)}>
                <Users size={14} /> {c.count ? "명단 바꾸기" : "명단 올리기"}
              </Button>
            </div>
            {open === c.id && <RosterEditor key={c.id} teacherId={teacherId} course={c} onDone={() => setOpen(null)} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RosterEditor({ teacherId, course, onDone }: { teacherId: string; course: RosterCourse; onDone: () => void }) {
  const [preview, previewAction, reading] = useActionState<RosterPreview, FormData>(previewRoster, {});
  const [save, saveAction, saving] = useActionState<RosterSave, FormData>(saveRoster, {});
  const [fileName, setFileName] = useState("");
  const [drop, setDrop] = useState<Set<string>>(new Set());
  const matched = preview.matched ?? [];

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
      <form action={previewAction} className="flex flex-col gap-2.5">
        <input type="hidden" name="teacherId" value={teacherId} />
        <input type="hidden" name="courseId" value={course.id} />
        <label className={cx("flex cursor-pointer items-center gap-3 rounded-inner border-2 border-dashed border-hair bg-soft px-4 py-3.5", fileName && "border-key")}>
          <FileUp size={20} className="shrink-0 text-key" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium">{fileName || "나이스 명단 파일 고르기"}</span>
            <span className="block text-[12px] text-mute">엑셀(.xlsx·.xls)·CSV · 학번·성명 열이 있으면 돼요</span>
          </span>
          <input type="file" name="file" accept=".xlsx,.xls,.csv,text/csv" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
        </label>
        <textarea name="pasted" rows={3} placeholder={"또는 나이스 화면의 명단을 복사해 붙여 넣기\n예) 1	20605	박지훈"} className="w-full resize-y rounded-field bg-soft p-3 text-[13px] outline-none focus:ring-2 focus:ring-key" />
        <Button size="sm" kind="soft" disabled={reading} className="self-end">{reading ? "읽는 중…" : "명단 읽기"}</Button>
      </form>
      {preview.error && <p className="text-sm text-bad" role="alert">{preview.error}</p>}

      {preview.matched && (
        <form action={saveAction} className="flex flex-col gap-2.5">
          <input type="hidden" name="teacherId" value={teacherId} />
          <input type="hidden" name="courseId" value={course.id} />
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
            <p className="text-[12px] text-wait">명단에 있지만 학생 등록에서 찾지 못했어요: {preview.unmatched!.join(", ")}</p>
          )}
          {save.error && <p className="text-sm text-bad" role="alert">{save.error}</p>}
          {save.done && <p className="text-sm text-ok" role="status">{save.done}</p>}
          <div className="flex justify-end gap-2">
            {course.count > 0 && (
              <Button type="button" size="sm" kind="outline" disabled={saving}
                onClick={() => { const fd = new FormData(); fd.set("teacherId", teacherId); fd.set("courseId", course.id); startTransition(() => saveAction(fd)); }}>
                반 기준으로 되돌리기
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
