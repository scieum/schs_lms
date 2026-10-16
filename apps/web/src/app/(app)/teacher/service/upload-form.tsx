"use client";
import { startTransition, useActionState, useRef, useState } from "react";
import { FileUp, Sparkles } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { scanServiceDoc, sendService, type ScanState, type SendState } from "./actions";

const INPUT = "h-11 w-full rounded-field bg-white px-3.5 text-[15px] outline-none focus:ring-2 focus:ring-key";
type S = { id: string; label: string };

// 확인서 올리기 → (AI로 읽기) → 확인·수정 → 담임에게 보내기
export function ServiceUploadForm({ students, aiOn, today }: { students: S[]; aiOn: boolean; today: string }) {
  const [scan, scanAction, scanning] = useActionState<ScanState, FormData>(scanServiceDoc, {});
  const [send, sendAction, sending] = useActionState<SendState, FormData>(sendService, {});
  // 보낸 뒤(send.n 증가)에는 고른 파일 이름도 비운다
  const [picked, setPicked] = useState({ n: 0, name: "" });
  const fileName = picked.n === (send.n ?? 0) ? picked.name : "";
  const formRef = useRef<HTMLFormElement>(null);
  const f = scan.fields;
  // 폼 제출이 아니라 직접 호출: 읽은 뒤에도 고른 파일이 그대로 남는다
  const runScan = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    startTransition(() => scanAction(fd));
  };

  return (
    <form ref={formRef} action={sendAction} className="flex flex-col gap-4" key={`form-${send.n ?? 0}`}>
      <label className={cx("flex cursor-pointer items-center gap-3 rounded-inner border-2 border-dashed border-hair bg-white px-4 py-5", fileName && "border-key")}>
        <FileUp size={22} className="shrink-0 text-key" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{fileName || "확인서 파일 고르기"}</span>
          <span className="block text-[13px] text-mute">PDF · JPG · PNG, 8MB까지 (휴대폰 사진도 돼요)</span>
        </span>
        <input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className="sr-only"
          onChange={(e) => setPicked({ n: send.n ?? 0, name: e.target.files?.[0]?.name ?? "" })} />
      </label>

      <div className="flex items-center gap-3 rounded-inner bg-new-soft px-4 py-3">
        <span className="rounded-chip bg-white px-2 py-0.5 text-xs font-bold text-new">AI</span>
        <span className="min-w-0 flex-1 text-[13px] text-sub">{aiOn ? "확인서를 읽어 학생·날짜·시간·기관을 채워요. 확인 후 보내요" : "AI 읽기가 꺼져 있어요. 직접 입력해 주세요"}</span>
        <Button type="button" onClick={runScan} kind="soft" size="sm" disabled={!aiOn || !fileName || scanning}>
          <Sparkles size={14} /> {scanning ? "읽는 중…" : "AI로 읽기"}
        </Button>
      </div>
      {scan.error && <p className="text-sm text-bad" role="alert">{scan.error}</p>}
      {f?.studentHint && <p className="text-sm text-wait">확인서의 학생({f.studentHint})을 명단에서 찾지 못했어요. 직접 골라 주세요</p>}

      {/* AI가 읽을 때마다 입력칸을 새 값으로 다시 그린다 */}
      <div key={scan.n ?? 0} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">학생</span>
          <select name="studentId" defaultValue={f?.studentId ?? ""} required className={INPUT}>
            <option value="" disabled>학생 고르기</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-sub">날짜</span>
            <input type="date" name="date" defaultValue={f?.date ?? today} required className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-sub">시간</span>
            <input name="hours" inputMode="decimal" defaultValue={f?.hours ?? ""} placeholder="예: 3" required className={INPUT} />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">기관</span>
          <input name="organization" defaultValue={f?.organization ?? ""} placeholder="예: 속초시노인복지관" required maxLength={60} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-sub">활동 내용</span>
          <input name="activity" defaultValue={f?.activity ?? ""} placeholder="예: 급식 배식 보조" required maxLength={200} className={INPUT} />
        </label>
      </div>

      {send.error && <p className="text-sm text-bad" role="alert">{send.error}</p>}
      {send.sent && <p className="text-sm text-ok" role="status">{send.sent}</p>}
      <Button disabled={sending || scanning}>{sending ? "보내는 중…" : "담임에게 보내기"}</Button>
    </form>
  );
}
