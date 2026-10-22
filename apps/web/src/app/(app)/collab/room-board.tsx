"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, ExternalLink, Plus, Search, UserPlus, X } from "lucide-react";
import { Avatar, Button, cx } from "@/components/ui";
import { COLLAB_KINDS, COLLAB_LIMITS, KIND_LABEL, type CollabItem, type CollabKind, type CollabRoom } from "@/lib/domain/collab";
import { STYLE_AREAS, type StyleArea } from "@/lib/domain/writing-style";
import { applyRoomPrompt, closeRoomAction, createRoomAction, deleteItemAction, inviteAction, removeMemberAction, saveItemAction, updateRoomAction } from "./actions";

// 협업방 (Figma N69 a · b · c): 방 머리 · 종류 탭 · 목록(누르면 펼침) · 멤버 · 초대 창 · 올리기 창 · 새 방 만들기.

type Row = CollabItem & { editable: boolean; deletable: boolean };
type Teacher = { id: string; name: string; dept: string | null };

const KIND_TONE: Record<CollabKind, string> = {
  메모: "bg-key-soft text-key-strong", 수행평가: "bg-ok-soft text-ok", 차시: "bg-wait-soft text-[#9a6400]", 프롬프트: "bg-new-soft text-new", 자료: "bg-soft text-sub",
};
const day = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(iso));
const field = "rounded-control bg-soft px-3 text-[15px] text-ink outline-none focus:ring-2 focus:ring-key";

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[16px] bg-[#fff] px-5 pb-5 pt-4 md:max-w-[600px] md:rounded-[16px] md:px-7 md:py-6">
        <div className="flex items-center">
          <h2 className="flex-1 text-[18px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-mute hover:text-ink"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function NewRoomForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [intro, setIntro] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    setError("");
    const r = await createRoomAction({ name, intro });
    if (!r.ok) return setError(r.error);
    router.push(`/collab/${r.id}?invite=1`);
    router.refresh();
  });
  return (
    <div className="surface flex max-w-[640px] flex-col gap-4 rounded-card p-5 md:p-7">
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">방 이름
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={COLLAB_LIMITS.name} placeholder="예: 2학년 융합 수업 · 과학과 협의회 · 독서 프로젝트" className={cx(field, "h-11")} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">소개 (선택)
        <textarea value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={COLLAB_LIMITS.intro} rows={3} placeholder="무엇을 함께 하는 방인지 한두 줄로" className={cx(field, "resize-y py-2.5 leading-6")} />
      </label>
      <p className="text-[12px] text-mute">만든 뒤 방에서 선생님을 초대해요. 교과 · 학년이 달라도 돼요.</p>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
      <div className="flex justify-end"><Button type="button" disabled={pending} onClick={save}>{pending ? "만드는 중…" : "방 만들기"}</Button></div>
    </div>
  );
}

export function RoomHeaderActions({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> 올리기</Button>
      {open && <ItemDialog roomId={roomId} onClose={() => setOpen(false)} />}
    </>
  );
}

