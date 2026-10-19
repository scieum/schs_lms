"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Copy, Lock, Plus, X } from "lucide-react";
import { cx } from "@/components/ui";
import { splitByRanges } from "@/lib/domain/diff";
import { insertAt, LIBRARY_AREAS, normalizeTags, stripIdentity, TAG_LEN, TAG_MAX, type LibraryArea, type LibrarySource } from "@/lib/domain/library";
import { listSentences, saveSentence } from "@/app/(app)/teacher/library/actions";
import { useUndoSnack } from "./undo-snack";
import type { TextSelection } from "./highlight-textarea";
import { useWorkspace } from "./workspace";
import { LIBRARY_CHANGED } from "./library-panel";

// 문장 보관하기 (Figma N35 ② 435:112 · 435:478): 본문에서 고른 글 · AI 결과(다른 버전 · 순화 · 고친 글 · 초안)를 내 보관함에.
// 이름·학번은 미리보기에서 빨간 취소선으로 보여 주고 빼고 저장한다(서버에서 한 번 더 지움). 학생 정보는 남지 않는다.
// PC: 고른 곳 아래 팝오버 380 (AI 결과의 책갈피는 가운데 작은 창) · 모바일: 바텀시트.

type Pending = { text: string; source: LibrarySource; inline: boolean };
type Ctx = {
  open: (text: string, source: LibrarySource, inline?: boolean) => void;
  isSaved: (text: string) => boolean;
  pending: Pending | null;
  close: () => void;
  form: ReactNode;
};
const SaveCtx = createContext<Ctx | null>(null);
export const useLibrarySave = () => useContext(SaveCtx);

