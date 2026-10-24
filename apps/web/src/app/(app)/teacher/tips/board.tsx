"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronLeft, Copy, Plus, Search, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { TIP_CATEGORIES, TIP_LIMITS, type Tip, type TipCategory } from "@/lib/domain/tips";
import { deleteTipAction, saveTip } from "./actions";

// 생기부 팁 게시판 (Figma N57): 분류 칩 · 찾기 · 목록 · 글(복사 · 고치기 · 지우기) · 올리기 창.

const CAT_TONE: Record<TipCategory, string> = {
  구조: "bg-key-soft text-key-strong", 문장: "bg-ok-soft text-ok", 서술어: "bg-new-soft text-new", 점검: "bg-wait-soft text-[#9a6400]", 기재요령: "bg-soft text-sub", 기타: "bg-soft text-sub",
};
const day = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" }).format(new Date(iso));
const href = (q: { cat?: string; q?: string; t?: string }) => {
  const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v && v !== "전체") as [string, string][]);
  return `/teacher/tips${p.size ? `?${p}` : ""}`;
};

export function NewTipButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> <span className="md:hidden">올리기</span><span className="hidden md:inline">팁 올리기</span></Button>
      {open && <TipDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export function TipsBoard({ tips, counts, cat, text, selected, detailOnly, editable }: {
  tips: Tip[]; counts: Record<string, number>; cat: string; text: string; selected: Tip | null; detailOnly: boolean; editable: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const copy = async () => { if (!selected) return; try { await navigator.clipboard.writeText(`${selected.title}\n\n${selected.body}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* 복사 막힘 */ } };
  const remove = () => selected && start(async () => {
    const r = await deleteTipAction(selected.id);
    if (!r.ok) return setError(r.error);
    router.push(href({ cat, q: text }));
  });

  return (
    <div className="flex flex-col gap-4">
      <div className={cx("flex flex-col gap-3 md:flex-row md:items-center", detailOnly && "max-md:hidden")}>
        <form action="/teacher/tips" className="flex h-10 items-center gap-2 rounded-control border border-line bg-[#fff] px-3 md:order-2 md:ml-auto md:w-[280px]">
          {cat !== "전체" && <input type="hidden" name="cat" value={cat} />}
          <Search size={15} className="text-mute" />
          <input name="q" defaultValue={text} placeholder="찾기 — 예: 동아리, 서술어" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
        </form>
        <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0" aria-label="분류">
          {(["전체", ...TIP_CATEGORIES] as const).map((c) => (
            <Link key={c} href={href({ cat: c, q: text })} aria-current={cat === c ? "page" : undefined}
              className={cx("flex h-[34px] shrink-0 items-center gap-1 whitespace-nowrap rounded-control border px-3 text-[13px]", cat === c ? "border-key bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-sub")}>
              {c} <span className="text-[12px] font-medium text-mute">{counts[c] ?? 0}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] md:gap-6">
        <ul className={cx("flex flex-col gap-2", detailOnly && "max-md:hidden")}>
          {tips.length === 0 && <li className="rounded-inner bg-[#fff] px-4 py-8 text-center text-[14px] text-sub">맞는 팁이 없어요</li>}
          {tips.map((t) => {
            const on = selected?.id === t.id;
            return (
              <li key={t.id}>
                <Link href={href({ cat, q: text, t: t.id })} aria-current={on ? "true" : undefined}
                  className={cx("flex flex-col gap-1.5 rounded-inner px-4 py-3.5", on ? "md:bg-key-soft bg-[#fff]" : "bg-[#fff] hover:bg-soft")}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={cx("shrink-0 rounded-chip px-1.5 py-px text-[12px] font-bold", CAT_TONE[t.category])}>{t.category}</span>
                    <span className={cx("truncate text-[15px] font-bold", on && "md:text-key-strong")}>{t.title}</span>
                  </span>
                  <span className="line-clamp-2 text-[13px] leading-5 text-sub">{t.body.replace(/\s+/g, " ")}</span>
                  <span className="truncate text-[12px] text-mute">{t.source ? `${t.source} · ` : ""}{t.authorName} · {day(t.createdAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {selected && (
          <article className={cx("surface flex flex-col gap-3.5 rounded-card p-4 md:sticky md:top-6 md:p-7", !detailOnly && "max-md:hidden")}>
            <Link href={href({ cat, q: text })} className="flex items-center gap-1 text-[14px] font-bold text-sub md:hidden"><ChevronLeft size={16} /> 생기부 팁</Link>
            <span className={cx("self-start rounded-chip px-1.5 py-px text-[12px] font-bold", CAT_TONE[selected.category])}>{selected.category}</span>
            <h2 className="text-[20px] font-bold leading-snug md:text-[22px]">{selected.title}</h2>
            <p className="text-[12px] text-mute">{selected.authorName} · {day(selected.createdAt)}{selected.source ? ` · 출처 ${selected.source}` : ""}</p>
            <hr className="border-line" />
            <div className="whitespace-pre-line text-[14px] leading-6 text-[#333d4b]">{selected.body}</div>
            {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
            <div className="flex items-center gap-3 pt-1">
              <button type="button" onClick={copy} className="flex h-9 items-center gap-1.5 rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong"><Copy size={14} /> {copied ? "복사했어요" : "내용 복사"}</button>
              <span className="flex-1" />
              {editable && <button type="button" onClick={() => setEdit(true)} className="text-[13px] font-medium text-sub hover:text-ink">고치기</button>}
              {editable && <button type="button" onClick={remove} disabled={pending} className="text-[13px] font-medium text-bad">지우기</button>}
            </div>
          </article>
        )}
      </div>
      {edit && selected && <TipDialog tip={selected} onClose={() => setEdit(false)} />}
    </div>
  );
}

function TipDialog({ tip, onClose }: { tip?: Tip; onClose: () => void }) {
  const router = useRouter();
  const [category, setCategory] = useState<TipCategory>(tip?.category ?? "구조");
  const [title, setTitle] = useState(tip?.title ?? "");
  const [body, setBody] = useState(tip?.body ?? "");
  const [source, setSource] = useState(tip?.source ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    setError("");
    const r = await saveTip({ id: tip?.id, category, title, body, source });
    if (!r.ok) return setError(r.error);
    onClose();
    router.push(`/teacher/tips?t=${r.id}`);
  });
  const field = "rounded-control bg-soft px-3 text-[15px] outline-none focus:ring-2 focus:ring-key";
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={tip ? "팁 고치기" : "생기부 팁 올리기"}>
      <div className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-5 pt-4 md:max-w-[600px] md:rounded-[16px] md:px-7 md:py-6">
        <div className="flex items-center">
          <h2 className="flex-1 text-[18px] font-bold">{tip ? "팁 고치기" : "생기부 팁 올리기"}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-mute hover:text-ink"><X size={20} /></button>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">분류</span>
          <div className="flex flex-wrap gap-1.5">
            {TIP_CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
                className={cx("h-[34px] rounded-control border px-3 text-[13px]", category === c ? "border-key bg-key-soft font-bold text-key-strong" : "border-hair font-medium text-sub")}>{c}</button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">제목
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TIP_LIMITS.title} placeholder="예: 동아리 특기사항은 역할 변화로" className={cx(field, "h-11 text-ink")} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">
          <span className="flex">내용<span className="ml-auto text-[12px] text-mute">{body.length.toLocaleString("ko-KR")} / {TIP_LIMITS.body.toLocaleString("ko-KR")}</span></span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={TIP_LIMITS.body} rows={8} placeholder="같이 쓰면 좋은 구조 · 문장 · 주의할 점을 적어 주세요 (줄바꿈 그대로 보여요)" className={cx(field, "resize-y py-3 leading-6 text-ink")} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">출처 (선택)
          <input value={source} onChange={(e) => setSource(e.target.value)} maxLength={TIP_LIMITS.source} placeholder="링크나 자료 이름" className={cx(field, "h-11 text-ink")} />
        </label>
        {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        <div className="flex items-center gap-2">
          <span className="hidden flex-1 text-[12px] text-mute md:block">학생 이름 · 학번은 쓰지 않아요</span>
          <Button type="button" kind="outline" className="flex-1 md:flex-none" onClick={onClose}>취소</Button>
          <Button type="button" className="flex-1 md:flex-none" disabled={pending} onClick={save}>{pending ? "올리는 중…" : tip ? "고치기" : "올리기"}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
