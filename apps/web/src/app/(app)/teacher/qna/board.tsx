"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronLeft, MessageCircleQuestion, Plus, Search, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { QNA_CATEGORIES, QNA_LIMITS, type QnaCategory, type QnaPost } from "@/lib/domain/qna";
import { answerQuestionAction, deleteQuestionAction, saveQuestion } from "./actions";

// 문의 게시판 (도구, 2026-10-22): 분류 칩 · 답 여부 · 찾기 · 목록 · 문답(답하기는 관리자) · 묻기 창. 생기부 팁 게시판과 같은 틀.

const day = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" }).format(new Date(iso));
const href = (q: { cat?: string; s?: string; q?: string; t?: string }) => {
  const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v && v !== "전체") as [string, string][]);
  return `/teacher/qna${p.size ? `?${p}` : ""}`;
};
const field = "rounded-control bg-soft px-3 text-[15px] outline-none focus:ring-2 focus:ring-key";

function StateChip({ answered }: { answered: boolean }) {
  return <span className={cx("shrink-0 rounded-chip px-1.5 py-px text-[12px] font-bold", answered ? "bg-ok-soft text-ok" : "bg-wait-soft text-[#9a6400]")}>{answered ? "답변 완료" : "답변 대기"}</span>;
}

export function AskButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> <span className="md:hidden">묻기</span><span className="hidden md:inline">문의하기</span></Button>
      {open && <AskDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export function QnaBoard({ posts, counts, waiting, cat, state, text, selected, detailOnly, editable, admin }: {
  posts: QnaPost[]; counts: Record<string, number>; waiting: number; cat: string; state: string; text: string;
  selected: QnaPost | null; detailOnly: boolean; editable: boolean; admin: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const remove = () => selected && window.confirm("이 문의를 지울까요?") && start(async () => {
    const r = await deleteQuestionAction(selected.id);
    if (!r.ok) return setError(r.error);
    router.push(href({ cat, s: state, q: text }));
  });
  const saveAnswer = () => selected && answer !== null && start(async () => {
    setError("");
    const r = await answerQuestionAction(selected.id, answer);
    if (!r.ok) return setError(r.error);
    setAnswer(null);
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-4">
      <div className={cx("flex flex-col gap-3", detailOnly && "max-md:hidden")}>
        <p className="text-[14px] text-sub">쓰다가 막힌 점을 물어 주세요. 교육과정부가 답하고, 답은 여기 쌓여 다른 선생님도 찾아볼 수 있어요.{admin && waiting > 0 && <b className="ml-1 text-[#9a6400]">답변 대기 {waiting}개</b>}</p>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <form action="/teacher/qna" className="flex h-10 items-center gap-2 rounded-control border border-line bg-[#fff] px-3 md:order-2 md:ml-auto md:w-[280px]">
            {cat !== "전체" && <input type="hidden" name="cat" value={cat} />}
            {state !== "전체" && <input type="hidden" name="s" value={state} />}
            <Search size={15} className="text-mute" />
            <input name="q" defaultValue={text} placeholder="찾기 — 예: 조각 지우기, 분반" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
          </form>
          <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0" aria-label="분류">
            {(["전체", ...QNA_CATEGORIES] as const).map((c) => (
              <Link key={c} href={href({ cat: c, s: state, q: text })} aria-current={cat === c ? "page" : undefined}
                className={cx("flex h-[34px] shrink-0 items-center gap-1 whitespace-nowrap rounded-control border px-3 text-[13px]", cat === c ? "border-key bg-key-soft font-bold text-key-strong" : "border-line bg-[#fff] font-medium text-sub")}>
                {c} <span className="text-[12px] font-medium text-mute">{counts[c] ?? 0}</span>
              </Link>
            ))}
          </nav>
        </div>
        <nav className="flex gap-3 text-[13px]" aria-label="답 여부">
          {(["전체", "답변 완료", "답변 대기"] as const).map((s) => (
            <Link key={s} href={href({ cat, s, q: text })} aria-current={state === s ? "page" : undefined}
              className={cx(state === s ? "font-bold text-key-strong underline underline-offset-4" : "font-medium text-sub")}>{s}</Link>
          ))}
        </nav>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] md:gap-6">
        <ul className={cx("flex flex-col gap-2", detailOnly && "max-md:hidden")}>
          {posts.length === 0 && <li className="rounded-inner bg-[#fff] px-4 py-8 text-center text-[14px] text-sub">맞는 문의가 없어요</li>}
          {posts.map((p) => {
            const on = selected?.id === p.id;
            return (
              <li key={p.id}>
                <Link href={href({ cat, s: state, q: text, t: p.id })} aria-current={on ? "true" : undefined}
                  className={cx("flex flex-col gap-1.5 rounded-inner px-4 py-3.5", on ? "md:bg-key-soft bg-[#fff]" : "bg-[#fff] hover:bg-soft")}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <StateChip answered={!!p.answer} />
                    <span className={cx("truncate text-[15px] font-bold", on && "md:text-key-strong")}>{p.title}</span>
                  </span>
                  <span className="line-clamp-2 text-[13px] leading-5 text-sub">{(p.answer ?? p.question).replace(/\s+/g, " ")}</span>
                  <span className="truncate text-[12px] text-mute">{p.category} · {p.authorName} · {day(p.createdAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {selected && (
          <article className={cx("surface flex flex-col gap-3.5 rounded-card p-4 md:sticky md:top-6 md:p-7", !detailOnly && "max-md:hidden")}>
            <Link href={href({ cat, s: state, q: text })} className="flex items-center gap-1 text-[14px] font-bold text-sub md:hidden"><ChevronLeft size={16} /> 문의 게시판</Link>
            <span className="flex items-center gap-1.5"><StateChip answered={!!selected.answer} /><span className="text-[12px] font-bold text-sub">{selected.category}</span></span>
            <h2 className="text-[20px] font-bold leading-snug md:text-[22px]">{selected.title}</h2>
            <p className="text-[12px] text-mute">{selected.authorName} · {day(selected.createdAt)}</p>
            <div className="flex gap-2 rounded-inner bg-soft px-4 py-3">
              <b className="text-[15px] text-key-strong">Q</b>
              <p className="whitespace-pre-line text-[14px] leading-6 text-[#333d4b]">{selected.question}</p>
            </div>
            {selected.answer && answer === null && (
              <div className="flex gap-2 px-4 py-1">
                <b className="text-[15px] text-ok">A</b>
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="whitespace-pre-line text-[14px] leading-6 text-[#333d4b]">{selected.answer}</p>
                  <p className="text-[12px] text-mute">{selected.answeredBy ?? "교육과정부"}{selected.answeredAt ? ` · ${day(selected.answeredAt)}` : ""}</p>
                </div>
              </div>
            )}
            {!selected.answer && answer === null && (
              <p className="flex items-center gap-1.5 px-1 text-[13px] text-sub"><MessageCircleQuestion size={15} /> 교육과정부가 확인하고 답을 달아요</p>
            )}
            {answer !== null && (
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">
                <span className="flex">답<span className="ml-auto text-[12px] text-mute">{answer.length.toLocaleString("ko-KR")} / {QNA_LIMITS.answer.toLocaleString("ko-KR")}</span></span>
                <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={QNA_LIMITS.answer} rows={8} autoFocus
                  placeholder="어디서 · 무엇을 누르면 되는지 적어 주세요 (줄바꿈 그대로 보여요)" className={cx(field, "resize-y py-3 leading-6 text-ink")} />
              </label>
            )}
            {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
            <div className="flex items-center gap-3 pt-1">
              {admin && answer === null && <button type="button" onClick={() => setAnswer(selected.answer ?? "")} className="flex h-9 items-center rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong">{selected.answer ? "답 고치기" : "답하기"}</button>}
              {answer !== null && <>
                <Button type="button" size="sm" disabled={pending} onClick={saveAnswer}>{pending ? "저장 중…" : "답 저장"}</Button>
                <Button type="button" size="sm" kind="outline" onClick={() => setAnswer(null)}>취소</Button>
              </>}
              <span className="flex-1" />
              {editable && answer === null && !selected.answer && <button type="button" onClick={() => setEdit(true)} className="text-[13px] font-medium text-sub hover:text-ink">질문 고치기</button>}
              {editable && answer === null && <button type="button" onClick={remove} disabled={pending} className="text-[13px] font-medium text-bad">지우기</button>}
            </div>
          </article>
        )}
      </div>
      {edit && selected && <AskDialog post={selected} onClose={() => setEdit(false)} />}
    </div>
  );
}

function AskDialog({ post, onClose }: { post?: QnaPost; onClose: () => void }) {
  const router = useRouter();
  const [category, setCategory] = useState<QnaCategory>(post?.category ?? "조각 · 글 짓기");
  const [title, setTitle] = useState(post?.title ?? "");
  const [question, setQuestion] = useState(post?.question ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    setError("");
    const r = await saveQuestion({ id: post?.id, category, title, question });
    if (!r.ok) return setError(r.error);
    onClose();
    router.push(`/teacher/qna?t=${r.id}`);
  });
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={post ? "질문 고치기" : "문의하기"}>
      <div className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-5 pt-4 md:max-w-[600px] md:rounded-[16px] md:px-7 md:py-6">
        <div className="flex items-center">
          <h2 className="flex-1 text-[18px] font-bold">{post ? "질문 고치기" : "문의하기"}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-mute hover:text-ink"><X size={20} /></button>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">분류</span>
          <div className="flex flex-wrap gap-1.5">
            {QNA_CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
                className={cx("h-[34px] rounded-control border px-3 text-[13px]", category === c ? "border-key bg-key-soft font-bold text-key-strong" : "border-hair font-medium text-sub")}>{c}</button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">제목
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={QNA_LIMITS.title} placeholder="예: 이동반 명단이 반마다 따로 보여요" className={cx(field, "h-11 text-ink")} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">
          <span className="flex">질문<span className="ml-auto text-[12px] text-mute">{question.length.toLocaleString("ko-KR")} / {QNA_LIMITS.question.toLocaleString("ko-KR")}</span></span>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={QNA_LIMITS.question} rows={7} placeholder="어느 화면에서 무엇을 하다가 막혔는지 적어 주세요" className={cx(field, "resize-y py-3 leading-6 text-ink")} />
        </label>
        {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
        <div className="flex items-center gap-2">
          <span className="hidden flex-1 text-[12px] text-mute md:block">학생 이름 · 학번은 쓰지 않아요</span>
          <Button type="button" kind="outline" className="flex-1 md:flex-none" onClick={onClose}>취소</Button>
          <Button type="button" className="flex-1 md:flex-none" disabled={pending} onClick={save}>{pending ? "올리는 중…" : post ? "고치기" : "올리기"}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
