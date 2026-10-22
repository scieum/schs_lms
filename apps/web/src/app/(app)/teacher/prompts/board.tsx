"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronLeft, Copy, FileUp, Lock, Plus, Search, Star, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { fitsStyle, PROMPT_LIMITS, PROMPT_TABS, type PromptDoc, type PromptTab } from "@/lib/domain/prompt-library";
import { STYLE_AREAS, STYLE_LIMITS, type StyleArea } from "@/lib/domain/writing-style";
import { ShareToRoomButton } from "@/components/collab-share";
import { deletePromptAction, readPromptFile, savePrompt, togglePromptStar, applyPromptAsStyle } from "./actions";

// 프롬프트 보관함 (도구, 2026-10-22): 탭(공식 · 공유 · 내 프롬프트) · 영역 칩 · 찾기 · 목록(★ 수) · 글(★ · 복사 · 내 스타일에 넣기) · 올리기 창.

const day = (iso: string) => (iso ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" }).format(new Date(iso)) : "");
const href = (q: { tab?: string; area?: string; q?: string; p?: string }) => {
  const p = new URLSearchParams(Object.entries(q).filter(([k, v]) => v && v !== "전체" && !(k === "tab" && v === "공식")) as [string, string][]);
  return `/teacher/prompts${p.size ? `?${p}` : ""}`;
};
const field = "rounded-control bg-soft px-3 text-[15px] outline-none focus:ring-2 focus:ring-key";
const TAB_NOTE: Record<PromptTab, string> = {
  공식: "교육과정부가 올린 과목별 학교 프롬프트와, 앱이 AI 쓰기에 실제로 쓰는 기본 프롬프트예요.",
  공유: "선생님들이 공개한 프롬프트예요. 써 보고 좋으면 ★ 별을 눌러 추천해 주세요 — 별 많은 순으로 보여요.",
  "내 프롬프트": "내가 올린 프롬프트예요. 비공개는 나만 보고, 공개하면 공유 탭에 올라가요.",
};
const where = (p: PromptDoc) => [p.area, p.subject].filter(Boolean).join(" · ");

export function NewPromptButton({ admin }: { admin: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> <span className="md:hidden">올리기</span><span className="hidden md:inline">프롬프트 올리기</span></Button>
      {open && <PromptDialog admin={admin} onClose={() => setOpen(false)} />}
    </>
  );
}

function StarButton({ p, big }: { p: PromptDoc; big?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  if (!p.public || p.builtin) return null;
  const toggle = () => start(async () => {
    const r = await togglePromptStar(p.id, !p.starred);
    if (!r.ok) return setErr(r.error);
    router.refresh();
  });
  return (
    <>
      <button type="button" onClick={toggle} disabled={pending} aria-pressed={p.starred} aria-label={p.starred ? "별 빼기" : "별 주기"}
        className={cx("flex shrink-0 items-center gap-1 rounded-control border font-bold", big ? "h-9 px-3 text-[13px]" : "h-7 px-2 text-[12px]",
          p.starred ? "border-[#f5b301] bg-[#fff7db] text-[#9a6400]" : "border-line bg-[#fff] text-sub hover:bg-soft")}>
        <Star size={big ? 15 : 13} className={p.starred ? "fill-[#f5b301] text-[#f5b301]" : ""} />{big && (p.starred ? "별 줬어요" : "별 주기")} {p.stars}
      </button>
      {err && <span className="text-[12px] text-bad">{err}</span>}
    </>
  );
}

export function PromptsBoard({ prompts, counts, tab, area, text, selected, detailOnly, editable, admin }: {
  prompts: PromptDoc[]; counts: Record<string, number>; tab: PromptTab; area: string; text: string;
  selected: PromptDoc | null; detailOnly: boolean; editable: boolean; me: string; admin: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const copy = async () => { if (!selected) return; try { await navigator.clipboard.writeText(selected.body); setNote("복사했어요"); } catch { /* 복사 막힘 */ } };
  const use = () => selected && start(async () => {
    setError(""); setNote("");
    const r = await applyPromptAsStyle(selected.id);
    if (!r.ok) return setError(r.error);
    try { localStorage.setItem(`schs-style-${r.area}`, "on"); } catch { /* 이번에만 */ }
    setNote(`${r.area} 글 짓기 내 스타일에 넣었어요 (켜짐)`);
  });
  const remove = () => selected && window.confirm("이 프롬프트를 지울까요?") && start(async () => {
    const r = await deletePromptAction(selected.id);
    if (!r.ok) return setError(r.error);
    router.push(href({ tab, area, q: text }));
  });

  return (
    <div className="flex flex-col gap-4">
      <div className={cx("flex flex-col gap-3", detailOnly && "max-md:hidden")}>
        <nav className="flex gap-1 self-start rounded-control bg-soft p-1" aria-label="탭">
          {PROMPT_TABS.map((t) => (
            <Link key={t} href={href({ tab: t })} aria-current={tab === t ? "page" : undefined}
              className={cx("flex h-9 items-center gap-1 rounded-[8px] px-3.5 text-[14px]", tab === t ? "bg-[#fff] font-bold text-ink shadow-sm" : "font-medium text-sub")}>
              {t} <span className="text-[12px] font-medium text-mute">{counts[t] ?? 0}</span>
            </Link>
          ))}
        </nav>
        <p className="text-[14px] text-sub">{TAB_NOTE[tab]}</p>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <form action="/teacher/prompts" className="flex h-10 items-center gap-2 rounded-control border border-line bg-[#fff] px-3 md:order-2 md:ml-auto md:w-[280px]">
            {tab !== "공식" && <input type="hidden" name="tab" value={tab} />}
            {area !== "전체" && <input type="hidden" name="area" value={area} />}
            <Search size={15} className="text-mute" />
            <input name="q" defaultValue={text} placeholder="찾기 — 예: 화학, 탐구, 동아리" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
          </form>
          <nav className="flex gap-1.5" aria-label="영역">
            {(["전체", ...STYLE_AREAS] as const).map((a) => (
              <Link key={a} href={href({ tab, area: a, q: text })} aria-current={area === a ? "page" : undefined}
                className={cx("flex h-[34px] items-center rounded-control border px-3 text-[13px]", area === a ? "border-key bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-sub")}>{a}</Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] md:gap-6">
        <ul className={cx("flex flex-col gap-2", detailOnly && "max-md:hidden")}>
          {prompts.length === 0 && <li className="rounded-inner bg-[#fff] px-4 py-8 text-center text-[14px] text-sub">{tab === "내 프롬프트" ? "아직 올린 프롬프트가 없어요 — 오른쪽 위 ＋ 프롬프트 올리기" : "맞는 프롬프트가 없어요"}</li>}
          {prompts.map((p) => {
            const on = selected?.id === p.id;
            return (
              <li key={p.id}>
                <Link href={href({ tab, area, q: text, p: p.id })} aria-current={on ? "true" : undefined}
                  className={cx("flex flex-col gap-1.5 rounded-inner px-4 py-3.5", on ? "md:bg-key-soft bg-[#fff]" : "bg-[#fff] hover:bg-soft")}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={cx("shrink-0 rounded-chip px-1.5 py-px text-[12px] font-bold", p.builtin ? "bg-soft text-sub" : p.official ? "bg-key-soft text-key-strong" : "bg-ok-soft text-ok")}>{p.builtin ? "앱 기본" : p.official ? "공식" : where(p)}</span>
                    <span className={cx("min-w-0 flex-1 truncate text-[15px] font-bold", on && "md:text-key-strong")}>{p.title}</span>
                    {!p.public && <Lock size={13} className="shrink-0 text-mute" aria-label="비공개" />}
                    {p.public && !p.builtin && <span className={cx("flex shrink-0 items-center gap-0.5 text-[12px] font-bold", p.starred ? "text-[#9a6400]" : "text-mute")}><Star size={12} className={p.starred ? "fill-[#f5b301] text-[#f5b301]" : ""} />{p.stars}</span>}
                  </span>
                  <span className="line-clamp-2 text-[13px] leading-5 text-sub">{(p.builtin ? p.body.replace(/^[\s\S]*?\n1\) /, "") : p.body).replace(/\s+/g, " ")}</span>
                  <span className="truncate text-[12px] text-mute">{(p.official || p.builtin) ? `${where(p)} · ` : ""}{p.authorName}{p.createdAt ? ` · ${day(p.createdAt)}` : ""}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {selected && (
          <article className={cx("surface flex min-w-0 flex-col gap-3.5 rounded-card p-4 md:sticky md:top-6 md:p-7", !detailOnly && "max-md:hidden")}>
            <Link href={href({ tab, area, q: text })} className="flex items-center gap-1 text-[14px] font-bold text-sub md:hidden"><ChevronLeft size={16} /> 프롬프트 보관함</Link>
            <span className="flex flex-wrap items-center gap-1.5 text-[12px] font-bold">
              <span className={cx("rounded-chip px-1.5 py-px", selected.builtin ? "bg-soft text-sub" : selected.official ? "bg-key-soft text-key-strong" : "bg-ok-soft text-ok")}>{selected.builtin ? "앱 기본" : selected.official ? "공식" : selected.public ? "공유" : "비공개"}</span>
              <span className="text-sub">{where(selected)}</span>
            </span>
            <div className="flex items-start gap-3">
              <h2 className="min-w-0 flex-1 text-[20px] font-bold leading-snug md:text-[22px]">{selected.title}</h2>
              <StarButton p={selected} big />
            </div>
            <p className="text-[12px] text-mute">{selected.authorName}{selected.updatedAt ? ` · ${day(selected.updatedAt)}` : ""} · {selected.body.length.toLocaleString("ko-KR")}자</p>
            <hr className="border-line" />
            <div className="max-h-[56vh] overflow-y-auto whitespace-pre-line break-words text-[14px] leading-6 text-[#333d4b]">{selected.body}</div>
            {selected.builtin && <p className="text-[12px] text-mute">AI 쓰기가 늘 쓰는 바탕이에요. 내 스타일을 켜면 이 위에 내 프롬프트가 더해져요.</p>}
            {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
            {note && <p className="text-[13px] font-medium text-ok" role="status">{note}</p>}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" onClick={copy} className="flex h-9 items-center gap-1.5 rounded-control bg-soft px-3 text-[13px] font-bold text-sub"><Copy size={14} /> 복사</button>
              {!selected.builtin && (
                <button type="button" onClick={use} disabled={pending || !fitsStyle(selected.body)}
                  title={fitsStyle(selected.body) ? undefined : `내 스타일은 ${STYLE_LIMITS.prompt.toLocaleString("ko-KR")}자까지예요`}
                  className="flex h-9 items-center gap-1.5 rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong disabled:opacity-50">내 스타일에 넣기</button>
              )}
              <ShareToRoomButton preset={{ kind: "프롬프트", title: selected.title, body: selected.body.slice(0, 4000), meta: { area: selected.area, subject: selected.subject } }} />
              <span className="flex-1" />
              {editable && <button type="button" onClick={() => setEdit(true)} className="text-[13px] font-medium text-sub hover:text-ink">고치기</button>}
              {editable && <button type="button" onClick={remove} disabled={pending} className="text-[13px] font-medium text-bad">지우기</button>}
            </div>
          </article>
        )}
      </div>
      {edit && selected && <PromptDialog prompt={selected} admin={admin} onClose={() => setEdit(false)} />}
    </div>
  );
}

function PromptDialog({ prompt, admin, onClose }: { prompt?: PromptDoc; admin: boolean; onClose: () => void }) {
  const router = useRouter();
  const [official, setOfficial] = useState(prompt?.official ?? false);
  const [pub, setPub] = useState(prompt?.public ?? true);
  const [area, setArea] = useState<StyleArea>(prompt?.area ?? "세특");
  const [subject, setSubject] = useState(prompt?.subject ?? "");
  const [title, setTitle] = useState(prompt?.title ?? "");
  const [body, setBody] = useState(prompt?.body ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const read = (f: File) => start(async () => {
    setError("");
    const fd = new FormData();
    fd.set("file", f);
    const r = await readPromptFile(fd);
    if (!r.ok) return setError(r.error);
    setBody(r.text.slice(0, PROMPT_LIMITS.body));
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, PROMPT_LIMITS.title));
  });
  const save = () => start(async () => {
    setError("");
    const r = await savePrompt({ id: prompt?.id, official, public: pub, area, subject: area === "세특" ? subject : null, title, body });
    if (!r.ok) return setError(r.error);
    onClose();
    router.push(`/teacher/prompts?${new URLSearchParams({ ...(official ? {} : { tab: pub ? "공유" : "내 프롬프트" }), p: r.id })}`);
  });
  const chip = (on: boolean) => cx("h-[34px] rounded-control border px-3 text-[13px]", on ? "border-key bg-key-soft font-bold text-key-strong" : "border-hair font-medium text-sub");
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={prompt ? "프롬프트 고치기" : "프롬프트 올리기"}>
      <div className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-5 pt-4 md:max-w-[640px] md:rounded-[16px] md:px-7 md:py-6">
        <div className="flex items-center">
          <h2 className="flex-1 text-[18px] font-bold">{prompt ? "프롬프트 고치기" : "프롬프트 올리기"}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-mute hover:text-ink"><X size={20} /></button>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">공개</span>
          <div className="flex flex-wrap gap-1.5">
            {admin && <button type="button" onClick={() => setOfficial(true)} aria-pressed={official} className={chip(official)}>공식 (학교)</button>}
            <button type="button" onClick={() => { setOfficial(false); setPub(true); }} aria-pressed={!official && pub} className={chip(!official && pub)}>공유 (모두에게)</button>
            <button type="button" onClick={() => { setOfficial(false); setPub(false); }} aria-pressed={!official && !pub} className={chip(!official && !pub)}>나만 보기</button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">영역</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {STYLE_AREAS.map((a) => <button key={a} type="button" onClick={() => setArea(a)} aria-pressed={area === a} className={chip(area === a)}>{a}</button>)}
            {area === "세특" && <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={PROMPT_LIMITS.subject} placeholder="과목 (예: 화학Ⅱ)" className={cx(field, "h-[34px] w-[160px] text-[14px] text-ink")} />}
          </div>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">제목
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={PROMPT_LIMITS.title} placeholder="예: 화학 탐구 보고서형 세특" className={cx(field, "h-11 text-ink")} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">
          <span className="flex items-center gap-2">프롬프트
            <button type="button" onClick={() => file.current?.click()} disabled={pending} className="flex items-center gap-1 rounded-chip bg-soft px-2 py-0.5 text-[12px] font-bold text-sub hover:text-ink"><FileUp size={12} /> 문서에서 불러오기</button>
            <span className={cx("ml-auto text-[12px]", fitsStyle(body) ? "text-mute" : "text-[#9a6400]")}>{body.length.toLocaleString("ko-KR")} / {PROMPT_LIMITS.body.toLocaleString("ko-KR")}{!fitsStyle(body) && ` · 내 스타일은 ${STYLE_LIMITS.prompt.toLocaleString("ko-KR")}자까지`}</span>
          </span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={PROMPT_LIMITS.body} rows={10} placeholder="AI에게 줄 지시를 적어 주세요 — 구조 · 문장 길이 · 서술어 · 꼭 넣을 것 · 피할 것" className={cx(field, "resize-y py-3 leading-6 text-ink")} />
        </label>
        <input ref={file} type="file" accept=".hwpx,.pptx,.txt,.md" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ""; }} />
        {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        <div className="flex items-center gap-2">
          <span className="hidden flex-1 text-[12px] text-mute md:block">학생 이름 · 학번은 쓰지 않아요</span>
          <Button type="button" kind="outline" className="flex-1 md:flex-none" onClick={onClose}>취소</Button>
          <Button type="button" className="flex-1 md:flex-none" disabled={pending} onClick={save}>{pending ? "저장 중…" : prompt ? "고치기" : "올리기"}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
