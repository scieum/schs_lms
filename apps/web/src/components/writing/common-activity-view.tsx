"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, FileUp, Paperclip, Sparkles, X } from "lucide-react";
import { Button, Tag, cx } from "@/components/ui";
import { prepareUpload } from "@/lib/client/shrink-upload";
import { matchFile, type Matchable } from "@/lib/domain/common-activity";
import { saveCommonPiece, summarizeCommonFile } from "@/app/(app)/teacher/common-actions";
import { ACCEPT } from "./evidence-files";
import { PdfSplitDialog } from "./pdf-split-dialog";

// 공통 활동 화면 (Figma N26): 파일 이름(5자리 학번 · 이름)으로 학생을 맞추고(AI 없이), 모르는 파일은 교사가 고른다.
// 학생마다 브라우저가 파일을 나눠(prepareUpload) 보내 요약 → "[활동명] …" 조각으로 남긴다. 파일은 저장하지 않는다.
// 올리는 방식 (N64): 각각 따로(파일 이름으로 맞춤) | 합본 나누기(PDF 하나 → 번호순 · 페이지 지정 → 학생 칸에 붙음) | 모두에게 하나(한 번 읽고 같은 조각을 모든 학생에게).

type Up = { key: string; file: File; studentId: string | null };
type Mode = "each" | "split" | "all";
const MODES: [Mode, string][] = [["each", "각각 따로"], ["split", "합본 나누기"], ["all", "모두에게 하나"]];
type Status = "대기" | "만드는 중" | "조각 만듦" | "실패";
const SHOWN = 8;
const STATUS_CHIP: Record<Status, string> = {
  대기: "bg-soft text-sub",
  "만드는 중": "bg-wait-soft text-[#9A6400]",
  "조각 만듦": "bg-ok-soft text-ok",
  실패: "bg-bad-soft text-bad",
};

function FileChip({ name, onRemove }: { name: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-chip border border-line bg-[#fff] px-2 py-1 text-[12px] font-medium">
      <Paperclip size={12} className="shrink-0 text-mute" />
      <span className="min-w-0 truncate">{name}</span>
      {onRemove && <button type="button" aria-label="파일 빼기" onClick={onRemove} className="shrink-0 text-mute"><X size={12} /></button>}
    </span>
  );
}

function UploadBox({ title, sub, onClick, disabled }: { title: string; sub: string; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="flex items-center gap-3 rounded-inner border-2 border-dashed border-[#C2CAFF] bg-[#fff] px-4 py-3.5 text-left disabled:opacity-60">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-key-soft text-key"><FileUp size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{title}</span>
        <span className="block text-[12px] text-mute">{sub}</span>
      </span>
    </button>
  );
}

function Chips({ matched, missing, unknown }: { matched: number; missing: number; unknown: number }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <span className="rounded-chip bg-ok-soft px-1.5 py-0.5 text-[12px] font-bold text-ok">맞춤 {matched}명</span>
      <span className="rounded-chip bg-soft px-1.5 py-0.5 text-[12px] font-bold text-mute">자료 없음 {missing}명</span>
      {unknown > 0 && <span className="rounded-chip bg-wait-soft px-1.5 py-0.5 text-[12px] font-bold text-[#9A6400]">모름 {unknown}개</span>}
    </span>
  );
}

