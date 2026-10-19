"use client";
import type { ComponentProps } from "react";
import { recordMax } from "@/lib/domain/writing";
import type { KeywordMenu } from "@/lib/domain/behavior-keywords";
import { RecordEditor } from "./record-editor";
import { KeywordMenuCard, type BehaviorLog } from "./keyword-menu";

// 행발 쓰기 (Figma N35 ④): N32 ② "키워드로" 칸을 키워드 메뉴판으로 바꾼 RecordEditor (행발에서는 키워드로가 기본).
export function BehaviorEditor({ menu, pick, logs, ...props }: Omit<ComponentProps<typeof RecordEditor>, "keywordPane" | "area"> & {
  menu: KeywordMenu;
  pick: { keywords: string[]; memo: string; useLogs: boolean };
  logs: BehaviorLog[];
}) {
  return (
    <RecordEditor {...props} area="행발"
      keywordPane={({ onApply, bodyEmpty }) => (
        <KeywordMenuCard studentId={props.studentId} menu={menu} pick={pick} logs={logs} unit={props.unit} neisMax={recordMax("행발", props.unit)}
          bodyEmpty={bodyEmpty} onApply={onApply} aiOn={props.aiOn} />
      )} />
  );
}