export function LibrarySaveProvider({ area, subject, studentId, who, children }: {
  area: LibraryArea; subject?: string | null; studentId?: string; who?: { name: string; studentNo: string }; children: ReactNode;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const snack = useUndoSnack(5000);
  const ws = useWorkspace();
  const router = useRouter();
  const show = snack.show;
  const open = useCallback((text: string, source: LibrarySource, inline = false) => setPending({ text, source, inline }), []);
  const close = useCallback(() => setPending(null), []);
  const onSaved = useCallback((text: string) => {
    setSaved((s) => new Set(s).add(text));
    window.dispatchEvent(new Event(LIBRARY_CHANGED));
    setPending(null);
    show("보관함에 넣었어요", () => { if (ws) ws.setPanel("library"); else router.push("/teacher/library"); }, "보관함 열기");
  }, [show, ws, router]);
  const form = useMemo(() => pending ? (
    <LibrarySaveForm key={pending.text} text={pending.text} source={pending.source} defaultArea={area} subject={subject} studentId={studentId} who={who}
      variant={pending.inline ? "popover" : "dialog"} onCancel={close} onSaved={onSaved} />
  ) : null, [pending, area, subject, studentId, who, close, onSaved]);
  const value = useMemo<Ctx>(() => ({ open, isSaved: (t) => saved.has(t), pending, close, form }), [open, saved, pending, close, form]);
  return (
    <SaveCtx.Provider value={value}>
      {children}
      {/* 책갈피(AI 결과)·모바일 고른 글은 창으로. 본문 선택 도구(PC)는 본문 칸 안 팝오버 */}
      {pending && !pending.inline && form}
      {snack.node}
    </SaveCtx.Provider>
  );
}

/** AI 결과 카드 머리의 책갈피 16 (보관하면 인디고 채움) */
export function SaveBookmark({ text, source, className }: { text: string; source: LibrarySource; className?: string }) {
  const ctx = useLibrarySave();
  if (!ctx || !text.trim()) return null;
  const on = ctx.isSaved(text);
  return (
    <button type="button" onClick={() => ctx.open(text, source)} aria-label={on ? "보관함에 넣었어요" : "보관함에 넣기"} title="보관함에 넣기"
      className={cx("flex size-7 shrink-0 items-center justify-center rounded-control hover:bg-soft", on ? "text-key-strong" : "text-mute", className)}>
      <Bookmark size={16} fill={on ? "currentColor" : "none"} />
    </button>
  );
}

/** 본문에서 글을 고르면 고른 곳 위에 뜨는 선택 도구 (PC · 네이비): 보관 | 복사. 누르는 동안 고른 것이 풀리지 않게 mousedown 을 막는다 */
export function SelectionTools({ sel, at, onSave }: { sel: TextSelection; at: { top: number; left: number }; onSave: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(sel.text); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <div role="toolbar" aria-label="고른 글" onMouseDown={(e) => e.preventDefault()}
      className="absolute z-20 hidden -translate-y-full items-center gap-3 rounded-control bg-navy px-2.5 py-1.5 shadow-[0_4px_12px_rgba(28,32,51,0.2)] md:flex"
      style={{ top: Math.max(0, at.top + 6), left: Math.max(8, at.left - 16) }}>
      <button type="button" onClick={onSave} className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-bold text-white"><Bookmark size={15} /> 보관</button>
      <span className="h-4 w-px bg-[#3A4060]" aria-hidden />
      <button type="button" onClick={copy} className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-[#C9CEDB]"><Copy size={15} /> {copied ? "복사함" : "복사"}</button>
    </div>
  );
}

function LibrarySaveForm({ text, source, defaultArea, subject, studentId, who, variant, onCancel, onSaved }: {
  text: string; source: LibrarySource; defaultArea: LibraryArea; subject?: string | null; studentId?: string; who?: { name: string; studentNo: string };
  variant: "popover" | "dialog"; onCancel: () => void; onSaved: (text: string) => void;
}) {
  const strip = useMemo(() => stripIdentity(text, who ? [who.name] : [], who ? [who.studentNo] : []), [text, who]);
  const [area, setArea] = useState<LibraryArea>(defaultArea);
  const [tags, setTags] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const tagInput = useRef<HTMLInputElement>(null);
  // 사용자가 누른 뒤에만 그려지므로 화면 폭을 바로 읽는다
  const [wide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    let alive = true;
    listSentences({}).then((r) => alive && setTotal(r.total)).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (variant !== "dialog") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, onCancel]);
  useEffect(() => { if (adding) tagInput.current?.focus(); }, [adding]);

  const addTag = () => {
    const next = normalizeTags([...tags, draft]);
    setTags(next);
    setDraft("");
    setAdding(false);
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await saveSentence({ text, area, subject: area === "세특" ? subject : null, tags, source, studentId });
      if (r.ok) onSaved(text);
      else setError(r.error);
    } catch {
      setError("보관하지 못했어요");
    }
    setBusy(false);
  };
  const empty = strip.text.length < 2;

  const body = (
    <>
      <div className="flex items-center gap-2">
        <Bookmark size={18} className="shrink-0 text-key-strong" />
        <span className="flex-1 text-[17px] font-bold md:text-[15px]">보관함에 넣기</span>
        <button type="button" onClick={onCancel} aria-label="닫기" className="flex size-7 items-center justify-center text-mute"><X size={18} /></button>
      </div>
      <div className="flex flex-col gap-2 rounded-control bg-bg px-3.5 py-3">
        <p className="whitespace-pre-wrap break-keep text-[14px] leading-[22px]">
          {splitByRanges(text, strip.removed).map((p, i) => (p.on ? <span key={i} className="text-bad line-through">{p.text}</span> : <span key={i}>{p.text}</span>))}
        </p>
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-sub"><Lock size={13} className="shrink-0" /> 이름·학번은 빼고 저장해요 · 학생 정보는 남지 않아요</p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-sub">영역</span>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="영역">
          {LIBRARY_AREAS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={area === a} onClick={() => setArea(a)}
              className={cx("h-9 whitespace-nowrap rounded-[16px] border px-3.5 text-[13px] md:h-8", area === a ? "border-key bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-ink")}>{a}</button>
          ))}
          {area === "세특" && subject && <span className="inline-flex h-8 items-center whitespace-nowrap rounded-chip bg-soft px-2.5 text-[12px] text-sub">과목 · {subject}</span>}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-sub">태그</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex h-[26px] items-center gap-1 rounded-chip bg-key-soft pl-2 pr-1 text-[12px] font-medium text-key-strong">
              #{t}<button type="button" aria-label={`${t} 태그 빼기`} onClick={() => setTags(tags.filter((x) => x !== t))} className="flex size-4 items-center justify-center"><X size={12} /></button>
            </span>
          ))}
          {tags.length < TAG_MAX && (adding ? (
            <input ref={tagInput} value={draft} maxLength={TAG_LEN} onChange={(e) => setDraft(e.target.value)} aria-label="새 태그"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } if (e.key === "Escape") { e.stopPropagation(); setAdding(false); } }}
              onBlur={() => (draft.trim() ? addTag() : setAdding(false))} placeholder="태그"
              className="h-[26px] w-24 rounded-chip border border-dashed border-key bg-[#fff] px-2 text-[12px] outline-none" />
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="inline-flex h-[26px] items-center gap-0.5 rounded-chip border border-dashed border-hair px-2 text-[12px] font-medium text-sub"><Plus size={12} /> 태그</button>
          ))}
        </div>
      </div>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <span className="hidden flex-1 text-[12px] text-mute md:block">{total === null ? "" : `보관함 ${total}개`}</span>
        <div className="flex gap-2 [&>*]:h-12 [&>*]:flex-1 md:[&>*]:h-9 md:[&>*]:flex-none">
          <button type="button" onClick={onCancel} className="whitespace-nowrap rounded-control border border-hair bg-[#fff] px-4 text-[14px] font-medium md:text-[13px]">취소</button>
          <button type="button" onClick={save} disabled={busy || empty}
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-key px-4 text-[14px] font-bold text-white hover:bg-key-strong disabled:opacity-40 md:text-[13px]">
            <Bookmark size={15} /> {busy ? "보관하는 중…" : "보관"}
          </button>
        </div>
      </div>
    </>
  );

  const card = "flex flex-col gap-3.5 bg-[#fff]";
  return (
    <>
      {/* 모바일: 바텀시트 (뒤 네이비 50%). 한 벌만 그린다(입력 칸이 두 벌이면 포커스가 숨은 쪽으로 감) */}
      {!wide && <div className="fixed inset-0 z-[90] flex items-end bg-navy/50" onClick={onCancel}>
        <div role="dialog" aria-modal="true" aria-label="보관함에 넣기" onClick={(e) => e.stopPropagation()}
          className={cx(card, "max-h-[88dvh] w-full overflow-y-auto rounded-t-[16px] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5")}>
          <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair" />
          {body}
        </div>
      </div>}
      {/* PC: 고른 곳 아래 팝오버 (본문 칸 오른쪽 끝 맞춤) · 책갈피는 가운데 작은 창 */}
      {!wide ? null : variant === "popover" ? (
        <div role="dialog" aria-label="보관함에 넣기" className={cx(card, "absolute right-0 top-0 z-30 w-[380px] max-w-[calc(100vw-32px)] rounded-card border border-line p-4 shadow-[0_8px_24px_rgba(0,0,0,0.16)]")}>
          {body}
        </div>
      ) : (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-navy/50 pt-[160px]" onClick={onCancel}>
          <div role="dialog" aria-modal="true" aria-label="보관함에 넣기" onClick={(e) => e.stopPropagation()}
            className={cx(card, "w-[380px] rounded-card border border-line p-4 shadow-[0_8px_24px_rgba(0,0,0,0.16)]")}>
            {body}
          </div>
        </div>
      )}
    </>
  );
}