export function RoomBoard({ room, items, counts, kind, text, selectedId, me, manage, member, teachers }: {
  room: CollabRoom; items: Row[]; counts: Record<string, number>; kind: string; text: string; selectedId: string | null;
  me: string; manage: boolean; member: boolean; teachers: Teacher[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(selectedId);
  const [edit, setEdit] = useState<Row | null>(null);
  // 방을 막 만들었으면(?invite=1) 초대 창부터
  const [invite, setInvite] = useState(useSearchParams().get("invite") === "1");
  const [settings, setSettings] = useState(false);
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const href = (q: { k?: string; q?: string }) => {
    const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v && v !== "전체") as [string, string][]);
    return `/collab/${room.id}${p.size ? `?${p}` : ""}`;
  };
  const copy = async (x: Row) => { try { await navigator.clipboard.writeText(`${x.title}\n${x.body}`); setNote({ id: x.id, text: "복사했어요" }); } catch { /* 복사 막힘 */ } };
  const takePrompt = (x: Row) => start(async () => {
    setError("");
    const r = await applyRoomPrompt(room.id, x.id);
    if (!r.ok) return setError(r.error);
    try { localStorage.setItem(`schs-style-${r.area}`, "on"); } catch { /* 이번에만 */ }
    setNote({ id: x.id, text: `${r.area} 글 짓기 내 스타일에 넣었어요 (켜짐)` });
  });
  const remove = (x: Row) => window.confirm("이 글을 지울까요?") && start(async () => {
    const r = await deleteItemAction(room.id, x.id);
    if (!r.ok) return setError(r.error);
    router.refresh();
  });
  const leave = () => window.confirm("이 방에서 나갈까요?") && start(async () => {
    const r = await removeMemberAction(room.id, me);
    if (!r.ok) return setError(r.error);
    router.push("/collab");
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-4">
      {room.intro && <p className="-mt-2 text-[14px] text-sub">{room.intro}</p>}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:rounded-control md:bg-soft md:p-1 md:px-1" aria-label="종류">
          {(["전체", ...COLLAB_KINDS] as const).map((k) => (
            <Link key={k} href={href({ k, q: text })} aria-current={kind === k ? "page" : undefined}
              className={cx("flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-[8px] px-3.5 text-[14px] max-md:border",
                kind === k ? "bg-[#fff] font-bold text-ink md:shadow-sm max-md:border-key max-md:bg-key-soft max-md:text-key-strong" : "font-medium text-sub max-md:border-line max-md:bg-[#fff]")}>
              {k === "전체" ? k : KIND_LABEL[k]} <span className="text-[12px] font-medium text-mute">{counts[k] ?? 0}</span>
            </Link>
          ))}
        </nav>
        <form action={`/collab/${room.id}`} className="flex h-10 items-center gap-2 rounded-control border border-line bg-[#fff] px-3 md:ml-auto md:w-[260px]">
          {kind !== "전체" && <input type="hidden" name="k" value={kind} />}
          <Search size={15} className="text-mute" />
          <input name="q" defaultValue={text} placeholder="방 안에서 찾기" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
        </form>
      </div>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}

      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_300px] md:gap-6">
        <ul className="flex flex-col gap-2">
          {items.length === 0 && (
            <li className="rounded-inner bg-[#fff] px-4 py-10 text-center text-[14px] text-sub">
              아직 올린 것이 없어요 — 오른쪽 위 <b>＋ 올리기</b>, 또는 수행평가 · 프롬프트 보관함 글의 <b>협업방에 올리기</b>
            </li>
          )}
          {items.map((x) => {
            const open = openId === x.id;
            return (
              <li key={x.id} className="rounded-inner bg-[#fff]">
                <button type="button" onClick={() => setOpenId(open ? null : x.id)} aria-expanded={open} className="flex w-full flex-col gap-1.5 px-4 py-3.5 text-left">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={cx("shrink-0 rounded-chip px-1.5 py-px text-[12px] font-bold", KIND_TONE[x.kind])}>{KIND_LABEL[x.kind]}</span>
                    <span className="truncate text-[15px] font-bold">{x.title}</span>
                    {x.meta.date && <span className="shrink-0 text-[12px] text-mute">{x.meta.date}</span>}
                  </span>
                  {!open && x.body && <span className="line-clamp-2 text-[13px] leading-5 text-sub">{x.body.replace(/\s+/g, " ")}</span>}
                  <span className="truncate text-[12px] text-mute">{[x.meta.subject, x.meta.area, x.authorName, x.editorName && x.editorName !== x.authorName ? `${x.editorName} 고침` : null, day(x.updatedAt)].filter(Boolean).join(" · ")}</span>
                </button>
                {open && (
                  <div className="flex flex-col gap-3 border-t border-line px-4 pb-4 pt-3">
                    {x.body && <div className="whitespace-pre-line break-words text-[14px] leading-6 text-[#333d4b]">{x.body}</div>}
                    {x.meta.url && <a href={x.meta.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 break-all text-[13px] font-bold text-key-strong hover:underline"><ExternalLink size={13} /> {x.meta.url}</a>}
                    {note?.id === x.id && <p className="text-[13px] font-medium text-ok" role="status">{note.text}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => copy(x)} className="flex h-9 items-center gap-1.5 rounded-control bg-soft px-3 text-[13px] font-bold text-sub"><Copy size={14} /> 복사</button>
                      {x.kind === "프롬프트" && <button type="button" disabled={pending} onClick={() => takePrompt(x)} className="flex h-9 items-center rounded-control bg-key-soft px-3 text-[13px] font-bold text-key-strong">내 스타일에 넣기</button>}
                      {x.kind === "수행평가" && <Link href="/teacher/setuk/assessments" className="flex h-9 items-center rounded-control bg-ok-soft px-3 text-[13px] font-bold text-ok">내 수업으로 — 수행평가 등록 › 협업방에서 가져오기</Link>}
                      <span className="flex-1" />
                      {x.editable && <button type="button" onClick={() => setEdit(x)} className="text-[13px] font-medium text-sub hover:text-ink">고치기</button>}
                      {x.deletable && <button type="button" onClick={() => remove(x)} disabled={pending} className="text-[13px] font-medium text-bad">지우기</button>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <aside className="surface flex flex-col gap-3 rounded-card p-5 md:sticky md:top-6">
          <div className="flex items-center">
            <h3 className="flex-1 text-[16px] font-bold">멤버 {room.members.length}</h3>
            {member && <button type="button" onClick={() => setInvite(true)} className="flex items-center gap-1 rounded-chip bg-key-soft px-2.5 py-1 text-[13px] font-bold text-key-strong"><UserPlus size={14} /> 초대</button>}
          </div>
          <ul className="flex flex-col gap-2">
            {room.members.map((m) => (
              <li key={m.teacherId} className="flex items-center gap-2.5">
                <Avatar name={m.name} size={28} />
                <span className="text-[14px] font-bold">{m.name}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-mute">{[m.dept, m.owner ? "방장" : null].filter(Boolean).join(" · ")}</span>
                {manage && !m.owner && <button type="button" onClick={() => window.confirm(`${m.name} 선생님을 내보낼까요?`) && start(async () => { const r = await removeMemberAction(room.id, m.teacherId); if (!r.ok) setError(r.error); else router.refresh(); })} className="text-[12px] text-mute hover:text-bad">내보내기</button>}
              </li>
            ))}
          </ul>
          <hr className="border-line" />
          <p className="text-[12px] text-mute">방에 올린 것은 멤버 모두가 봐요. 학생 이름 · 학번은 올라가지 않아요. 메모는 멤버 누구나 고쳐요.</p>
          <div className="flex gap-3 text-[13px] font-medium text-sub">
            {manage && <button type="button" onClick={() => setSettings(true)} className="hover:text-ink">방 고치기 · 닫기</button>}
            {member && !manage && <button type="button" onClick={leave} className="hover:text-bad">방 나가기</button>}
          </div>
        </aside>
      </div>
      {edit && <ItemDialog roomId={room.id} item={edit} onClose={() => setEdit(null)} />}
      {invite && <InviteDialog roomId={room.id} teachers={teachers} onClose={() => setInvite(false)} />}
      {settings && <RoomSettings room={room} onClose={() => setSettings(false)} />}
    </div>
  );
}

function InviteDialog({ roomId, teachers, onClose }: { roomId: string; teachers: Teacher[]; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const shown = useMemo(() => teachers.filter((t) => `${t.name} ${t.dept ?? ""}`.includes(q.trim())).slice(0, 60), [teachers, q]);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const go = () => start(async () => {
    const r = await inviteAction(roomId, [...picked]);
    if (!r.ok) return setError(r.error);
    onClose();
    router.replace(`/collab/${roomId}`);
    router.refresh();
  });
  return (
    <Shell title="멤버 초대" onClose={onClose}>
      <p className="-mt-2 text-[13px] text-sub">우리 학교 선생님을 골라요. 교과 · 학년이 달라도 돼요. 초대하면 바로 멤버가 돼요.</p>
      <div className="flex h-11 items-center gap-2 rounded-control bg-soft px-3">
        <Search size={15} className="text-mute" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 부서로 찾기" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" autoFocus />
      </div>
      <ul className="flex max-h-[44vh] flex-col overflow-y-auto">
        {shown.length === 0 && <li className="py-6 text-center text-[13px] text-mute">{teachers.length ? "맞는 선생님이 없어요" : "모든 선생님이 이미 멤버예요"}</li>}
        {shown.map((t) => {
          const on = picked.has(t.id);
          return (
            <li key={t.id}>
              <button type="button" onClick={() => toggle(t.id)} aria-pressed={on} className="flex w-full items-center gap-3 rounded-control px-1 py-2 text-left hover:bg-soft">
                <span className={cx("flex size-5 items-center justify-center rounded-[5px] border", on ? "border-key bg-key text-[#fff]" : "border-line bg-[#fff]")}>{on && <Check size={13} />}</span>
                <span className="text-[15px] font-bold">{t.name}</span>
                <span className="text-[13px] text-mute">{t.dept}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
      <Button type="button" disabled={pending || !picked.size} onClick={go}>{pending ? "초대하는 중…" : `${picked.size}명 초대`}</Button>
    </Shell>
  );
}

function RoomSettings({ room, onClose }: { room: CollabRoom; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(room.name);
  const [intro, setIntro] = useState(room.intro);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await updateRoomAction(room.id, { name, intro });
    if (!r.ok) return setError(r.error);
    onClose(); router.refresh();
  });
  const close = () => window.confirm("방을 닫을까요? 멤버 모두에게서 사라져요 (올린 글은 기록으로 남아요)") && start(async () => {
    const r = await closeRoomAction(room.id);
    if (!r.ok) return setError(r.error);
    router.push("/collab"); router.refresh();
  });
  return (
    <Shell title="방 고치기" onClose={onClose}>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">방 이름<input value={name} onChange={(e) => setName(e.target.value)} maxLength={COLLAB_LIMITS.name} className={cx(field, "h-11")} /></label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">소개<textarea value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={COLLAB_LIMITS.intro} rows={3} className={cx(field, "resize-y py-2.5 leading-6")} /></label>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={close} disabled={pending} className="text-[13px] font-medium text-bad">방 닫기</button>
        <span className="flex-1" />
        <Button type="button" kind="outline" onClick={onClose}>취소</Button>
        <Button type="button" disabled={pending} onClick={save}>저장</Button>
      </div>
    </Shell>
  );
}

/** 올리기 · 고치기 창. preset = 다른 화면에서 "협업방에 올리기"로 연 경우 */
export function ItemDialog({ roomId, item, preset, rooms, onClose, onSaved }: {
  roomId?: string; item?: CollabItem; preset?: Partial<Pick<CollabItem, "kind" | "title" | "body" | "meta">>;
  rooms?: { id: string; name: string }[]; onClose: () => void; onSaved?: (roomId: string) => void;
}) {
  const router = useRouter();
  const [room, setRoom] = useState(roomId ?? rooms?.[0]?.id ?? "");
  const [kind, setKind] = useState<CollabKind>(item?.kind ?? preset?.kind ?? "메모");
  const [title, setTitle] = useState(item?.title ?? preset?.title ?? "");
  const [body, setBody] = useState(item?.body ?? preset?.body ?? "");
  const [date, setDate] = useState(item?.meta.date ?? preset?.meta?.date ?? "");
  const [subject, setSubject] = useState(item?.meta.subject ?? preset?.meta?.subject ?? "");
  const [area, setArea] = useState<StyleArea>((item?.meta.area ?? preset?.meta?.area ?? "세특") as StyleArea);
  const [url, setUrl] = useState(item?.meta.url ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    setError("");
    const r = await saveItemAction({ id: item?.id, roomId: room, kind, title, body, meta: { date: date || null, subject: subject || null, area, url: url || null } });
    if (!r.ok) return setError(r.error);
    onClose();
    if (onSaved) onSaved(room); else router.refresh();
  });
  const chip = (on: boolean) => cx("h-[34px] rounded-control border px-3 text-[13px]", on ? "border-key bg-key-soft font-bold text-key-strong" : "border-hair font-medium text-sub");
  return (
    <Shell title={item ? "고치기" : "협업방에 올리기"} onClose={onClose}>
      {rooms && !roomId && (
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">방
          {rooms.length ? (
            <select value={room} onChange={(e) => setRoom(e.target.value)} className={cx(field, "h-11")}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          ) : <span className="text-[13px] text-mute">든 협업방이 없어요 — <Link href="/collab/new" className="font-bold text-key-strong">새 협업방</Link></span>}
        </label>
      )}
      {!item && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">종류</span>
          <div className="flex flex-wrap gap-1.5">{COLLAB_KINDS.map((k) => <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={chip(kind === k)}>{KIND_LABEL[k]}</button>)}</div>
        </div>
      )}
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">제목
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={COLLAB_LIMITS.title} placeholder={kind === "메모" ? "예: 융합 수업 일정 맞추기" : kind === "수행평가" ? "예: 빗면 실험 보고서" : kind === "차시" ? "예: 5차시 에너지 전환 탐구" : kind === "프롬프트" ? "예: 탐구 보고서형 세특" : "예: 공동 보고서 양식"} className={cx(field, "h-11")} />
      </label>
      {(kind === "수행평가" || kind === "차시") && (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">날짜 (선택)<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cx(field, "h-11")} /></label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">과목 (선택)<input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={30} placeholder="예: 물리학" className={cx(field, "h-11")} /></label>
        </div>
      )}
      {kind === "프롬프트" && (
        <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[13px] font-medium text-sub">영역</span>{STYLE_AREAS.map((a) => <button key={a} type="button" onClick={() => setArea(a)} aria-pressed={area === a} className={chip(area === a)}>{a}</button>)}</div>
      )}
      {kind === "자료" && (
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">링크 (선택)<input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={COLLAB_LIMITS.url} placeholder="https://docs.google.com/…" className={cx(field, "h-11")} /></label>
      )}
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-sub">
        <span className="flex">{kind === "수행평가" ? "평가 내용 · 기준" : kind === "프롬프트" ? "프롬프트" : "내용"}<span className="ml-auto text-[12px] text-mute">{body.length.toLocaleString("ko-KR")} / {COLLAB_LIMITS.body.toLocaleString("ko-KR")}</span></span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={COLLAB_LIMITS.body} rows={7} className={cx(field, "resize-y py-3 leading-6")} />
      </label>
      {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
      <div className="flex items-center gap-2">
        <span className="hidden flex-1 text-[12px] text-mute md:block">학생 이름 · 학번은 쓰지 않아요</span>
        <Button type="button" kind="outline" className="flex-1 md:flex-none" onClick={onClose}>취소</Button>
        <Button type="button" className="flex-1 md:flex-none" disabled={pending || !room} onClick={save}>{pending ? "저장 중…" : item ? "고치기" : "올리기"}</Button>
      </div>
    </Shell>
  );
}