export function CommonActivityView({ activity, students, made, label }: {
  activity: { id: string; name: string; description: string };
  students: Matchable[];
  made: string[];
  label: "AI" | "자동";
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [ups, setUps] = useState<Up[]>([]);
  const [done, setDone] = useState<Set<string>>(() => new Set(made));
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Map<string, string>>(new Map());
  const [progress, setProgress] = useState<{ total: number; done: number; made: number } | null>(null);
  const [all, setAll] = useState(false);
  const [mode, setMode] = useState<Mode>("each");
  const [shared, setShared] = useState<File | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const sharedInput = useRef<HTMLInputElement>(null);
  const busy = !!progress && progress.done < progress.total;
  // 모두에게 하나: 파일 하나가 아직 조각 없는 모든 학생 몫
  const toAll = mode === "all" && !!shared;

  const byStudent = useMemo(() => {
    const m = new Map<string, Up[]>();
    for (const u of ups) if (u.studentId) m.set(u.studentId, [...(m.get(u.studentId) ?? []), u]);
    return m;
  }, [ups]);
  const unknown = ups.filter((u) => !u.studentId);
  const matched = students.filter((s) => byStudent.has(s.id)).length;
  const counts = { matched, missing: students.length - matched, unknown: unknown.length };
  const pending = toAll ? students.filter((s) => !done.has(s.id)) : students.filter((s) => byStudent.has(s.id) && !done.has(s.id));
  const pendingFiles = toAll ? 1 : pending.reduce((n, s) => n + (byStudent.get(s.id)?.length ?? 0), 0);

  const status = (id: string): Status | null =>
    done.has(id) ? "조각 만듦" : running.has(id) ? "만드는 중" : failed.has(id) ? "실패" : byStudent.has(id) || toAll ? "대기" : null;

  const add = (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...files].map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, studentId: matchFile(file.name, students) }));
    setUps((cur) => [...cur, ...next]);
  };
  const assign = (key: string, studentId: string) => setUps((cur) => cur.map((u) => (u.key === key ? { ...u, studentId: studentId || null } : u)));
  const remove = (key: string) => setUps((cur) => cur.filter((u) => u.key !== key));

  /** 한 학생: 파일마다 나눠 보내 요약 → 이어 붙여 조각으로 */
  const makeOne = async (studentId: string, files: Up[]): Promise<string | null> => {
    const texts: string[] = [];
    for (const u of files) {
      for (const part of await prepareUpload(u.file)) {
        const fd = new FormData();
        fd.set("activityId", activity.id);
        fd.set("studentId", studentId);
        fd.set("file", part);
        // AI 답이 가끔 끊기면 한 번 더
        let r = await summarizeCommonFile(fd);
        if (!r.ok) r = await summarizeCommonFile(fd);
        if (!r.ok) return r.error;
        texts.push(r.text);
      }
    }
    const r = await saveCommonPiece({ activityId: activity.id, studentId, text: texts.join(" ").slice(0, 900), fileCount: files.length });
    return r.error ?? null;
  };

  /** 모두에게 하나: 한 번만 읽고(첫 학생 범위로 권한 확인) 같은 요약을 학생마다 조각으로 */
  const runAll = async (file: File) => {
    const queue = pending.map((s) => s.id);
    setFailed(new Map());
    setProgress({ total: queue.length, done: 0, made: 0 });
    setRunning(new Set(queue));
    const texts: string[] = [];
    let readErr: string | null = null;
    for (const part of await prepareUpload(file)) {
      const fd = new FormData();
      fd.set("activityId", activity.id);
      fd.set("studentId", queue[0]);
      fd.set("file", part);
      let r = await summarizeCommonFile(fd);
      if (!r.ok) r = await summarizeCommonFile(fd);
      if (!r.ok) { readErr = r.error; break; }
      texts.push(r.text);
    }
    for (const id of queue) {
      const err = readErr ?? (await saveCommonPiece({ activityId: activity.id, studentId: id, text: texts.join(" ").slice(0, 900), fileCount: 1 }).then((r) => r.error ?? null, () => "만들지 못했어요"));
      setRunning((s) => { const n = new Set(s); n.delete(id); return n; });
      if (err) setFailed((m) => new Map(m).set(id, err));
      else setDone((s) => new Set(s).add(id));
      setProgress((p) => p && { ...p, done: p.done + 1, made: p.made + (err ? 0 : 1) });
    }
    router.refresh();
  };

  const run = async () => {
    if (toAll) return runAll(shared!);
    const queue = pending.map((s) => ({ id: s.id, files: byStudent.get(s.id) ?? [] }));
    if (!queue.length) return;
    setFailed(new Map());
    setProgress({ total: queue.length, done: 0, made: 0 });
    let i = 0;
    // 두 명씩 같이 (요청 하나는 4.5MB 아래)
    const worker = async () => {
      while (i < queue.length) {
        const q = queue[i++];
        setRunning((s) => new Set(s).add(q.id));
        const err = await makeOne(q.id, q.files).catch(() => "만들지 못했어요");
        setRunning((s) => { const n = new Set(s); n.delete(q.id); return n; });
        if (err) setFailed((m) => new Map(m).set(q.id, err));
        else setDone((s) => new Set(s).add(q.id));
        setProgress((p) => p && { ...p, done: p.done + 1, made: p.made + (err ? 0 : 1) });
      }
    };
    await Promise.all([worker(), worker()]);
    router.refresh();
  };

  const firstError = [...failed.values()][0];
  const visible = all ? students : students.slice(0, SHOWN);

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* 학생 자료 (PC 왼쪽 · 모바일 셋째) */}
      <section className="surface order-3 flex flex-col gap-3 rounded-card p-4 md:order-none md:p-6" aria-label="학생 자료">
        <div className="hidden items-center gap-2 md:flex">
          <h2 className="min-w-0 flex-1 text-[17px] font-bold">학생 자료 <span className="font-normal text-mute">{students.length}명</span></h2>
          <Chips {...counts} />
        </div>
        {students.length === 0 ? (
          <p className="rounded-inner bg-bg py-6 text-center text-[13px] text-mute">이 범위에 학생이 없어요</p>
        ) : (
          <div>
            <div className="hidden rounded-control bg-bg px-4 py-2.5 text-[13px] text-mute md:grid md:grid-cols-[56px_minmax(64px,1fr)_minmax(0,1.6fr)_88px] md:gap-3">
              <span>학번</span><span>이름</span><span>자료</span><span>상태</span>
            </div>
            <ul>
              {visible.map((s) => {
                const files = byStudent.get(s.id) ?? [];
                const st = status(s.id);
                const chip = st ? <span className={cx("whitespace-nowrap rounded-chip px-1.5 py-0.5 text-[12px] font-bold", STATUS_CHIP[st])} title={failed.get(s.id)}>{st}</span> : <span className="text-[13px] text-faint">—</span>;
                return (
                  <li key={s.id} className="flex flex-col gap-1.5 border-t border-line py-3 first:border-0 md:grid md:grid-cols-[56px_minmax(64px,1fr)_minmax(0,1.6fr)_88px] md:items-center md:gap-3 md:border-line md:px-4 md:first:border-0">
                    <span className="flex items-center gap-2 md:contents">
                      <span className="w-12 shrink-0 tabular-nums text-[13px] text-mute md:w-auto">{s.studentNo}</span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-medium md:flex-none">{s.name}</span>
                      <span className="shrink-0 md:hidden">{chip}</span>
                    </span>
                    <span className="flex min-w-0 flex-wrap gap-1">
                      {toAll && !done.has(s.id) ? <FileChip name={`모두 · ${shared!.name}`} />
                        : files.length ? files.map((u) => <FileChip key={u.key} name={u.file.name} onRemove={busy ? undefined : () => remove(u.key)} />)
                        : <span className="text-[13px] text-faint">{done.has(s.id) ? "" : <><span className="md:hidden">자료 없음</span><span className="hidden md:inline">없음</span></>}</span>}
                    </span>
                    <span className="hidden md:block">{chip}</span>
                  </li>
                );
              })}
            </ul>
            {students.length > SHOWN && (
              <button type="button" onClick={() => setAll(!all)} className="flex w-full items-center justify-center gap-1 border-t border-line pt-3 text-[13px] font-medium text-sub">
                {all ? "접기" : `${students.length - SHOWN}명 더 보기`}<ChevronDown size={14} className={all ? "rotate-180" : ""} />
              </button>
            )}
          </div>
        )}
      </section>

      {/* 오른쪽 열 (모바일은 contents 로 풀어 순서대로) */}
      <div className="contents md:flex md:flex-col md:gap-6">
      {/* 자료 올리기 */}
      <section className="surface order-2 flex flex-col gap-3 rounded-card p-4 md:order-none md:p-5" aria-label="자료 올리기">
        <h2 className="hidden text-[15px] font-bold md:block">자료 올리기</h2>
        <div className="flex gap-1 rounded-inner bg-soft p-1" role="tablist" aria-label="올리는 방식">
          {MODES.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} disabled={busy} onClick={() => setMode(k)}
              className={cx("h-8 flex-1 whitespace-nowrap rounded-control text-[13px]", mode === k ? "border border-line bg-[#fff] font-bold" : "font-medium text-mute")}>{l}</button>
          ))}
        </div>
        {mode === "all" ? (
          shared ? (
            <div className="flex items-center gap-2 rounded-inner bg-bg px-3 py-2.5">
              <FileChip name={shared.name} onRemove={busy ? undefined : () => setShared(null)} />
              <span className="ml-auto shrink-0 text-[12px] text-mute">아직 조각 없는 {students.filter((s) => !done.has(s.id)).length}명에게</span>
            </div>
          ) : (
            <UploadBox disabled={busy} onClick={() => sharedInput.current?.click()} title="모두에게 줄 자료 하나" sub="활동지 · 계획서 · 단체 결과물 — 한 번 읽고 모든 학생에게 같은 조각" />
          )
        ) : (
          <UploadBox disabled={busy} onClick={() => (mode === "split" ? setSplitOpen(true) : input.current?.click())}
            title={mode === "split" ? "합본 PDF 나누기" : "학생 자료 한꺼번에 올리기"}
            sub={mode === "split" ? "한 PDF를 번호순 · 페이지 지정으로 학생마다 나눠요" : "파일 이름에 학번이나 이름"} />
        )}
        <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" aria-label="학생 자료"
          onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <input ref={sharedInput} type="file" accept={ACCEPT} className="sr-only" aria-label="모두에게 줄 자료"
          onChange={(e) => { setShared(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        {!toAll && <span className="md:hidden"><Chips {...counts} /></span>}
        {!toAll && ups.length > 0 && <p className="hidden text-[12px] text-mute md:block">파일 {ups.length}개 · 맞춤 {ups.length - unknown.length} · 모름 {unknown.length}</p>}
        {splitOpen && (
          <PdfSplitDialog students={students.map((s) => ({ id: s.id, no: s.studentNo, name: s.name }))} onClose={() => setSplitOpen(false)}
            confirm={(n) => `${n}명 칸에 붙이기`} note="나눈 파일은 학생 칸에 붙어요 · [조각 한꺼번에 만들기]를 누르면 AI가 읽어요"
            run={async (parts) => {
              const no = new Map(students.map((s) => [s.id, `${s.studentNo} ${s.name}`]));
              const stamp = Date.now();
              setUps((cur) => [...cur, ...parts.map((p, i) => ({ key: `${stamp}-s${i}`, studentId: p.studentId,
                file: new File([p.file], `${no.get(p.studentId)} ${p.range.from}–${p.range.to}쪽.pdf`, { type: "application/pdf" }) }))]);
              return null;
            }} />
        )}
      </section>

      {/* 누구 것인지 모름 */}
      {unknown.length > 0 && !toAll && (
        <section className="surface order-4 flex flex-col gap-3 rounded-card p-4 md:order-none md:p-5" aria-label="누구 것인지 모름">
          <h2 className="text-[15px] font-bold">누구 것인지 모름 <span className="font-normal text-mute">{unknown.length}</span></h2>
          {unknown.map((u) => (
            <div key={u.key} className="flex flex-col items-start gap-2">
              <FileChip name={u.file.name} onRemove={() => remove(u.key)} />
              <label className="relative w-full">
                <select value="" onChange={(e) => assign(u.key, e.target.value)} aria-label={`${u.file.name} 학생 고르기`}
                  className="h-10 w-full appearance-none rounded-control bg-soft px-3 pr-9 text-[14px] text-sub outline-none focus:ring-2 focus:ring-key">
                  <option value="">학생 고르기</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.studentNo} {s.name}</option>)}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-3 text-mute" />
              </label>
            </div>
          ))}
        </section>
      )}

      {/* 조각 한꺼번에 만들기 (모바일 맨 위) */}
      <section className="surface order-1 flex flex-col gap-3 rounded-card p-4 md:order-none md:p-5" aria-label="조각 한꺼번에 만들기">
        <div className="flex items-center gap-2">
          <Tag tone={label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong"}>{label}</Tag>
          <h2 className="text-[15px] font-bold">조각 한꺼번에 만들기</h2>
        </div>
        {progress ? (
          <>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[14px] text-mute"><b className="text-ink">{progress.done}</b>/{progress.total} <span className="font-bold text-ink">{busy ? "만드는 중" : "끝"}</span></span>
              <span className="text-[12px] font-medium text-ok">조각 만듦 {progress.made}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <div className="h-full rounded-full bg-key transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            {busy ? (
              <Button type="button" disabled className="h-11 w-full disabled:bg-key disabled:opacity-40">만드는 중…</Button>
            ) : (
              <div className="flex items-center gap-2">
                <Link href={`/teacher/pieces${students[0] ? `?student=${students[0].id}` : ""}`} className="mr-auto whitespace-nowrap text-[13px] font-medium text-key-strong">생기부 조각 ›</Link>
                {pending.length > 0 && <Button type="button" kind="soft" size="sm" onClick={run}><Sparkles size={14} /> 남은 {pending.length}명 만들기</Button>}
              </div>
            )}
            {firstError && !busy && <p className="text-[13px] text-bad" role="alert">{failed.size}명 실패: {firstError}</p>}
          </>
        ) : (
          <>
            <p className="text-[13px] font-medium text-sub">자료 {pendingFiles}개 → 조각 {pending.length}개</p>
            <p className="truncate rounded-inner bg-bg px-3 py-2.5 text-[13px] text-sub">[{activity.name}] {activity.description || "학생 자료로 한두 문장"} …</p>
            <Button type="button" disabled={!pending.length} onClick={run} className="h-11 w-full disabled:bg-key disabled:opacity-40">
              <Sparkles size={14} /> 조각 한꺼번에 만들기
            </Button>
          </>
        )}
      </section>
      </div>
    </div>
  );
}
