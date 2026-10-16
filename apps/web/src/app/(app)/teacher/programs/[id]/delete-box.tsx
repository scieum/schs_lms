"use client";
import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { deleteProgram, type DeleteState } from "./actions";

// 프로그램 삭제: 이름을 똑같이 써야 버튼이 켜진다. 응답·서류·초안이 함께 지워진다
export function DeleteBox({ programId, title, counts }: { programId: string; title: string; counts: string }) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteProgram, {});
  const [typed, setTyped] = useState("");
  return (
    <details className="surface rounded-card px-5 py-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[14px] font-medium text-sub">
        <Trash2 size={15} /> 프로그램 삭제
      </summary>
      <form action={action} className="mt-3 flex flex-col gap-2.5">
        <input type="hidden" name="programId" value={programId} />
        <p className="text-[13px] text-sub">{counts}이 함께 지워지고 되돌릴 수 없어요. 확정된 초안이 있으면 지울 수 없어요.</p>
        <div className="flex flex-col gap-2 md:flex-row">
          <input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`"${title}" 이라고 써 주세요`} aria-label="프로그램 이름 확인"
            className="h-10 min-w-0 flex-1 rounded-field bg-soft px-3 text-[14px] outline-none focus:ring-2 focus:ring-bad" />
          <Button kind="outline" size="sm" disabled={pending || typed.trim() !== title} className="text-bad">{pending ? "지우는 중…" : "삭제하기"}</Button>
        </div>
        {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
      </form>
    </details>
  );
}
