"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CalendarDays, Check, ChevronDown, ChevronRight, FileUp, Search, Trash2, X } from "lucide-react";
import { cx } from "@/components/ui";
import { ACTIVITY_MAX, cleanActivity } from "@/lib/domain/activity-name";
import { shortMd } from "@/lib/domain/log-date";
import { sortStudents, todayCount, type CollectStudent, type RecentPiece, findStudents } from "@/lib/domain/collect";
import { prepareUpload } from "@/lib/client/shrink-upload";
import { ACCEPT } from "./evidence-files";
import { addSetukPieces, polishSetukMemo, readSetukCollectFile } from "@/app/(app)/teacher/setuk/actions";
import { addLogs, polishLogMemo, readLogFile } from "@/app/(app)/teacher/logs/actions";
import { deleteMyPieces } from "@/app/(app)/teacher/piece-actions";

// 조각 모으기 (Figma N52 a 599:17196 · g2 599:17565 · 모바일 600:10311): 조각만 남기는 곳 — 바이트 이야기는 없다.
// 받는 학생(여러 명, 학생마다 조각 수) → 활동명 · 날짜 · 메모 → [AI 다듬기](전 · 후 → 이걸로 바꾸기) → "n명에게 남기기".
// 남기면 메모 칸만 비우고 받는 학생 · 활동명 · 날짜는 그대로 둔다(이어서 남기기). 오른쪽: 최근 조각 · 학생별 조각(적은 순).
// 저장은 그대로: 세특 = 학생마다 조각 메모(addSetukPieces), 동아리 · 담임 = 누가기록(addLogs).
// [메모 | 자료] (N60): 자료 = 활동지 · 보고서 · 사진 → AI가 읽은 요약이 메모 칸에 들어가고(고쳐 쓸 수 있음) 같은 버튼으로 남긴다. 세특은 "자료" 조각으로.

export type CollectTarget =
  | { kind: "setuk"; courseId: string }
  | { kind: "log"; area: string; clubId?: string };

type Polish = { ok: true; text: string; label: "AI" | "자동"; notice?: string } | { ok: false; error: string };

const PC_SHOWN = 12;
const M_SHOWN = 6;

