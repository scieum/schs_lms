// 프로그램 명단 업로드 (Figma N36): 명단_양식.xlsx 로 찾은 학생을 프로그램 대상에 더하거나, 그 명단으로 바꾼다.
// 바꾸기에서도 이미 응답·서류·초안·미제출 사유가 있는 학생은 대상에서 빼지 않는다(학생 기록을 지우지 않으려고).
// 순수 함수만 — 파일 읽기는 lib/server/excel.ts, 맞추기는 class-roster.ts matchRoster.

export type RosterMode = "add" | "replace";

/** 대상에서 빼지 못하는 까닭 */
export type LockReason = "설문" | "서류" | "초안" | "사유";

export interface TargetPlan {
  /** 넣은 뒤 대상 (지금 대상 순서 그대로 + 새 학생은 뒤에) */
  next: string[];
  /** 새로 더한 학생 */
  added: string[];
  /** 명단에 있고 이미 대상인 학생 수 */
  already: number;
  /** 대상에서 뺀 학생 (바꾸기만) */
  removed: string[];
  /** 명단에 없지만 기록이 있어 남긴 학생 (바꾸기만) */
  kept: string[];
}

/**
 * 대상 계산. add = 지금 대상 + 새 학생, replace = 명단 학생 + (명단에 없지만 잠긴 학생).
 * matched 안의 중복·지금 대상과 겹침은 한 번만 센다.
 */
export function planTargets(input: { current: readonly string[]; matched: readonly string[]; mode: RosterMode; locked: ReadonlySet<string> | ((id: string) => boolean) }): TargetPlan {
  const isLocked = typeof input.locked === "function" ? input.locked : (id: string) => (input.locked as ReadonlySet<string>).has(id);
  const current = [...new Set(input.current)];
  const now = new Set(current);
  const wanted = [...new Set(input.matched)];
  const want = new Set(wanted);
  const added = wanted.filter((id) => !now.has(id));
  const already = wanted.length - added.length;
  if (input.mode === "add") return { next: [...current, ...added], added, already, removed: [], kept: [] };
  const removed: string[] = [];
  const kept: string[] = [];
  for (const id of current) {
    if (want.has(id)) continue;
    if (isLocked(id)) kept.push(id);
    else removed.push(id);
  }
  const gone = new Set(removed);
  return { next: [...current.filter((id) => !gone.has(id)), ...added], added, already, removed, kept };
}

/** 학생마다 빼지 못하는 까닭 (없으면 목록에 없음) */
export function lockReasons(input: {
  responded: Iterable<string>;
  materials: Iterable<string>;
  drafts: Iterable<string>;
  reasons: Iterable<string>;
}): Map<string, LockReason[]> {
  const out = new Map<string, LockReason[]>();
  const put = (ids: Iterable<string>, r: LockReason) => {
    for (const id of ids) {
      const list = out.get(id) ?? [];
      if (!list.includes(r)) list.push(r);
      out.set(id, list);
    }
  };
  put(input.responded, "설문");
  put(input.materials, "서류");
  put(input.drafts, "초안");
  put(input.reasons, "사유");
  return out;
}

/** 감사 로그 한 줄: 숫자만 (학생 식별자 없음) */
export function rosterAuditLine(programId: string, mode: RosterMode, plan: TargetPlan): string {
  return `${programId} ${mode} +${plan.added.length} -${plan.removed.length} keep ${plan.kept.length} → ${plan.next.length}명`;
}
