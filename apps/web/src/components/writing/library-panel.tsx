"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, ChevronDown, Copy, Pencil, Search, Trash2, X } from "lucide-react";
import { cx } from "@/components/ui";
import {
  areaCounts, filterLibrary, LIBRARY_AREAS, libraryDate, SORT_LABEL, SOURCE_TAG, tagCounts,
  type LibraryArea, type LibraryEntry, type LibrarySort,
} from "@/lib/domain/library";
import { listSentences, removeSentence, updateSentence, takeSentence } from "@/app/(app)/teacher/library/actions";
import { DeleteConfirm } from "@/components/materials/delete-file";
import { useWorkspace } from "./workspace";

// 문장 보관함 패널 (Figma N35 ② 436:273 · 436:717): 찾기 · 영역 · 태그 · 정렬 → 보관 문장 카드 → 본문에 넣기 / 조각으로 넣기.
// 편집기 옆(xl 이상 420 카드, 그보다 좁으면 바텀시트). 보관 페이지(/teacher/library)는 같은 목록을 넓혀 쓰고 카드 버튼만 "복사".

export const LIBRARY_CHANGED = "schs-library-changed";
const RECENT_MS = 10 * 60 * 1000;

export function LibraryPanel({ mode = "panel" }: { mode?: "panel" | "page" }) {
  const ws = useWorkspace();
  const ins = mode === "panel" ? ws?.inserter ?? null : null;
  const [all, setAll] = useState<LibraryEntry[] | null>(null);
  const [q, setQ] = useState("");
  const [area, setArea] = useState<LibraryArea | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [allTags, setAllTags] = useState(false);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(() => {
    listSentences({}).then((r) => setAll(r.entries)).catch(() => setAll((cur) => cur ?? []));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(LIBRARY_CHANGED, load);
    return () => window.removeEventListener(LIBRARY_CHANGED, load);
  }, [load]);

  const list = useMemo(() => filterLibrary(all ?? [], { q, area, tag, sort }), [all, q, area, tag, sort]);
  const counts = useMemo(() => areaCounts(all ?? []), [all]);
  const tags = useMemo(() => tagCounts(all ?? []), [all]);
  const shownTags = allTags ? tags : tags.slice(0, 5);
  const total = all?.length ?? 0;
  const close = () => ws?.setPanel(null);
  const narrow = () => typeof window !== "undefined" && !window.matchMedia("(min-width: 1280px)").matches;

  const insert = async (e: LibraryEntry) => {
    if (!ins) return;
    const r = await takeSentence({ id: e.id });
    if (!r.ok) { setMsg(r.error); return; }
    ins.insert(r.text);
    setAll((cur) => cur && cur.map((x) => (x.id === e.id ? { ...x, useCount: x.useCount + 1 } : x)));
    if (narrow()) close();
  };
  const piece = async (e: LibraryEntry) => {
    if (!ins?.addPiece) return;
    const r = await ins.addPiece(e.id);
    setMsg(r.error ?? "조각으로 넣었어요 · ① 조각 목록에 '보관함'으로 보여요");
    if (!r.error) setAll((cur) => cur && cur.map((x) => (x.id === e.id ? { ...x, useCount: x.useCount + 1 } : x)));
  };
  const copy = async (e: LibraryEntry) => {
    try { await navigator.clipboard.writeText(e.text); setMsg("복사했어요"); } catch { setMsg("복사하지 못했어요"); }
  };
  const remove = async (e: LibraryEntry) => {
    setAsking(null);
    const prev = all;
    setAll((cur) => cur && cur.filter((x) => x.id !== e.id));
    const r = await removeSentence({ id: e.id });
    if (r.error) { setAll(prev); setMsg(r.error); } else setMsg("보관 문장을 지웠어요");
  };
  const saveEdit = async (e: LibraryEntry, text: string) => {
    const r = await updateSentence({ id: e.id, text });
    if (!r.ok) { setMsg(r.error); return; }
    setAll((cur) => cur && cur.map((x) => (x.id === e.id ? r.entry : x)));
    setEditing(null);
  };

  const chip = (on: boolean) => cx("inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-[16px] border px-3 text-[13px] md:h-8", on ? "border-key bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-ink");
  const content = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Bookmark size={18} className="shrink-0 text-key-strong" />
        <h2 className="text-[17px] font-bold md:text-[16px]">문장 보관함</h2>
        <span className="text-[13px] text-mute">{all ? total : ""}</span>
        <span className="flex-1" />
        {mode === "panel" && <button type="button" onClick={close} aria-label="보관함 닫기" className="flex size-7 items-center justify-center text-mute"><X size={18} /></button>}
      </div>
      <label className="flex h-11 items-center gap-2 rounded-field bg-bg px-3 focus-within:ring-2 focus-within:ring-key md:h-10">
        <Search size={16} className="shrink-0 text-mute" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="문장·태그 찾기" aria-label="문장·태그 찾기" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-mute" />
        {q && <button type="button" onClick={() => setQ("")} aria-label="찾기 지우기" className="text-mute"><X size={14} /></button>}
      </label>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" role="radiogroup" aria-label="영역">
        <button type="button" role="radio" aria-checked={!area} onClick={() => setArea(null)} className={chip(!area)}>전체 {total}</button>
        {LIBRARY_AREAS.map((a) => <button key={a} type="button" role="radio" aria-checked={area === a} onClick={() => setArea(area === a ? null : a)} className={chip(area === a)}>{a} {counts[a]}</button>)}
      </div>
      {tags.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]">
          {shownTags.map((t) => (
            <button key={t.tag} type="button" aria-pressed={tag === t.tag} onClick={() => setTag(tag === t.tag ? null : t.tag)}
              className={cx("h-[26px] shrink-0 whitespace-nowrap rounded-chip px-2 text-[12px] font-medium", tag === t.tag ? "bg-key-soft text-key-strong" : "bg-soft text-sub")}>#{t.tag}</button>
          ))}
          {!allTags && tags.length > 5 && <button type="button" onClick={() => setAllTags(true)} className="h-[26px] shrink-0 rounded-chip bg-soft px-2 text-[12px] font-medium text-sub">+{tags.length - 5}</button>}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-sub">{list.length}개</span>
        <label className="relative inline-flex items-center gap-0.5 text-[13px] text-sub">
          <select value={sort} onChange={(e) => setSort(e.target.value as LibrarySort)} aria-label="정렬" className="appearance-none bg-transparent pr-4 text-right outline-none">
            {(Object.keys(SORT_LABEL) as LibrarySort[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-0" />
        </label>
      </div>
      {msg && <p className="rounded-control bg-key-soft px-3 py-2 text-[12px] font-medium text-key-strong" role="status">{msg}</p>}
      {all === null ? (
        <p className="py-8 text-center text-[13px] text-mute" role="status">보관함을 여는 중이에요</p>
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-mute">{total ? "찾는 문장이 없어요" : "아직 보관한 문장이 없어요. 본문에서 글을 골라 '보관'을 눌러 보세요"}</p>
      ) : (
        <ul className={cx("flex flex-col gap-2.5", mode === "page" && "md:grid md:grid-cols-2 md:gap-3")}>
          {list.map((e) => {
            const fresh = now - Date.parse(e.createdAt) < RECENT_MS;
            return (
              <li key={e.id} className={cx("flex flex-col gap-2.5 rounded-inner border p-3.5", fresh ? "border-key bg-[#FAFBFF]" : "border-line bg-[#fff]")}>
                {editing === e.id ? (
                  <EditBox entry={e} onCancel={() => setEditing(null)} onSave={(t) => saveEdit(e, t)} />
                ) : (
                  <p className="whitespace-pre-wrap break-keep text-[14px] leading-[22px]">{e.text}</p>
                )}
                <div className="flex flex-wrap items-center gap-1">
                  <span className="rounded-chip bg-soft px-1.5 py-0.5 text-[11px] font-medium text-sub">{e.area}{e.subject ? ` · ${e.subject}` : ""}</span>
                  {e.tags.map((t) => <span key={t} className="rounded-chip bg-key-soft px-1.5 py-0.5 text-[11px] font-medium text-key-strong">#{t}</span>)}
                  {SOURCE_TAG[e.source] && <span className="rounded-chip bg-new-soft px-1.5 py-0.5 text-[11px] font-medium text-new">{SOURCE_TAG[e.source]}</span>}
                  <span className="text-[11px] text-mute">· {libraryDate(e.createdAt)}</span>
                </div>
                {asking === e.id ? (
                  <DeleteConfirm title="이 문장을 보관함에서 지울까요?" layout="stack" tone="bg-bg" onCancel={() => setAsking(null)} onConfirm={() => remove(e)} />
                ) : (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setEditing(e.id)} aria-label="고치기" className="flex size-8 items-center justify-center rounded-control text-mute hover:bg-soft"><Pencil size={15} /></button>
                    <button type="button" onClick={() => setAsking(e.id)} aria-label="지우기" className="flex size-8 items-center justify-center rounded-control text-mute hover:bg-bad-soft hover:text-bad"><Trash2 size={15} /></button>
                    <span className="flex-1" />
                    {ins ? (
                      <>
                        {ins.addPiece && (
                          <button type="button" onClick={() => piece(e)}
                            className="h-9 whitespace-nowrap rounded-control border border-hair bg-[#fff] px-3 text-[13px] font-bold text-ink md:h-[30px] md:border-0 md:bg-transparent md:px-2 md:font-medium md:text-sub">
                            <span className="md:hidden">조각으로</span><span className="hidden md:inline">조각으로 넣기</span>
                          </button>
                        )}
                        <button type="button" onClick={() => insert(e)} className="h-9 whitespace-nowrap rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong hover:bg-[#e3e7ff] md:h-[30px]">본문에 넣기</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => copy(e)} className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong md:h-[30px]"><Copy size={13} /> 복사</button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="break-keep text-[12px] text-mute">{ins ? "본문에 넣기는 커서 자리에 넣고 다시 검사해요 · 이름·학번은 저장하지 않아요" : "편집 화면 본문 머리의 '보관함'에서 본문에 넣거나 조각으로 넣어요 · 이름·학번은 저장하지 않아요"}</p>
    </div>
  );

  if (mode === "page") return <section className="surface mx-auto w-full max-w-[880px] rounded-card p-5 md:p-6">{content}</section>;
  return (
    <div className="max-xl:fixed max-xl:inset-0 max-xl:z-[90] max-xl:flex max-xl:items-end max-xl:bg-navy/50" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section role="dialog" aria-label="문장 보관함"
        className="bg-[#fff] max-xl:max-h-[92dvh] max-xl:w-full max-xl:overflow-y-auto max-xl:rounded-t-[16px] max-xl:px-5 max-xl:pb-[calc(env(safe-area-inset-bottom)+20px)] max-xl:pt-2.5 md:max-xl:mx-auto md:max-xl:max-w-[560px] xl:rounded-card xl:border xl:border-line xl:p-5">
        <span aria-hidden className="mx-auto mb-3 block h-1 w-9 rounded-full bg-hair xl:hidden" />
        {content}
      </section>
    </div>
  );
}

function EditBox({ entry, onCancel, onSave }: { entry: LibraryEntry; onCancel: () => void; onSave: (t: string) => void }) {
  const [t, setT] = useState(entry.text);
  return (
    <div className="flex flex-col gap-2">
      <textarea value={t} onChange={(e) => setT(e.target.value)} maxLength={600} rows={3} aria-label="보관 문장 고치기"
        className="w-full resize-y rounded-field bg-bg px-3 py-2 text-[14px] leading-[22px] outline-none focus:ring-2 focus:ring-key" />
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="h-8 rounded-control px-2.5 text-[13px] font-medium text-sub hover:bg-soft">취소</button>
        <button type="button" onClick={() => onSave(t)} disabled={t.trim().length < 2} className="h-8 rounded-control bg-key px-3 text-[13px] font-bold text-white disabled:opacity-40">저장</button>
      </div>
    </div>
  );
}
