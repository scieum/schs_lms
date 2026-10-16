import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Avatar, Card, Tag, cx } from "@/components/ui";
import { RecordEditor } from "@/components/writing/record-editor";
import type { ActivityLog } from "@/lib/domain/activity";
import { measure, UNIT_LABEL } from "@/lib/domain/length";
import type { Student } from "@/lib/domain/types";
import { latestMemoByStudent, latestRecordByStudent, recordMax, recordStatus, type RecordArea, type RecordDraft, type RecordMemo, type RecordStatusLabel } from "@/lib/domain/writing";

// 기록 쓰기 작업 화면 (Figma T4 초안 검토와 같은 배치): 왼쪽 학생 목록 · 가운데 본문(AI 초안·자동 검사·분량) · 오른쪽 근거 자료
// 특기사항(/teacher/write?area=…)과 행발(/homeroom/behavior)이 함께 쓴다.

export const STATUS_TONE: Record<RecordStatusLabel, string | undefined> = {
  확정: undefined,
  "작성 중": "bg-wait-soft text-wait",
  미작성: "bg-white text-mute",
};

export function RecordWorkspace({
  area,
  listTitle,
  students,
  selectedId,
  drafts,
  memos,
  logs,
  clubId,
  href,
}: {
  area: RecordArea;
  listTitle: string;
  students: Student[];
  selectedId?: string;
  drafts: RecordDraft[];
  memos: RecordMemo[];
  logs: ActivityLog[];
  clubId?: string;
  href: (studentId: string) => string;
}) {
  const latest = latestRecordByStudent(drafts);
  const memo = latestMemoByStudent(memos);
  const selected = students.find((s) => s.id === selectedId) ?? students.find((s) => recordStatus(latest.get(s.id)) !== "확정") ?? students[0];

  if (!selected) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-mute">쓸 수 있는 학생이 없어요</p>
      </Card>
    );
  }

  const idx = students.indexOf(selected);
  const prev = students[idx - 1];
  const next = students[idx + 1];
  const cur = latest.get(selected.id);
  const mine = logs.filter((l) => l.studentId === selected.id);
  const versions = drafts.filter((d) => d.studentId === selected.id).reverse();
  const m = memo.get(selected.id);

  return (
    <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)] md:gap-6 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
      <Card title={listTitle} className="md:self-start">
        <ul className="-mx-2 flex max-h-[620px] flex-col overflow-y-auto">
          {students.map((s) => {
            const r = latest.get(s.id);
            const st = recordStatus(r);
            const on = s.id === selected.id;
            const n = logs.filter((l) => l.studentId === s.id).length;
            return (
              <li key={s.id}>
                <Link
                  href={href(s.id)}
                  aria-current={on ? "true" : undefined}
                  className={cx("flex items-center gap-3 rounded-inner px-2 py-2.5", on ? "bg-white" : "hover:bg-white/60")}
                >
                  <Avatar name={s.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className={cx("block truncate", on && "font-bold")}>{s.name}</span>
                    <span className="block truncate text-[12px] text-mute">
                      {s.grade}-{s.classNo}-{s.number} · 기록 {n}건{r?.content ? ` · ${measure(r.content, r.unit).toLocaleString()}${r.unit === "bytes" ? "B" : "자"}` : ""}
                    </span>
                  </span>
                  <Tag tone={STATUS_TONE[st]}>{st}</Tag>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <section className="flex min-w-0 flex-col gap-4 rounded-card bg-soft p-5 md:p-6">
        <div className="flex items-center gap-3">
          <Avatar name={selected.name} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-bold md:text-lg">{selected.name} · {selected.grade}학년 {selected.classNo}반 {selected.number}번</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Tag tone="bg-white text-sub">{`근거: ${m ? "메모 + " : ""}누가기록 ${mine.length}건`}</Tag>
              {versions.length > 0 && <Tag tone="bg-white text-sub">{`버전 ${versions.length}`}</Tag>}
              {cur && <Tag tone={STATUS_TONE[recordStatus(cur)]}>{recordStatus(cur)}</Tag>}
            </div>
          </div>
          <span className="hidden text-[13px] text-mute md:inline">{idx + 1} / {students.length}</span>
          <div className="flex gap-1">
            <StepLink href={prev ? href(prev.id) : undefined} label="이전 학생"><ChevronLeft size={16} /></StepLink>
            <StepLink href={next ? href(next.id) : undefined} label="다음 학생"><ChevronRight size={16} /></StepLink>
          </div>
        </div>
        <RecordEditor
          key={`${area}-${selected.id}`}
          area={area}
          studentId={selected.id}
          clubId={clubId}
          who={{ name: selected.name, studentNo: selected.studentNo, grade: selected.grade, classNo: selected.classNo, number: selected.number }}
          initial={cur?.content ?? ""}
          memo={m?.content ?? ""}
          unit={cur?.unit ?? "bytes"}
          max={cur?.max ?? recordMax(area, "bytes")}
          confirmed={cur?.status === "confirmed"}
        />
      </section>

      <div className="flex flex-col gap-4 md:col-span-2 md:gap-6 lg:col-span-1">
        <Card title="근거 자료" action={<span className="text-[13px] text-mute">누가기록 {mine.length}건</span>}>
          {mine.length === 0 ? (
            <p className="py-4 text-center text-sm text-mute">이 학생의 누가기록이 없어요</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {mine.map((l) => (
                <li key={l.id} className="rounded-inner bg-white p-3.5">
                  <div className="mb-1 flex items-center gap-1.5 text-[12px] text-mute">
                    <span>{l.date.slice(5).replace("-", ".")}</span>
                    {area === "행발" && <Tag tone="bg-soft text-sub">{l.area}</Tag>}
                  </div>
                  <p className="text-[13px] leading-5 text-sub">{l.content}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {versions.length > 0 && (
          <Card title="지난 버전">
            <ul className="flex flex-col">
              {versions.slice(0, 5).map((d, i) => (
                <li key={d.id} className={cx("flex items-center gap-2 py-2.5 text-[13px]", i > 0 && "border-t border-line")}>
                  <span className="flex-1 text-mute">{new Date(d.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="text-sub">{measure(d.content, d.unit).toLocaleString()}{UNIT_LABEL[d.unit]}</span>
                  <Tag tone={STATUS_TONE[recordStatus(d)]}>{recordStatus(d)}</Tag>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function StepLink({ href, label, children }: { href?: string; label: string; children: ReactNode }) {
  const cls = "flex size-8 items-center justify-center rounded-control border border-hair bg-white";
  return href ? (
    <Link href={href} aria-label={label} className={cx(cls, "hover:bg-soft")}>{children}</Link>
  ) : (
    <span aria-hidden className={cx(cls, "text-faint")}>{children}</span>
  );
}
