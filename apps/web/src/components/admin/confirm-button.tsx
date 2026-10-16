"use client";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui";

/** 누르기 전에 한 번 묻는 제출 버튼 (비밀번호 초기화·잠금처럼 되돌리기 번거로운 일) */
export function ConfirmButton({ message, ...p }: ComponentProps<typeof Button> & { message: string }) {
  return (
    <Button
      {...p}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
