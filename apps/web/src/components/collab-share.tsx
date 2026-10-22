"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import type { CollabItem } from "@/lib/domain/collab";
import { myRoomsLite } from "@/app/(app)/collab/actions";
import { ItemDialog } from "@/app/(app)/collab/room-board";

// 협업방에 올리기 (Figma N69 d): 수행평가 · 프롬프트 글에서 내가 든 방을 골라 그대로 올린다 (올린 뒤 그 방으로)
export function ShareToRoomButton({ preset, className }: { preset: Partial<Pick<CollabItem, "kind" | "title" | "body" | "meta">>; className?: string }) {
  const router = useRouter();
  const [rooms, setRooms] = useState<{ id: string; name: string }[] | null>(null);
  const open = async () => setRooms(await myRoomsLite().catch(() => []));
  return (
    <>
      <button type="button" onClick={open} className={className ?? "flex h-9 items-center gap-1.5 rounded-control bg-soft px-3 text-[13px] font-bold text-sub hover:text-ink"}><Users size={14} /> 협업방에 올리기</button>
      {rooms && <ItemDialog rooms={rooms} preset={preset} onClose={() => setRooms(null)} onSaved={(id) => router.push(`/collab/${id}`)} />}
    </>
  );
}
