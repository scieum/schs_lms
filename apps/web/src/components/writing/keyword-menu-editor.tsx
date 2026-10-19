"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Eye, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { cx } from "@/components/ui";
import { addKeyword, cleanKeyword, DEFAULT_MENU, KEYWORD_LEN, type KeywordItem, type KeywordMenu } from "@/lib/domain/behavior-keywords";
import { saveKeywordMenu } from "@/app/(app)/homeroom/behavior/actions";

// 메뉴판 고치기 (Figma N35 ④ (h) 441:938 · 441:1234): PC 가운데 모달 600 · 모바일 바텀시트.
// 묶음 고르기 → 키워드 목록(순서 · 숨기기/보이기 · 내 키워드 고치기/지우기) → 더하기 → 저장(한 번에). 기본 키워드는 지우지 않고 숨긴다.
// 순서: PC 는 손잡이를 끌어서, 손잡이를 누르면(모바일·키보드) 위·아래 버튼으로.

export function KeywordMenuEditor({ menu: initial, onClose, onSaved }: { menu: KeywordMenu; onClose: () => void; onSaved: (m: KeywordMenu) => void }) {
  const [menu, setMenu] = useState<KeywordMenu>(() => structuredClone(initial));
  const [gid, setGid] = useState(initial.groups[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const [moving, setMoving] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const group = menu.groups.find((g) => g.id === gid) ?? menu.groups[0];
  const setItems = (fn: (items: KeywordItem[]) => KeywordItem[]) => setMenu((m) => ({ groups: m.groups.map((g) => (g.id === group.id ? { ...g, items: fn(g.items) } : g)) }));
  const move = (id: string, d: -1 | 1) => setItems((items) => {
    const i = items.findIndex((x) => x.id === id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= items.length) return items;
    const out = [...items];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  });
  const dropOn = (target: string) => {
    if (!drag || drag === target) return;
    setItems((items) => {
      const from = items.findIndex((x) => x.id === drag);
      const to = items.findIndex((x) => x.id === target);
      if (from < 0 || to < 0) return items;
      const out = [...items];
      const [it] = out.splice(from, 1);
      out.splice(to, 0, it);
      return out;
    });
    setDrag(null);
  };
  const add = () => {
    const r = addKeyword(menu, group.id, draft);
    if (!r.item) { setError(draft.trim() ? "같은 키워드가 이미 있어요" : "키워드를 적어 주세요"); return; }
    setMenu(r.menu);
    setDraft("");
    setError("");
  };
  const rename = () => {
    if (!editing) return;
    const l = cleanKeyword(editing.label);
    if (!l) { setEditing(null); return; }
    if (menu.groups.some((g) => g.items.some((x) => x.label === l && x.id !== editing.id))) { setError("같은 키워드가 이미 있어요"); return; }
    setItems((items) => items.map((x) => (x.id === editing.id ? { ...x, label: l } : x)));
    setEditing(null);
    setError("");
  };
  const save = async () => {
    setBusy(true);
    const r = await saveKeywordMenu({ menu }).catch(() => ({ ok: false as const, error: "저장하지 못했어요" }));
    setBusy(false);
    if (r.ok) onSaved(r.menu);
    else setError(r.error);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/50 md:items-center md:px-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="키워드 메뉴판 고치기" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 md:max-h-[calc(100dvh-80px)] md:w-[600px] md:rounded-card md:p-6">
        <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-hair md:hidden" />
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-[18px] font-bold">키워드 메뉴판 고치기</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex size-8 items-center justify-center text-sub"><X size={20} /></button>
        </div>
        <p className="-mt-2 break-keep text-[13px] text-sub">선생님 메뉴판만 바뀌어요 · 다른 선생님 메뉴판과 이미 쓴 기록은 그대로예요</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="묶음">
          {menu.groups.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={g.id === group.id} onClick={() => { setGid(g.id); setMoving(null); setEditing(null); }}
              className={cx("h-[34px] whitespace-nowrap rounded-[16px] border px-3 text-[13px] md:h-8", g.id === group.id ? "border-key bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-ink")}>
              {g.label} {g.items.length}
            </button>
          ))}
        </div>
        <ul className="overflow-hidden rounded-inner border border-line">
          {group.items.map((it, i) => {
            const isMoving = moving === it.id;
            return (
              <li key={it.id} draggable onDragStart={() => setDrag(it.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(it.id)} onDragEnd={() => setDrag(null)}
                className={cx("flex h-[50px] items-center gap-2 px-3 md:h-11", i > 0 && "border-t border-soft", (isMoving || drag === it.id) && "bg-key-soft")}>
                <button type="button" aria-label={`${it.label} 순서 바꾸기`} aria-pressed={isMoving} onClick={() => setMoving(isMoving ? null : it.id)}
                  onKeyDown={(e) => { if (e.key === "ArrowUp") { e.preventDefault(); move(it.id, -1); } if (e.key === "ArrowDown") { e.preventDefault(); move(it.id, 1); } }}
                  className="flex size-7 shrink-0 cursor-grab items-center justify-center text-faint"><GripVertical size={16} /></button>
                {editing?.id === it.id ? (
                  <input autoFocus value={editing.label} maxLength={KEYWORD_LEN} onChange={(e) => setEditing({ id: it.id, label: e.target.value })} aria-label="키워드 이름"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); rename(); } if (e.key === "Escape") { e.stopPropagation(); setEditing(null); } }} onBlur={rename}
                    className="h-8 min-w-0 flex-1 rounded-field bg-bg px-2.5 text-[14px] outline-none focus:ring-2 focus:ring-key" />
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className={cx("truncate text-[14px] font-medium", it.hidden && "text-mute line-through")}>{it.label}</span>
                    <span className={cx("shrink-0 whitespace-nowrap rounded-chip px-1.5 py-0.5 text-[11px] font-medium", it.custom ? "bg-key-soft text-key-strong" : "bg-soft text-sub")}>{it.custom ? "내 키워드" : it.hidden ? "숨김" : "기본"}</span>
                  </span>
                )}
                {isMoving ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => move(it.id, -1)} disabled={i === 0} aria-label="위로" className="flex size-8 items-center justify-center rounded-control text-sub hover:bg-[#fff] disabled:opacity-30"><ArrowUp size={16} /></button>
                    <button type="button" onClick={() => move(it.id, 1)} disabled={i === group.items.length - 1} aria-label="아래로" className="flex size-8 items-center justify-center rounded-control text-sub hover:bg-[#fff] disabled:opacity-30"><ArrowDown size={16} /></button>
                    <button type="button" onClick={() => setMoving(null)} className="h-8 whitespace-nowrap px-1.5 text-[13px] font-bold text-key-strong">완료</button>
                  </span>
                ) : it.custom ? (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button type="button" onClick={() => setEditing({ id: it.id, label: it.label })} aria-label={`${it.label} 고치기`} className="flex size-8 items-center justify-center rounded-control text-sub hover:bg-soft"><Pencil size={16} /></button>
                    <button type="button" onClick={() => setItems((items) => items.filter((x) => x.id !== it.id))} aria-label={`${it.label} 지우기`} className="flex size-8 items-center justify-center rounded-control text-sub hover:bg-bad-soft hover:text-bad"><Trash2 size={16} /></button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setItems((items) => items.map((x) => (x.id === it.id ? (x.hidden ? { id: x.id, label: x.label } : { ...x, hidden: true }) : x)))}
                    className={cx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px]", it.hidden ? "font-medium text-key-strong" : "text-sub")}>
                    <Eye size={15} /> {it.hidden ? "보이기" : "숨기기"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2">
          <input value={draft} maxLength={KEYWORD_LEN} onChange={(e) => setDraft(e.target.value)} placeholder={`새 키워드 (${KEYWORD_LEN}자까지)`} aria-label="새 키워드"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            className="h-11 min-w-0 flex-1 rounded-field bg-bg px-3 text-[14px] outline-none placeholder:text-mute focus:ring-2 focus:ring-key md:h-10" />
          <button type="button" onClick={add} className="inline-flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-control bg-key-soft px-3.5 text-[14px] font-bold text-key-strong md:h-10 md:text-[13px]"><Plus size={15} /> 더하기</button>
        </div>
        {error && <p className="-mt-2 text-[13px] text-bad" role="alert">{error}</p>}
        <p className="-mt-1 break-keep text-[12px] text-mute">키워드는 AI에게 말의 방향만 알려 줘요 · 문장은 메모·누가기록에 있는 일로만 써요 · 기본 키워드는 지우지 않고 숨겨요</p>
        <div className="flex items-center gap-2 border-t border-line pt-4">
          <button type="button" onClick={() => { setMenu(structuredClone(DEFAULT_MENU)); setMoving(null); setEditing(null); }} className="whitespace-nowrap text-[13px] font-medium text-sub">
            <span className="md:hidden">기본으로</span><span className="hidden md:inline">기본으로 되돌리기</span>
          </button>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="h-11 whitespace-nowrap rounded-control border border-hair bg-[#fff] px-4 text-[14px] font-medium md:h-10">취소</button>
          <button type="button" onClick={save} disabled={busy} className="h-11 whitespace-nowrap rounded-control bg-key px-5 text-[14px] font-bold text-white hover:bg-key-strong disabled:opacity-40 md:h-10">{busy ? "저장하는 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
