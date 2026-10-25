"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, FileUp, PencilLine, Plus, Sparkles, Upload, X } from "lucide-react";
import { Button, ButtonLink, cx } from "@/components/ui";
import { ASSESS_LIMITS, type AssessmentKind } from "@/lib/domain/assessment";
import { emptyRubric, parseRubric, rubricTotal, type Rubric } from "@/lib/domain/rubric";
import { prepareUpload } from "@/lib/client/shrink-upload";
import { PdfSplitDialog } from "@/components/writing/pdf-split-dialog";
import { ACCEPT } from "@/components/writing/evidence-files";
import { ShareToRoomButton } from "@/components/collab-share";
import { roomAssessments } from "@/app/(app)/collab/actions";
import { deleteAssessment, listSameSubjectAssessments, readAssessmentFile, readAssessPlanFile, saveAssessment, type SharedAssessment } from "./actions";
import { RubricEditor, RubricPanel, Shell, gradeFor, type GradeView } from "./rubric-ui";

// 세특 · 수행평가 (Figma N59): 목록 · 고른 수행평가 칸 · 등록 창 · 한 명씩 올리기 · 합본 PDF 나누기(번호순 | 페이지 지정).
// 나누기는 브라우저에서 하고(큰 합본도 됨), 학생마다 한 파일씩 서버가 AI로 읽어 요약만 조각으로 남긴다.
// 루브릭 채점 (N72): 등록 창에서 [자료 요약 | 루브릭 채점]을 고른다. 루브릭이면 칸 · 채점 창은 rubric-ui.tsx.

type Item = { id: string; title: string; date: string; description: string; kind: AssessmentKind; done: number };
type Sel = { id: string; title: string; date: string; description: string; kind: AssessmentKind; rubric: Rubric | null };
type Stu = { id: string; no: string; name: string; summary: string | null; grade: GradeView | null };

const dot = (d: string) => `${Number(d.slice(5, 7))}. ${Number(d.slice(8, 10))}.`;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

/** 한 학생 파일(크면 쪽을 나눠 여러 번) → 요약 조각 */
async function readFor(assessmentId: string, studentId: string, file: File): Promise<string | null> {
  for (const part of await prepareUpload(file)) {
    const fd = new FormData();
    fd.set("assessmentId", assessmentId);
    fd.set("studentId", studentId);
    fd.set("file", part);
    const r = await readAssessmentFile(fd);
    if (!r.ok) return r.error;
  }
  return null;
}

export function NewAssessButton({ courseId, section, base, aiOn }: { courseId: string; section: string | null; base: string; aiOn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> <span className="md:hidden">등록</span><span className="hidden md:inline">수행평가 등록</span></Button>
      {open && <RegisterDialog courseId={courseId} section={section} base={base} aiOn={aiOn} onClose={() => setOpen(false)} />}
    </>
  );
}

