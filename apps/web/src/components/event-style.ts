import type { EventStatus } from "@/lib/domain/school-info";

// 학사일정 상태 색 (Figma N1 범례): 진행 중 인디고 · 시작 전 노랑 · 완료 회색 · 휴업일 빨강
export const STATUS_CHIP: Record<EventStatus, string> = {
  "진행 중": "bg-key-soft text-key-strong",
  "시작 전": "bg-wait-soft text-[#9a6400]",
  "완료": "bg-soft text-mute",
  "휴업일": "bg-bad-soft text-bad",
};
export const STATUS_DOT: Record<EventStatus, string> = {
  "진행 중": "border-key",
  "시작 전": "border-wait",
  "완료": "border-faint",
  "휴업일": "border-bad",
};
export const STATUSES: EventStatus[] = ["진행 중", "시작 전", "완료", "휴업일"];