export function CollectBoard({ target, students, recent, composeHref, today, withDate, preselect = [], areas, aiOn }: {
  target: CollectTarget;
  students: CollectStudent[];
  recent: RecentPiece[];
  /** 학생 id → 그 학생 글 짓기 */
  composeHref: string;
  today: string;
  /** 누가기록만 날짜가 있다 (세특 조각은 남긴 날) */
  withDate: boolean;
  preselect?: string[];
  /** 담임 누가기록: 남길 영역 (자율·자치 | 진로) */
  areas?: { value: string; label: string }[];
  aiOn: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(preselect.filter((id) => students.some((s) => s.id === id))));
  const [more, setMore] = useState(false);
  const [find, setFind] = useState("");
  const [activity, setActivity] = useState("");
  const [date, setDate] = useState(today);
  const [area, setArea] = useState(areas?.[0]?.value ?? (target.kind === "log" ? target.area : ""));
  const [memo, setMemo] = useState("");
  const [polish, setPolish] = useState<{ memo: string; r: Polish } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, start] = useTransition();
  const [sort, setSort] = useState<"few" | "no">("few");
  const [allRows, setAllRows] = useState(false);
  const [mode, setMode] = useState<"memo" | "file">("memo");
  const [file, setFile] = useState<File | null>(null);
  const [fromFile, setFromFile] = useState(false);
  const [drag, setDrag] = useState(false);

  const n = picked.size;
  const activityOk = !!cleanActivity(activity);
  const ready = n > 0 && memo.trim().length >= 5 && activityOk;
  const toggle = (id: string) => { setMsg(null); setPicked((p) => { const x = new Set(p); if (x.has(id)) x.delete(id); else x.add(id); return x; }); };
  const sorted = useMemo(() => sortStudents(students, sort), [students, sort]);
  const logArea = target.kind === "log" ? (areas ? area : target.area) : "";

  const runPolish = () => start(async () => {
    const m = memo;
    try {
      const r = target.kind === "setuk"
        ? await polishSetukMemo({ courseId: target.courseId, text: m })
        : await polishLogMemo({ area: logArea, clubId: target.clubId, text: m });
      setPolish({ memo: m, r });
    } catch {
      setPolish({ memo: m, r: { ok: false, error: "다듬지 못했어요. 직접 써 주세요" } });
    }
  });
  const shownPolish = polish && polish.memo === memo ? polish : null;

  // 조각 지우기 (2026-10-22): 내가 쓴 조각만 — 여러 학생에게 한 번에 남긴 줄은 그 학생들 것 모두
  const removePiece = (r: RecentPiece) => {
    if (!r.ids.length || busy) return;
    if (!window.confirm(r.n > 1 ? `이 조각을 ${r.n}명 모두에게서 지울까요?` : "이 조각을 지울까요?")) return;
    start(async () => {
      const res = await deleteMyPieces(target.kind === "setuk" ? { memoIds: r.ids } : { logIds: r.ids }).catch(() => ({ ok: false as const, error: "지우지 못했어요" }));
      setMsg(res.ok ? { ok: true, text: `조각을 지웠어요 (${res.n}개)` } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  };

  const readFile = () => file && start(async () => {
    setMsg(null);
    try {
      const texts: string[] = [];
      for (const part of await prepareUpload(file)) {
        const fd = new FormData();
        fd.set("file", part);
        if (target.kind === "setuk") fd.set("courseId", target.courseId);
        else { fd.set("area", logArea); if (target.clubId) fd.set("clubId", target.clubId); }
        const r = target.kind === "setuk" ? await readSetukCollectFile(fd) : await readLogFile(fd);
        if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
        texts.push(r.text);
      }
      setMemo([memo.trim(), texts.join(" ").trim()].filter(Boolean).join(" ").slice(0, 1000));
      setFromFile(true);
      setMsg({ ok: true, text: "자료를 읽었어요 · 요약을 고쳐 쓴 뒤 남겨요" });
    } catch {
      setMsg({ ok: false, text: "자료를 읽지 못했어요. 다시 해 주세요" });
    }
  });

  const submit = () => {
    setTouched(true);
    if (!ready || busy) return;
    start(async () => {
      const ids = [...picked];
      let error: string | undefined;
      let added = 0;
      try {
        if (target.kind === "setuk") {
          const r = await addSetukPieces({ courseId: target.courseId, studentIds: ids, text: memo, activity, kind: mode === "file" && fromFile ? "file" : "memo" });
          error = r.error; added = r.added ?? 0;
        } else {
          const fd = new FormData();
          fd.set("area", logArea);
          if (target.clubId) fd.set("clubId", target.clubId);
          fd.set("studentIds", JSON.stringify(ids));
          fd.set("date", withDate ? date : today);
          fd.set("activity", activity);
          fd.set("content", memo);
          const r = await addLogs({}, fd);
          error = r.error; added = r.added ?? 0;
        }
      } catch {
        error = "남기지 못했어요. 잠시 뒤 다시 해 주세요";
      }
      if (error) { setMsg({ ok: false, text: error }); return; }
      setMsg({ ok: true, text: `${added}명에게 남겼어요` });
      setMemo("");
      setPolish(null);
      setTouched(false);
      setFile(null);
      setFromFile(false);
      router.refresh();
    });
  };

  const btn = (full: boolean) => (
    <button type="button" onClick={submit} disabled={busy}
      className={cx("inline-flex items-center justify-center whitespace-nowrap rounded-control text-[15px] font-bold",
        full ? "h-12 w-full" : "h-11 w-[180px]",
        ready ? "bg-key text-white hover:bg-key-strong" : "bg-hair text-mute")}>
      {busy ? "남기는 중…" : n > 0 ? `${n}명에게 남기기` : "남기기"}
    </button>
  );

  const shown = findStudents(students, find);
  return (
    // 두 칸은 화면 폭이 아니라 본문 폭으로 (영랑이 사이드 창이 열려 좁아지면 한 칸) — Tailwind 컨테이너 쿼리
    <div className="@container">
    <div className="grid items-stretch gap-3.5 pb-24 md:gap-5 md:pb-0 @4xl:grid-cols-[minmax(0,1fr)_400px] [&>*]:min-w-0">
      {/* 조각 남기기 */}
      <section className="surface flex flex-col gap-4 rounded-card p-4 md:p-6">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold">받는 학생</h2>
          <span className={cx("rounded-chip px-2 py-0.5 text-[12px] font-bold", n ? "bg-key-soft text-key-strong" : "bg-soft text-mute")}>{n}명</span>
          <span className="flex-1" />
          {students.length > 8 && (
            <label className="flex h-8 w-[150px] items-center gap-1.5 rounded-control border border-line bg-[#fff] px-2.5 md:w-[200px]">
              <Search size={13} className="shrink-0 text-mute" aria-hidden />
              <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="학번 · 이름 찾기" aria-label="학생 찾기"
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
              {find && <button type="button" onClick={() => setFind("")} aria-label="찾기 지우기" className="text-faint hover:text-ink"><X size={13} /></button>}
            </label>
          )}
          {/* 찾는 중이면 '모두'는 찾은 학생만 더한다 */}
          <button type="button" onClick={() => { setMsg(null); setPicked(find.trim() ? new Set([...picked, ...shown.map((s) => s.id)]) : new Set(students.map((s) => s.id))); }} className="px-1.5 text-[13px] font-medium text-sub">모두</button>
          <button type="button" onClick={() => { setMsg(null); setPicked(new Set()); }} className="px-1.5 text-[13px] font-medium text-sub">비우기</button>
        </div>

        {students.length === 0 ? (
          <p className="rounded-inner bg-bg px-4 py-6 text-center text-[13px] text-mute">명단에 학생이 없어요</p>
        ) : (
          <div>
            {shown.length === 0 && <p className="rounded-inner bg-bg px-4 py-5 text-center text-[13px] text-mute">&quot;{find.trim()}&quot; 학생이 없어요</p>}
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {shown.map((s, i) => {
                const on = picked.has(s.id);
                // 찾는 중에는 찾은 학생을 다 보여 준다
                const hide = !more && !find.trim() && (i >= PC_SHOWN ? "hidden" : i >= M_SHOWN ? "hidden md:block" : "");
                return (
                  <li key={s.id} className={cx(hide || "")}>
                    <button type="button" onClick={() => toggle(s.id)} aria-pressed={on}
                      className={cx("flex h-11 w-full items-center gap-2 rounded-control border px-3 text-left",
                        on ? "border-key bg-key-soft" : "border-hair bg-[#fff] hover:bg-soft")}>
                      <span className={cx("flex size-[18px] shrink-0 items-center justify-center rounded-[6px]", on ? "bg-key text-white" : "border-[1.5px] border-faint bg-white")}>
                        {on && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className="shrink-0 text-[12px] font-medium text-mute">{s.no}</span>
                      <span className={cx("min-w-0 flex-1 truncate text-[14px] font-bold", on && "text-key-strong")}>{s.name}</span>
                      <span className="shrink-0 text-[12px] font-medium text-mute" aria-label={`조각 ${s.count}개`}>{s.count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!more && !find.trim() && students.length > M_SHOWN && (
              <button type="button" onClick={() => setMore(true)}
                className={cx("mt-2.5 inline-flex items-center gap-1 px-1 text-[13px] font-bold text-key-strong", students.length <= PC_SHOWN && "md:hidden")}>
                <span className="md:hidden">{students.length - M_SHOWN}명 더 보기</span>
                <span className="hidden md:inline">{students.length - PC_SHOWN}명 더 보기</span>
                <ChevronDown size={14} />
              </button>
            )}
          </div>
        )}

        {areas && (
          <div className="flex gap-1.5" role="radiogroup" aria-label="영역">
            {areas.map((a) => (
              <button key={a.value} type="button" role="radio" aria-checked={area === a.value} onClick={() => setArea(a.value)}
                className={cx("h-9 rounded-control px-3.5 text-[14px]", area === a.value ? "bg-key-soft font-bold text-key-strong" : "bg-soft font-medium text-sub")}>
                {a.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 md:flex-row">
          <label className={cx("flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-control bg-soft px-3.5", touched && !activityOk && "ring-2 ring-bad")}>
            <span className="shrink-0 text-[13px] font-medium text-mute">활동명</span>
            <input value={activity} onChange={(e) => setActivity(e.target.value)} maxLength={ACTIVITY_MAX} placeholder="예: 빗면 실험"
              className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-faint" />
          </label>
          {withDate && (
            <label className="relative flex h-11 shrink-0 items-center gap-2 rounded-control border border-hair bg-[#fff] px-3 md:w-[150px]">
              <CalendarDays size={16} className="text-sub" />
              <span className="flex-1 text-[14px] font-medium">{shortMd(date)}{date === today ? " 오늘" : ""}</span>
              <ChevronDown size={14} className="text-mute" />
              <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="날짜"
                className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          )}
        </div>

        <div className="flex gap-1 self-start rounded-inner bg-soft p-1" role="tablist" aria-label="남길 것">
          {([["memo", "메모"], ["file", "자료"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setMsg(null); }}
              className={cx("h-8 rounded-control px-4 text-[14px]", mode === k ? "border border-line bg-[#fff] font-bold" : "font-medium text-mute")}>{l}</button>
          ))}
        </div>

        {mode === "file" && (file ? (
          <div className="flex items-center gap-2 rounded-control border border-hair bg-[#fff] px-3.5 py-2.5">
            <FileUp size={16} className="shrink-0 text-key-strong" />
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{file.name}</span>
            <button type="button" onClick={readFile} disabled={busy}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong disabled:opacity-50">
              <span className="rounded-[6px] bg-new-soft px-1.5 py-0.5 text-[11px] font-bold text-new">{aiOn ? "AI" : "자동"}</span>{busy ? "읽는 중…" : fromFile ? "다시 읽기" : "읽기"}
            </button>
            <button type="button" aria-label="자료 빼기" onClick={() => { setFile(null); setFromFile(false); }} className="shrink-0 text-mute"><X size={15} /></button>
          </div>
        ) : (
          <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
            className={cx("flex cursor-pointer flex-col items-center gap-1 rounded-control border border-dashed px-4 py-5 text-center", drag ? "border-key bg-key-soft" : "border-faint bg-[#fff] hover:bg-soft")}>
            <span className="flex items-center gap-1.5 text-[14px] font-bold text-key-strong"><FileUp size={16} /> 활동 자료 올리기</span>
            <span className="text-[12px] text-mute">활동지 · 보고서 · 발표 자료 · 사진 (PDF · 이미지 · hwpx · pptx · txt) · AI가 읽어 요약만 남겨요 · 파일은 저장하지 않아요</span>
            <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ""; }} />
          </label>
        ))}

        <div className="relative">
          <textarea value={memo} onChange={(e) => { setMemo(e.target.value); setMsg(null); }} placeholder={mode === "file" ? "자료를 읽으면 요약이 여기 들어가요 · 고쳐 쓸 수 있어요" : "본 것을 한두 줄로"} maxLength={1000}
            className="block h-[132px] w-full resize-none rounded-control bg-soft px-3.5 py-3 text-[15px] leading-6 outline-none placeholder:text-faint md:h-[120px]" />
          <span className="pointer-events-none absolute bottom-2 right-3 text-[12px] text-mute">{memo.length}자</span>
        </div>

        {shownPolish && (
          shownPolish.r.ok ? (
            <div className="flex flex-col gap-2 rounded-inner border border-hair bg-[#fff] p-3.5">
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-sub">
                <span className="rounded-[6px] bg-new-soft px-1.5 py-0.5 text-[11px] text-new">{shownPolish.r.label}</span> 다듬은 글
              </div>
              <p className="text-[13px] leading-5 text-mute line-through decoration-faint">{shownPolish.memo}</p>
              <p className="text-[14px] leading-6">{shownPolish.r.text}</p>
              {shownPolish.r.notice && <p className="text-[12px] text-mute">{shownPolish.r.notice}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setPolish(null)} className="h-9 rounded-control px-3 text-[13px] font-medium text-sub">그대로 두기</button>
                <button type="button" onClick={() => { const t = (shownPolish.r as { text: string }).text; setMemo(t); setPolish(null); }}
                  className="h-9 rounded-control bg-key-soft px-3.5 text-[13px] font-bold text-key-strong">이걸로 바꾸기</button>
              </div>
            </div>
          ) : <p className="rounded-inner bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad">{shownPolish.r.error}</p>
        )}

        {msg && <p role="status" className={cx("text-[13px] font-medium", msg.ok ? "text-ok" : "text-bad")}>{msg.ok ? "✓ " : ""}{msg.text}</p>}
        {touched && !ready && !msg && (
          <p className="text-[13px] text-bad">{n === 0 ? "받는 학생을 골라 주세요" : !activityOk ? "활동명을 적어 주세요" : "본 것을 다섯 글자 넘게 적어 주세요"}</p>
        )}

        <div className="mt-auto flex items-center gap-2">
          <button type="button" onClick={runPolish} disabled={busy || memo.trim().length < 2}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border border-hair bg-[#fff] px-3.5 text-[14px] font-medium disabled:opacity-50 md:h-10">
            <span className="rounded-[6px] bg-new-soft px-1.5 py-0.5 text-[11px] font-bold text-new">{aiOn ? "AI" : "자동"}</span> 다듬기
          </button>
          <span className="flex-1" />
          <span className="hidden md:block">{btn(false)}</span>
        </div>
      </section>

      {/* 모바일: 탭 막대 위에 붙는 남기기 */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+66px)] z-10 border-t border-line bg-white px-4 py-3 md:hidden">{btn(true)}</div>

      <div className="flex flex-col gap-3.5 md:gap-5">
        <section className="surface rounded-card p-4 md:p-6">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-[17px] font-bold">최근 조각</h2>
            {todayCount(recent, today) > 0 && <span className="rounded-chip bg-soft px-2 py-0.5 text-[12px] font-bold text-sub">오늘 {todayCount(recent, today)}</span>}
          </div>
          {recent.length === 0 ? <p className="py-4 text-[13px] text-mute">아직 남긴 조각이 없어요</p> : (
            <ul className="divide-y divide-line">
              {recent.map((r, i) => (
                <li key={r.key} className={cx("flex flex-col gap-1 py-3", i >= 3 && "max-md:hidden")}>
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="text-[12px] text-mute">{shortMd(r.date)}</span>
                    <b className="min-w-0 flex-1 truncate">{r.activity || "조각"}</b>
                    <span className="shrink-0 text-[12px] font-medium text-sub">{r.who}</span>
                    {r.ids.length > 0 && (
                      <button type="button" onClick={() => removePiece(r)} disabled={busy} aria-label={`${r.activity || "조각"} 지우기`} title="지우기"
                        className="-my-1 shrink-0 rounded-control p-1 text-faint hover:bg-bad-soft hover:text-bad disabled:opacity-40"><Trash2 size={14} /></button>
                    )}
                  </div>
                  <p className="truncate text-[13px] text-sub">{r.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface rounded-card p-4 md:p-6">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="flex-1 text-[17px] font-bold">학생별 조각</h2>
            <label className="relative inline-flex h-8 items-center gap-1 rounded-control bg-soft px-2.5 text-[13px] font-medium text-sub">
              {sort === "few" ? "적은 순" : "번호 순"} <ChevronDown size={14} />
              <select value={sort} onChange={(e) => setSort(e.target.value as "few" | "no")} aria-label="정렬" className="absolute inset-0 cursor-pointer opacity-0">
                <option value="few">적은 순</option>
                <option value="no">번호 순</option>
              </select>
            </label>
          </div>
          <ul>
            {sorted.map((s, i) => (
              <li key={s.id} className={cx("flex h-11 items-center gap-2", !allRows && (i >= 6 ? "hidden" : i >= 4 ? "max-md:hidden" : ""))}>
                <span className="w-11 shrink-0 text-[12px] font-medium text-mute">{s.no}</span>
                <b className="truncate text-[14px]">{s.name}</b>
                <span className={cx("shrink-0 rounded-[6px] px-1.5 py-0.5 text-[12px] font-bold", s.count === 0 ? "bg-due-soft text-due" : "bg-soft text-sub")}>조각 {s.count}</span>
                <span className="flex-1" />
                <Link href={`${composeHref}&student=${s.id}`} className="inline-flex items-center gap-0.5 whitespace-nowrap text-[13px] font-bold text-key-strong">글 짓기 <ChevronRight size={14} /></Link>
              </li>
            ))}
          </ul>
          {!allRows && students.length > 4 && (
            <button type="button" onClick={() => setAllRows(true)} className={cx("mt-1 inline-flex items-center gap-1 text-[13px] font-bold text-key-strong", students.length <= 6 && "md:hidden")}>
              {students.length}명 모두 보기 <ChevronDown size={14} />
            </button>
          )}
        </section>
      </div>
    </div>
    </div>
  );
}
