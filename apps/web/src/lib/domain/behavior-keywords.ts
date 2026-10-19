// 행발 키워드 메뉴판 (Figma N35 ④): 다섯 묶음 기본 키워드 + 교사가 더하고 숨기는 내 메뉴판(교사마다 따로).
// 학생마다 고른 키워드는 라벨 그대로 저장한다(메뉴판이 바뀌어도 고른 말은 남음). 모두 긍정·관찰 낱말만.

export type KeywordItem = { id: string; label: string; custom?: true; hidden?: true };
export type KeywordGroup = { id: string; label: string; items: KeywordItem[] };
export type KeywordMenu = { groups: KeywordGroup[] };

export const KEYWORD_LEN = 12;
/** 이보다 많이 고르면 "많으면 글이 흐려져요" */
export const KEYWORD_WARN = 8;
export const BEHAVIOR_MEMO_MAX = 600;

const g = (id: string, label: string, words: string[]): KeywordGroup => ({ id, label, items: words.map((w, i) => ({ id: `${id}-${i + 1}`, label: w })) });

// N28 trait-logs 특징 칩과 겹치는 말은 같은 낱말(친구 도움 · 맡은 일 끝까지 ← 끝까지 해냄)
export const DEFAULT_MENU: KeywordMenu = {
  groups: [
    g("attitude", "학교생활 태도", ["성실함", "책임감", "규칙을 잘 지킴", "시간 약속", "바른 말 쓰기", "맡은 일 끝까지"]),
    g("community", "공동체·관계", ["배려", "경청", "갈등 중재", "협력", "학급 일 도움", "리더십", "친구 도움"]),
    g("thinking", "사고·학습", ["호기심", "질문이 많음", "꾸준한 복습", "논리적 설명", "창의적 생각", "독서"]),
    g("self", "자기관리", ["계획 세우기", "감정 조절", "정리 정돈", "건강 관리", "목표 의식"]),
    g("growth", "성장", ["진로 탐색", "새로운 도전", "실패 뒤 다시 도전", "자신감이 커짐"]),
  ],
};

/** 이름 정리: 대괄호·겹친 공백 빼고 12자 */
export const cleanKeyword = (s: unknown) => String(s ?? "").replace(/[[\]#,]/g, "").replace(/\s+/g, " ").trim().slice(0, KEYWORD_LEN);

/**
 * 기본 메뉴판 + 저장한 메뉴판: 묶음은 기본 다섯 그대로, 저장한 순서·숨김·내 키워드를 반영한다.
 * 기본 키워드는 지우지 않는다(저장본에 없으면 끝에 다시 붙임). 기본 키워드 이름은 늘 기본값. 내 키워드는 숨김 없음.
 */
export function mergeMenu(defaults: KeywordMenu, saved: unknown): KeywordMenu {
  const sg = (saved && typeof saved === "object" && Array.isArray((saved as KeywordMenu).groups) ? (saved as KeywordMenu).groups : []) as Partial<KeywordGroup>[];
  const seen = new Set<string>();
  const groups = defaults.groups.map((d) => {
    const s = sg.find((x) => x && x.id === d.id);
    const items: KeywordItem[] = [];
    const push = (it: KeywordItem) => {
      if (seen.has(it.label)) return;
      seen.add(it.label);
      items.push(it);
    };
    for (const raw of Array.isArray(s?.items) ? s!.items : []) {
      if (!raw || typeof raw !== "object") continue;
      const base = d.items.find((x) => x.id === raw.id);
      if (base) push(raw.hidden ? { ...base, hidden: true } : { ...base });
      else if (raw.custom) {
        const label = cleanKeyword(raw.label);
        if (label && typeof raw.id === "string" && raw.id) push({ id: raw.id.slice(0, 40), label, custom: true });
      }
    }
    for (const base of d.items) if (!items.some((x) => x.id === base.id)) push({ ...base });
    return { id: d.id, label: d.label, items };
  });
  return { groups };
}

/** 내 키워드 만들기: 12자 · 같은 이름(메뉴판 어디든) 거절 → null. trait-logs makeCustomTrait 와 같은 규칙 */
export function makeKeyword(label: string, menu: KeywordMenu): KeywordItem | null {
  const l = cleanKeyword(label);
  if (!l) return null;
  const all = menu.groups.flatMap((x) => x.items);
  if (all.some((x) => x.label === l)) return null;
  let n = all.filter((x) => x.custom).length + 1;
  let id = `c-${n}`;
  while (all.some((x) => x.id === id)) id = `c-${++n}`;
  return { id, label: l, custom: true };
}

/** 묶음에 내 키워드 더하기 (같은 이름이면 그대로) */
export function addKeyword(menu: KeywordMenu, groupId: string, label: string): { menu: KeywordMenu; item: KeywordItem | null } {
  const item = makeKeyword(label, menu);
  if (!item) return { menu, item: null };
  return { menu: { groups: menu.groups.map((x) => (x.id === groupId ? { ...x, items: [...x.items, item] } : x)) }, item };
}

/** 고른 키워드를 메뉴판 순서대로 (메뉴판에 없는 예전 말은 끝에) */
export function pickedLabels(menu: KeywordMenu, picked: string[]): string[] {
  const set = new Set(picked);
  const inMenu = menu.groups.flatMap((x) => x.items.map((i) => i.label)).filter((l) => set.has(l));
  return [...new Set([...inMenu, ...picked.filter((l) => !inMenu.includes(l))])];
}

/** 화면에 보이는 키워드(숨김 빼고). 숨긴 키워드라도 이미 고른 것은 보인다 */
export function visibleItems(group: KeywordGroup, picked: string[] = []): KeywordItem[] {
  return group.items.filter((i) => !i.hidden || picked.includes(i.label));
}

/** 고른 키워드 정리 (12자 · 같은 것 한 번 · 30개까지) */
export function cleanPicks(list: unknown): string[] {
  const out: string[] = [];
  for (const x of Array.isArray(list) ? list : []) {
    const l = cleanKeyword(x);
    if (l && !out.includes(l)) out.push(l);
    if (out.length >= 30) break;
  }
  return out;
}