/** 본문 머리 글자 버튼 "🔖 보관함" (켜면 #EEF0FF/#3D56E0) — 편집기 옆 보관함 패널을 연다 */
export function LibraryToggle() {
  const ws = useWorkspace();
  if (!ws) return null;
  const on = ws.panel === "library";
  return (
    <button type="button" aria-pressed={on} onClick={() => ws.setPanel(on ? null : "library")}
      className={cx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-chip px-2 py-[3px] text-[13px] font-medium", on ? "bg-key-soft text-key-strong" : "text-sub hover:bg-soft")}>
      <Bookmark size={14} /> 보관함
    </button>
  );
}

/**
 * 본문 칸과 보관함을 잇는다: 보관함 패널의 "본문에 넣기"(커서 자리) · "조각으로 넣기" 등록, 본문 선택 도구(PC)와 모바일 "고른 글 보관".
 */
export function useBodyLibrary(opts: {
  text: string; body: RefObject<HTMLTextAreaElement | null>; onInsert: (next: string) => void;
  addPiece?: (entryId: string) => Promise<{ error?: string }>; area: LibraryArea; subject?: string | null;
}) {
  const ws = useWorkspace();
  const lib = useLibrarySave();
  const latest = useRef(opts);
  useEffect(() => { latest.current = opts; });
  const setInserter = ws?.setInserter;
  const hasPiece = !!opts.addPiece;
  useEffect(() => {
    if (!setInserter) return;
    setInserter({
      insert: (t) => { const o = latest.current; o.onInsert(insertAt(o.text, t, o.body.current?.selectionStart ?? null).text); },
      addPiece: hasPiece ? (id) => latest.current.addPiece!(id) : undefined,
      area: opts.area, subject: opts.subject,
    });
    return () => setInserter(null);
  }, [setInserter, hasPiece, opts.area, opts.subject]);
  const [picked, setPicked] = useState<TextSelection | null>(null);
  const selectionTool = lib
    ? (sel: TextSelection, at: { top: number; bottom: number; left: number }) => (lib.pending?.inline && lib.pending.text === sel.text
      ? <div className="absolute inset-x-0 z-30" style={{ top: at.bottom + 8 }}>{lib.form}</div>
      : <SelectionTools sel={sel} at={at} onSave={() => lib.open(sel.text, "body", true)} />)
    : undefined;
  const mobileSave = lib && picked ? (
    <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => lib.open(picked.text, "body")}
      className="inline-flex items-center gap-1 self-start whitespace-nowrap text-[13px] font-bold text-key-strong md:hidden">
      <Bookmark size={14} /> 고른 글 보관
    </button>
  ) : null;
  return { selectionTool, onSelectionChange: setPicked, mobileSave };
}
