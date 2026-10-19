"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Tag, cx } from "@/components/ui";
import { serviceActivityCheck } from "@/lib/domain/length";
import { confirmService, updateServiceActivity } from "../../teacher/service/actions";
import { ServiceLengthChip, ShortenBox, ShortenButton, useShorten } from "../../teacher/service/service-length";

// 봉사 받은함 행 (Figma N42 ④ (h) 493:28447 · 모바일 495:7585): 제목 · 보낸 정보 · "활동내용" 줄 + 길이 칩.
// 넘은 행은 [✦ 줄이기] [확인] — 줄이기 → 행 아래 상자에서 고칠 수 있는 줄인 글 + "바꾸고 확인"(활동내용 저장 + 확인 한 번에, 확인서 파일 그대로).
// 넘은 채 "확인"도 된다.

export function InboxRow({ id, studentId, title, meta, activity, waiting, last }: {
  id: string; studentId: string; title: string; meta: string; activity: string; waiting: boolean; last?: boolean;
}) {
  const over = serviceActivityCheck(activity).over;
  const sh = useShorten(activity, studentId);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const apply = (v: string) => start(async () => {
    const r = await updateServiceActivity({ id, activity: v, confirm: true });
    if (!r.ok) { setErr(r.error); return; }
    setErr(null);
    router.refresh();
  });
  return (
    <div className={cx("flex flex-col gap-3 py-3.5", !last && "border-b border-line")}>
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold">{title}</div>
          <div className="truncate text-[13px] text-mute">{meta}</div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[13px]">
            <span className="shrink-0 text-sub">활동내용</span>
            <span className="min-w-0 truncate">{activity}</span>
            <ServiceLengthChip text={activity} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 max-md:[&>*]:flex-1">
          <a href={`/service/file/${id}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center whitespace-nowrap px-1 text-[13px] text-key-strong max-md:flex-none">확인서</a>
          {waiting && over && !sh.res && <ShortenButton sh={sh} />}
          {waiting ? (
            <form action={confirmService} className="flex">
              <input type="hidden" name="id" value={id} />
              <Button kind="outline" size="sm" className="h-9 w-full px-4 font-bold md:w-[64px] md:px-0">확인</Button>
            </form>
          ) : <Tag>확정</Tag>}
        </div>
      </div>
      {waiting && over && sh.res && (
        <ShortenBox text={activity} studentId={studentId} sh={sh} line={false} editable busy={pending}
          onApply={apply} applyLabel={pending ? "바꾸는 중…" : "바꾸고 확인"} hint="바꾸면 확인서 원문은 그대로 남고, 활동내용만 바뀌어요" />
      )}
      {err && <p className="text-[12px] text-bad" role="alert">{err}</p>}
    </div>
  );
}
