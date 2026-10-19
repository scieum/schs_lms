"use client";
import { startTransition, useActionState, useState } from "react";
import { FileSpreadsheet, ListChecks, Users, X } from "lucide-react";
import { Button, Card, cx } from "@/components/ui";
import { ExcelButtons } from "@/components/excel-buttons";
import type { PickStudent } from "@/lib/domain/roster-pick";
import { previewRoster, saveRoster, type RosterPreview, type RosterSave } from "./roster-actions";
import { RosterPicker } from "./roster-picker";

export type RosterSection = { name: string; count: number; ids: string[] };
export type RosterCourse = { id: string; label: string; grade: number; meta: string; sections: RosterSection[] };

// 이동반 분반 명단 (Figma N25 342:8991, N2 대신): 이동반 과목 → 분반마다 명단 양식(.xlsx)을 올리면 학생을 찾는다 → 확인 후 저장
// N37(448:98727): 엑셀 말고 "직접 고르기"로 등록된 학생 목록에서 바로 고를 수도 있다
export function RosterBox({ teacherId, courses, fixedNote, students }: { teacherId: string; courses: RosterCourse[]; fixedNote: string | null; students: PickStudent[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!courses.length) return null;
  return (
    <Card title="이동반 명단" action={<span className="text-[13px] text-mute">이동반 과목만 · 엑셀이나 직접 고르기</span>}>
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
                    {open === key && (
                      <RosterEditor key={key} teacherId={teacherId} course={c} section={s.name} count={s.count} students={students} onDone={() => setOpen(null)} />
                    )}
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

type Method = "excel" | "pick";

/** 분반 명단 바꾸기: [엑셀로 | 직접 고르기] (N37) */
function RosterEditor({ teacherId, course, section, count, students, onDone }: { teacherId: string; course: RosterCourse; section: string; count: number; students: PickStudent[]; onDone: () => void }) {
  const [method, setMethod] = useState<Method>("pick");
  const members = Object.fromEntries(course.sections.map((s) => [s.name, s.ids]));
  return (
    <div className="mt-3 flex flex-col gap-3.5 rounded-inner bg-[#fff] p-3.5 md:p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div role="tablist" aria-label="명단 넣는 방법" className="flex w-full rounded-full border border-hair bg-[#fff] p-[3px] md:w-auto">
          {([["excel", "엑셀로", FileSpreadsheet], ["pick", "직접 고르기", ListChecks]] as const).map(([m, label, Icon]) => (
            <button key={m} type="button" role="tab" aria-selected={method === m} onClick={() => setMethod(m)}
              className={cx("inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] md:flex-none md:py-1.5", method === m ? "bg-key-soft font-bold text-key-strong" : "font-medium text-sub")}>
              <Icon size={14} aria-hidden /> {label}
            </button>
          ))}
        </div>
        <span className="hidden text-[12px] text-mute md:inline">{method === "pick" ? "등록된 학생 목록에서 바로 골라요" : "양식에 맞춘 엑셀만 읽어요"}</span>
      </div>
      {method === "pick"
        ? <RosterPicker teacherId={teacherId} courseId={course.id} courseLabel={`${course.label} · ${course.meta.split(" · ")[0]}`} section={section} grade={course.grade} students={students} members={members} onDone={onDone} />
        : <ExcelEditor teacherId={teacherId} courseId={course.id} section={section} count={count} onDone={onDone} />}
    </div>
  );
}

function ExcelEditor({ teacherId, courseId, section, count, onDone }: { teacherId: string; courseId: string; section: string; count: number; onDone: () => void }) {
  const [preview, previewAction, reading] = useActionState<RosterPreview, FormData>(previewRoster, {});
  const [save, saveAction, saving] = useActionState<RosterSave, FormData>(saveRoster, {});
  const [drop, setDrop] = useState<Set<string>>(new Set());
  const matched = preview.matched ?? [];

  return (
    <div className="flex flex-col gap-3">
      <ExcelButtons kind="list" busy={reading} error={preview.error} onPick={(file) => {
        const fd = new FormData();
        fd.set("teacherId", teacherId);
        fd.set("courseId", courseId);
        fd.set("section", section);
        fd.set("file", file);
        startTransition(() => previewAction(fd));
      }} />

      {preview.matched && (
        <form action={saveAction} className="flex flex-col gap-2.5">
          <input type="hidden" name="teacherId" value={teacherId} />
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="section" value={section} />
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="rounded-chip bg-ok-soft px-2 py-0.5 font-bold text-ok">찾음 {matched.length - drop.size}명</span>
            {(preview.unmatched?.length ?? 0) > 0 && <span className="rounded-chip bg-wait-soft px-2 py-0.5 font-bold text-[#9A6400]">못 찾음 {preview.unmatched!.length}명</span>}
            {(preview.duplicates ?? 0) > 0 && <span className="text-mute">중복 {preview.duplicates}줄 뺌</span>}
            <span className="text-mute">· 누르면 빼기</span>
          </div>
          <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
            {matched.map((s) => {
              const off = drop.has(s.id);
              return (
                <button key={s.id} type="button" onClick={() => { const d = new Set(drop); if (off) d.delete(s.id); else d.add(s.id); setDrop(d); }}
                  aria-pressed={!off} className={cx("inline-flex items-center gap-1 rounded-chip border border-line bg-[#fff] px-2 py-1 text-[12px] tabular-nums", off ? "text-faint line-through" : "text-ink")}>
                  {s.label} {!off && <X size={12} className="text-mute" aria-hidden />}
                </button>
              );
            })}
          </div>
          {matched.filter((s) => !drop.has(s.id)).map((s) => <input key={s.id} type="hidden" name="studentId" value={s.id} />)}
          {(preview.unmatched?.length ?? 0) > 0 && (
            <p className="text-[12px] text-[#9A6400]">찾지 못함: {preview.unmatched!.slice(0, 10).join(", ")}{preview.unmatched!.length > 10 ? ` 외 ${preview.unmatched!.length - 10}줄` : ""} · 이 수업 학생이 아니에요</p>
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
