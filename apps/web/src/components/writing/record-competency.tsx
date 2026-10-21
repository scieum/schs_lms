"use client";
import { useCallback, type ReactNode } from "react";
import { tagRecordText } from "@/app/(app)/competency-actions";
import { BodyCard } from "./competency-view";

/**
 * 읽기 전용 기록에 붙이는 역량 보기 (Figma N18). 스위치를 켜면 children(원래 목록·글) 대신 역량 색칠 + 평가 항목.
 * text 는 화면에 보이는 기록을 이어 붙인 글.
 */
export function RecordCompetency({ studentId, text, title, children, className, toggle }: {
  studentId: string; text: string; title: ReactNode; children: ReactNode; className?: string; toggle?: boolean;
}) {
  const tag = useCallback((t: string, force?: boolean) => tagRecordText({ studentId, text: t, force }), [studentId]);
  return <BodyCard text={text} tag={tag} title={title} editable={false} className={className ?? ""} toggle={toggle}>{children}</BodyCard>;
}
