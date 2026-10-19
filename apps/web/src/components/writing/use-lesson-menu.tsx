"use client";
import { useRouter } from "next/navigation";
import { doneItems, type LessonView } from "@/lib/domain/lesson-plan";
import { addLessonMemo, commonFromLesson } from "@/app/(app)/teacher/lesson-actions";
import { useLessonBulk } from "./lesson-bulk-dialog";
import { useUndoSnack } from "./undo-snack";
import type { LessonMenu } from "./piece-composer";

/** 편집기(세특 · 창체)가 메모 칸에 넘길 차시 메뉴 (Figma N43 (f)) + 여러 학생에게 대화창 · 스낵바 */
export function useLessonMenu(view: LessonView | undefined, studentId: string): { menu: LessonMenu | undefined; node: React.ReactNode } {
  const router = useRouter();
  const bulk = useLessonBulk(view);
  const snack = useUndoSnack(3000);
  const menu: LessonMenu | undefined = !view || !view.items.length ? undefined : {
      items: view.items,
      done: doneItems(view.marks, studentId),
      today: view.today,
      add: async (text, activity, itemId) => {
        const r = await addLessonMemo({ scope: view.scope, itemId, studentId, activity, text });
        if (!r.error) router.refresh();
        return r;
      },
      onBulk: (itemId) => bulk.open(itemId),
      onCommon: (item) => {
        void commonFromLesson({ scope: view.scope, itemId: item.id }).then((r) => {
          snack.show(r.error ?? `공통 활동 '${item.title}'을 만들었어요`);
          if (!r.error) router.refresh();
        });
      },
  };
  return { menu, node: <>{bulk.node}{snack.node}</> };
}
