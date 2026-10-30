"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { acceptDrafts } from "./actions";

/** 받은 초안 [확정] · [모두 확정 n] (Figma N83): 누르면 담임 조각으로 들어간다 */
export function AcceptButton({ keys, label, className }: { keys: string[]; label: string; className?: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const run = () => start(async () => {
    const r = await acceptDrafts(keys);
    if (!r.ok) { setErr(r.error); return; }
    setErr(null);
    router.refresh();
  });
  return (
    <>
      <Button size="sm" className={className} disabled={pending || !keys.length} onClick={run}>{pending ? "넣는 중…" : label}</Button>
      {err && <span className="text-[12px] text-bad" role="alert">{err}</span>}
    </>
  );
}