export function AssessBoard({ base, aiOn, courseId, section, items, selected, total, students, composeHref }: {
  base: string; aiOn: boolean; courseId: string; section: string | null; items: Item[]; selected: Sel | null; total: number; students: Stu[]; composeHref: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "edit" | "one" | "split">(null);
  const [who, setWho] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  if (!items.length) {
    return (
      <div className="surface flex flex-col items-center gap-2 rounded-card px-4 py-10 text-center">
        <p className="text-[16px] font-bold">이 반에 등록한 수행평가가 없어요</p>
        <p className="text-[13px] text-sub">수행평가를 등록하고 학생 자료를 올리면 AI가 읽어 글 짓기 조각으로 넣어요</p>
      </div>
    );
  }
  const done = students.filter((s) => s.summary).length;
  const pick = students.find((s) => s.id === who) ?? students.find((s) => s.summary) ?? null;
  const remove = () => selected && start(async () => {
    const r = await deleteAssessment(selected.id);
    if (!r.ok) return setError(r.error);
    router.push(base);
  });
  return (
    <div className="grid items-start gap-4 md:grid-cols-[minmax(260px,376px)_minmax(0,1fr)] md:gap-6">
      <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none] md:flex-col md:overflow-visible">
        {items.map((a) => {
          const on = a.id === selected?.id;
          return (
            <li key={a.id} className="shrink-0 md:shrink">
              <Link href={`${base}&a=${a.id}`} aria-current={on ? "true" : undefined}
                className={cx("flex flex-col gap-1 whitespace-nowrap rounded-inner px-4 py-3 md:whitespace-normal md:py-3.5", on ? "bg-key-soft" : "bg-[#fff] hover:bg-soft")}>
                <span className={cx("text-[15px] font-bold", on && "text-key-strong")}>{a.title}</span>
                <span className="text-[13px] text-mute">{dot(a.date)} · {a.kind === "rubric" ? `루브릭 · 확정 ${a.done}` : `자료 ${a.done}`} / {total}명</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {selected && (
        <section className="surface flex flex-col gap-3.5 rounded-card p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
            <h2 className="min-w-0 truncate text-[18px] font-bold max-md:w-full">{selected.title}</h2>
            <span className="shrink-0 rounded-chip bg-soft px-1.5 py-px text-[12px] font-bold text-sub">{dot(selected.date)}</span>
            {selected.rubric && <span className="shrink-0 rounded-chip bg-key-soft px-1.5 py-px text-[12px] font-bold text-key-strong">루브릭 · {rubricTotal(selected.rubric)}점</span>}
            <span className="flex-1" />
            <ShareToRoomButton preset={{ kind: "수행평가", title: selected.title, body: selected.description, meta: { date: selected.date } }} className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-sub hover:text-ink" />
            <button type="button" onClick={() => setDialog("edit")} className="shrink-0 text-[13px] font-medium text-sub hover:text-ink">고치기</button>
            <button type="button" onClick={remove} disabled={pending} className="shrink-0 text-[13px] font-medium text-bad">지우기</button>
          </div>
          {selected.description && <p className="whitespace-pre-line text-[13px] leading-5 text-sub">{selected.description}</p>}
          {selected.kind === "rubric" && selected.rubric ? (
            <RubricPanel a={{ id: selected.id, title: selected.title, rubric: selected.rubric }} total={total} aiOn={aiOn} composeHref={composeHref} onSplit={() => setDialog("split")}
              students={students.map((s) => ({ id: s.id, no: s.no, name: s.name, grade: s.grade }))} />
          ) : (<>
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-bold">자료</span>
            <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-soft"><span className="block h-full rounded-full bg-key" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
            <span className="text-[13px] font-bold tabular-nums text-key-strong">{done} / {total}명</span>
          </div>
          {!aiOn && <p className="rounded-control bg-wait-soft px-3 py-2 text-[12px] text-[#9a6400]">AI가 꺼져 있어 글자 파일(hwpx · pptx · txt)만 앞부분을 그대로 넣어요</p>}
          <div className="flex flex-col gap-2 md:flex-row">
            <Button type="button" className="md:flex-none" onClick={() => setDialog("split")}><Upload size={15} /> 합본 PDF 나누기</Button>
            <Button type="button" kind="outline" className="md:flex-none" onClick={() => { setWho(null); setDialog("one"); }}>학생 자료 한 명씩</Button>
            <span className="hidden flex-1 md:block" />
            <ButtonLink href={composeHref} kind="soft" className="md:flex-none"><PencilLine size={15} /> 글 짓기</ButtonLink>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {students.map((s) => (
              <button key={s.id} type="button" onClick={() => (s.summary ? setWho(s.id) : (setWho(s.id), setDialog("one")))}
                className={cx("flex h-11 items-center gap-2 rounded-control border px-3 text-left", s.summary ? "border-line bg-[#fff]" : "border-line bg-bg", pick?.id === s.id && s.summary && "border-key")}>
                <span className="shrink-0 text-[12px] font-medium text-mute">{s.no}</span>
                <span className={cx("min-w-0 flex-1 truncate text-[14px] font-bold", !s.summary && "text-mute")}>{s.name}</span>
                <span className={cx("shrink-0 rounded-chip px-1.5 py-px text-[11px] font-bold", s.summary ? "bg-ok-soft text-ok" : "bg-key-soft text-key-strong")}>{s.summary ? "✓ 자료" : "올리기"}</span>
              </button>
            ))}
          </div>
          {pick?.summary && (
            <div className="flex flex-col gap-1.5 rounded-control bg-bg px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[13px] font-bold">
                <span className="rounded-chip bg-new-soft px-1.5 text-[11px] font-bold text-new">AI</span>{pick.no} {pick.name} 자료 요약
                <span className="ml-auto text-[12px] font-medium text-ok">조각으로 들어감</span>
              </p>
              <p className="whitespace-pre-line text-[13px] leading-5 text-[#333d4b]">{pick.summary}</p>
            </div>
          )}
          </>)}
          {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        </section>
      )}

      {selected && dialog === "edit" && <RegisterDialog item={selected} courseId={courseId} section={section} base={base} aiOn={aiOn} onClose={() => setDialog(null)} />}
      {selected && dialog === "one" && <OneDialog assessmentId={selected.id} students={students} first={who} onClose={() => setDialog(null)} />}
      {selected && dialog === "split" && <SplitDialog assessmentId={selected.id} rubric={selected.kind === "rubric"} students={students} onClose={() => setDialog(null)} />}
    </div>
  );
}

type PlanPick = { title: string; date: string | null; description: string; who?: string; where?: string; rubric?: Rubric | null };

function RegisterDialog({ courseId, section, item, base, aiOn, onClose }: { courseId?: string; section?: string | null; item?: Sel; base: string; aiOn?: boolean; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(item?.title ?? "");
  const [date, setDate] = useState(item?.date ?? today());
  const [description, setDescription] = useState(item?.description ?? "");
  // 종류 (N72): 등록할 때만 고른다 — 고칠 때는 처음 종류 그대로
  const [kind, setKind] = useState<AssessmentKind>(item?.kind ?? "summary");
  const [rubric, setRubric] = useState<Rubric>(() => item?.rubric ?? emptyRubric());
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  // 계획서 AI 읽기 · 같은 과목 가져오기 (2026-10-22): 고르면 칸을 채운다. 저장은 등록을 눌러야
  const [picks, setPicks] = useState<{ from: "ai" | "same" | "room"; list: PlanPick[] } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const fill = (x: PlanPick) => {
    setTitle(x.title); if (x.date) setDate(x.date); setDescription(x.description); setPicks(null);
    const rb = x.rubric ? parseRubric(x.rubric) : null;
    if (rb && !item) { setKind("rubric"); setRubric(rb); }
  };
  const readPlan = (f: File) => start(async () => {
    setError("");
    const fd = new FormData();
    fd.set("courseId", courseId ?? ""); fd.set("section", section ?? ""); fd.set("file", f);
    const r = await readAssessPlanFile(fd).catch(() => ({ ok: false as const, error: "읽지 못했어요" }));
    if (!r.ok) return setError(r.error);
    if (r.items.length === 1) fill(r.items[0]); else setPicks({ from: "ai", list: r.items });
  });
  const loadSame = () => start(async () => {
    setError("");
    const list: SharedAssessment[] = await listSameSubjectAssessments(courseId ?? "", section ?? null).catch(() => []);
    if (!list.length) return setError("같은 과목에 등록된 수행평가가 아직 없어요");
    setPicks({ from: "same", list });
  });
  const loadRooms = () => start(async () => {
    setError("");
    const list = await roomAssessments().catch(() => []);
    if (!list.length) return setError("든 협업방에 올린 수행평가가 아직 없어요");
    setPicks({ from: "room", list });
  });
  const saveAll = () => picks && start(async () => {
    setError("");
    let last = "";
    for (const x of picks.list) {
      const r = await saveAssessment({ courseId: courseId ?? "", section: section ?? null, title: x.title, date: x.date ?? today(), description: x.description });
      if (!r.ok) return setError(`${x.title}: ${r.error}`);
      last = r.id;
    }
    onClose();
    router.push(`${base}&a=${last}`);
  });
  const save = () => start(async () => {
    setError("");
    const r = await saveAssessment({ id: item?.id, courseId: courseId ?? "", section: section ?? null, title, date, description, kind, rubric: kind === "rubric" ? rubric : null });
    if (!r.ok) return setError(r.error);
    onClose();
    router.push(`${base}&a=${r.id}`);
  });
  const field = "h-11 rounded-control bg-soft px-3 text-[15px] text-ink outline-none focus:ring-2 focus:ring-key";
  return (
    <Shell title={item ? "수행평가 고치기" : "수행평가 등록"} onClose={onClose} wide={kind === "rubric"} footer={<>
      <Button type="button" kind="outline" className="flex-1 md:flex-none" onClick={onClose}>취소</Button>
      <Button type="button" className="flex-1 md:flex-none" disabled={pending} onClick={save}>{pending ? "저장 중…" : item ? "고치기" : "등록"}</Button>
    </>}>
      {!item && (
        <div className="flex rounded-control bg-soft p-[3px]" role="tablist" aria-label="수행평가 종류">
          {([["summary", "자료 요약"], ["rubric", "루브릭 채점"]] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
              className={cx("h-9 flex-1 rounded-[6px] text-[14px]", kind === k ? "border border-line bg-[#fff] font-bold text-key-strong" : "font-medium text-sub")}>{l}</button>
          ))}
        </div>
      )}
      {!item && courseId && (
        <div className="flex flex-wrap gap-2">
          {aiOn && <button type="button" onClick={() => file.current?.click()} disabled={pending} className="flex h-9 items-center gap-1.5 rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong disabled:opacity-50"><Sparkles size={14} /> 계획서로 채우기 (AI)</button>}
          <button type="button" onClick={loadSame} disabled={pending} className="flex h-9 items-center gap-1.5 rounded-control bg-soft px-3 text-[13px] font-bold text-sub hover:text-ink disabled:opacity-50"><Copy size={14} /> 같은 과목에서 가져오기</button>
          <button type="button" onClick={loadRooms} disabled={pending} className="flex h-9 items-center gap-1.5 rounded-control bg-ok-soft px-3 text-[13px] font-bold text-ok disabled:opacity-50">협업방에서 가져오기</button>
          <input ref={file} type="file" hidden accept=".pdf,.hwpx,.pptx,.txt,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) readPlan(f); e.target.value = ""; }} />
          {pending && <span className="self-center text-[12px] text-mute">{picks ? "" : "읽는 중…"}</span>}
        </div>
      )}
      {picks && (
        <div className="flex flex-col gap-1.5 rounded-inner bg-bg p-2">
          <p className="flex items-center px-1 text-[12px] font-bold text-sub">
            {picks.from === "ai" ? <><FileUp size={13} className="mr-1" /> 계획서에서 {picks.list.length}개를 찾았어요 — 하나를 고르거나 모두 등록</> : picks.from === "room" ? "협업방 수행평가 — 고르면 칸에 채워져요" : "같은 과목 수행평가 — 고르면 칸에 채워져요"}
            <button type="button" onClick={() => setPicks(null)} className="ml-auto text-mute hover:text-ink" aria-label="닫기"><X size={14} /></button>
          </p>
          <ul className="flex max-h-[260px] flex-col gap-1 overflow-y-auto">
            {picks.list.map((x, i) => (
              <li key={i}>
                <button type="button" onClick={() => fill(x)} className="flex w-full flex-col gap-0.5 rounded-control bg-[#fff] px-3 py-2 text-left hover:bg-key-soft">
                  <span className="flex min-w-0 items-center gap-1.5 text-[14px] font-bold"><span className="truncate">{x.title}</span>{x.date && <span className="shrink-0 text-[12px] font-medium text-mute">{x.date}</span>}</span>
                  {x.who && <span className="text-[12px] text-mute">{x.who} · {x.where}</span>}
                  {x.description && <span className="line-clamp-2 text-[12px] leading-5 text-sub">{x.description}</span>}
                </button>
              </li>
            ))}
          </ul>
          {picks.from === "ai" && picks.list.length > 1 && <Button type="button" size="sm" kind="soft" disabled={pending} onClick={saveAll}>{picks.list.length}개 모두 등록</Button>}
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_148px] gap-2 md:grid-cols-[1fr_170px] md:gap-3">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">이름<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={ASSESS_LIMITS.title} placeholder="예: 빗면 실험 보고서" className={field} /></label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">날짜<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} /></label>
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">{kind === "rubric" ? "과제 · 평가 내용 (선택)" : "평가 내용 · 기준 (선택)"}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={ASSESS_LIMITS.description} rows={kind === "rubric" ? 2 : 4}
          placeholder={kind === "rubric" ? "무엇을 하는 과제인지 — AI가 루브릭을 만들고 답안을 읽을 때 참고해요" : "무엇을 했고 어떻게 평가했는지 — AI가 학생 자료를 읽을 때 참고해요"}
          className="resize-y rounded-control bg-soft px-3 py-2.5 text-[14px] leading-6 text-ink outline-none focus:ring-2 focus:ring-key" />
      </label>
      {kind === "rubric" && courseId && <RubricEditor courseId={courseId} section={section ?? null} title={title} description={description} rubric={rubric} setRubric={setRubric} aiOn={!!aiOn} />}
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
    </Shell>
  );
}

function OneDialog({ assessmentId, students, first, onClose }: { assessmentId: string; students: Stu[]; first: string | null; onClose: () => void }) {
  const router = useRouter();
  const [who, setWho] = useState(first ?? students.find((s) => !s.summary)?.id ?? students[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const go = () => file && start(async () => {
    setError("");
    const e = await readFor(assessmentId, who, file);
    if (e) return setError(e);
    onClose();
    router.refresh();
  });
  return (
    <Shell title="학생 자료 한 명씩" onClose={onClose}>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">학생
        <select value={who} onChange={(e) => setWho(e.target.value)} className="h-11 rounded-control bg-soft px-3 text-[15px] text-ink">
          {students.map((s) => <option key={s.id} value={s.id}>{s.no} {s.name}{s.summary ? " · 자료 있음" : ""}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">파일 (PDF · 사진 · hwpx · pptx · txt)
        <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="rounded-control border border-dashed border-faint px-3 py-3 text-[14px]" />
      </label>
      <p className="rounded-control bg-bg px-3 py-2 text-[12px] text-sub">AI가 읽어 요약만 조각으로 남겨요 · 파일은 저장하지 않아요 · 다시 올리면 새 요약이 더해져요</p>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" kind="outline" className="flex-1 md:flex-none" onClick={onClose}>취소</Button>
        <Button type="button" className="flex-1 md:flex-none" disabled={pending || !file || !who} onClick={go}>{pending ? "읽는 중…" : "올리고 읽기"}</Button>
      </div>
    </Shell>
  );
}

function SplitDialog({ assessmentId, rubric = false, students, onClose }: { assessmentId: string; rubric?: boolean; students: Stu[]; onClose: () => void }) {
  const router = useRouter();
  const nameOf = new Map(students.map((s) => [s.id, `${s.no} ${s.name}`]));
  return (
    <PdfSplitDialog students={students} onClose={onClose} confirm={(n) => `${n}명 자료 만들기`}
      note={rubric ? "나눈 답안은 학생마다 AI가 루브릭으로 읽어 채점 제안을 남겨요 · 확정은 학생을 눌러 해요 · 파일은 저장하지 않아요" : "나눈 파일은 학생마다 AI가 읽어 요약만 조각으로 남겨요 · 파일은 저장하지 않아요"}
      run={async (parts, report) => {
        const fails: string[] = [];
        for (let k = 0; k < parts.length; k++) {
          report(`${k + 1} / ${parts.length}명 읽는 중 · ${nameOf.get(parts[k].studentId)}`);
          const e = rubric
            ? await gradeFor(assessmentId, parts[k].studentId, parts[k].file).then((x) => ("error" in x ? x.error : null)).catch(() => "읽지 못했어요")
            : await readFor(assessmentId, parts[k].studentId, parts[k].file);
          if (e) fails.push(`${nameOf.get(parts[k].studentId)}: ${e}`);
        }
        router.refresh();
        return fails.length ? `${parts.length - fails.length}명 넣었어요 · ${fails.length}명 못 읽음 — ${fails.slice(0, 2).join(" / ")}` : null;
      }} />
  );
}
