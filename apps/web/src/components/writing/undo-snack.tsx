"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Snackbar } from "@/components/materials/delete-file";

/** 본문을 바꾼 뒤 "…했어요 · 되돌리기" 스낵바 5초 (N33 스낵바, Figma N34) */
export function useUndoSnack(delay = 5000) {
  const [snack, setSnack] = useState<{ text: string; undo?: () => void; label?: string; key: number } | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  /** label: 되돌리기 대신 다른 버튼 글 (예: "보관함 열기") */
  const show = useCallback((text: string, undo?: () => void, label?: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    setSnack({ text, undo, label, key: Date.now() });
    timer.current = window.setTimeout(() => setSnack(null), delay);
  }, [delay]);
  const node = snack ? (
    <Snackbar key={snack.key} text={snack.text} undoLabel={snack.label} onUndo={snack.undo ? () => { snack.undo!(); setSnack(null); } : undefined} />
  ) : null;
  return { show, node };
}
