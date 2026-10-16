// 학생 화면 도우미 — AI 가 꺼져 있을 때 쓰는 규칙 (docs/ai-features.md S1~S7, /me).
// 학생 AI 원칙: 힌트·요약·정리만. 대신 써 주지 않는다.
import type { Judgement, MinRule } from "./scores";
import { AREA_LABEL, SUBJECT_LABEL } from "./scores";

// ── S1 할 일 정리 ─────────────────────────────────────

export type TodoKind = "survey" | "docs" | "night" | "courses";

export interface TodoInput {
  key: string;
  kind: TodoKind;
  title: string;
  /** 마감일 YYYY-MM-DD */
  due: string;
  /** "2 / 4 문항" · "0개 올림" 같은 진행 상황 */
  progress: string;
  href: string;
}

export interface TodoStep {
  key: string;
  title: string;
  href: string;
  why: string;
}

const dayNum = (ymd: string) => Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86400000);
const dleft = (due: string, today: string) => dayNum(due) - dayNum(today);
const dlabel = (n: number) => (n <= 0 ? "오늘 마감" : n === 1 ? "내일 마감" : `D-${n}`);

/** 시간이 오래 걸리는 일부터 (같은 날 마감이면 설문 → 서류 → 과목 → 야자) */
const WEIGHT: Record<TodoKind, number> = { survey: 0, docs: 1, courses: 2, night: 3 };

/** 오늘 순서 3개: 마감이 가까운 순, 같으면 오래 걸리는 일 먼저. 지난 마감은 뺀다 */
export function orderTodos(items: TodoInput[], today: string, n = 3): TodoStep[] {
  return items
    .map((it) => ({ it, d: dleft(it.due, today) }))
    .filter((x) => x.d >= 0)
    .sort((a, b) => a.d - b.d || WEIGHT[a.it.kind] - WEIGHT[b.it.kind])
    .slice(0, n)
    .map(({ it, d }) => ({ key: it.key, title: it.title, href: it.href, why: [dlabel(d), it.progress].filter(Boolean).join(" · ") }));
}

// ── S2 문항별 더 쓸 수 있는 것 (질문만) ─────────────────

const ASK: [RegExp | null, string][] = [
  [/\d/, "몇 번, 얼마나 했는지 숫자로 말할 수 있나요?"],
  [/왜|때문|이유|궁금/, "왜 그렇게 하기로 했나요?"],
  [/어려|힘들|실패|문제|막혔|고민/, "가장 어려웠던 점은 무엇이고, 어떻게 풀었나요?"],
  [/역할|맡|내가|제가/, "그 활동에서 내가 맡은 일은 무엇이었나요?"],
  [/앞으로|다음|더 알아|계획|이어서/, "이 활동 뒤에 더 알아보고 싶은 것은 무엇인가요?"],
  [null, "이 경험이 내 진로와 어떻게 이어지나요?"],
];

/** 답을 보고 학생에게 던질 질문 2개. 답에 이미 있는 내용은 묻지 않는다 */
export function followUpQuestions(answer: string, n = 2): string[] {
  const a = answer.trim();
  if (!a) return ["어떤 장면이 가장 먼저 떠오르나요?", "그때 나는 무엇을 했나요?"].slice(0, n);
  return ASK.filter(([re]) => !re || !re.test(a)).map(([, q]) => q).slice(0, n);
}

// ── S2 서류 빠진 항목 점검 ────────────────────────────

/** 서류 종류별로 들어가야 할 것 (라벨, 본문에서 찾을 말) */
export const DOC_CHECKLIST: Record<string, [string, RegExp][]> = {
  보고서: [["주제와 동기", /주제|동기|궁금|계기/], ["방법·과정", /방법|과정|실험|조사|절차/], ["결과", /결과|알게|확인|나타/], ["배운 점·후속", /배운|느낀|후속|더 알아|앞으로/]],
  활동지: [["활동 내용", /활동|했다|하였다|참여/], ["내 역할", /역할|맡|내가|제가/], ["느낀 점", /느낀|배운|생각/]],
  소감문: [["활동 내용", /활동|참여|했다/], ["인상 깊은 장면", /인상|기억|장면|가장/], ["배운 점·변화", /배운|느낀|바뀌|변화|앞으로/]],
};

function checklistOf(kind: string): [string, RegExp][] {
  const k = Object.keys(DOC_CHECKLIST).find((x) => kind.replace(/\s/g, "").includes(x));
  return k ? DOC_CHECKLIST[k] : [["활동 내용", /활동|참여|했다/], ["배운 점", /배운|느낀|알게/]];
}

export interface DocCheck {
  kind: string;
  uploaded: boolean;
  /** 본문을 읽을 수 있을 때만 채운다 */
  missing: string[];
  /** 본문을 읽지 못해 학생이 직접 확인할 항목 */
  checklist: string[];
}

const kindKey = (kind: string) => kind.replace(/\s/g, "").replace(/^탐구/, "");

/**
 * 제출 서류 종류 대비 점검.
 * - 파일 이름에 서류 종류가 들어 있으면 그 종류를 낸 것으로 본다. 종류가 하나뿐이면 아무 파일이나 낸 것으로 본다
 * - 본문(TXT)이 있으면 체크리스트 말이 있는지 보고, 없으면 직접 확인할 체크리스트만 준다
 */
export function checkDocs(kinds: string[], files: { name: string; text: string | null }[]): DocCheck[] {
  const list = kinds.length ? kinds : ["서류"];
  return list.map((kind) => {
    const mine = files.filter((f) => list.length === 1 || f.name.replace(/\s/g, "").includes(kindKey(kind)));
    const items = checklistOf(kind);
    const text = mine.map((f) => f.text ?? "").join("\n");
    const readable = mine.some((f) => !!f.text);
    return {
      kind,
      uploaded: mine.length > 0,
      missing: readable ? items.filter(([, re]) => !re.test(text)).map(([l]) => l) : [],
      checklist: readable ? [] : items.map(([l]) => l),
    };
  });
}

// ── S3 목표 대학 최저까지 필요한 등급 ────────────────────

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** 판정 결과를 학생이 읽을 한 문장으로 */
export function minimumNeedLine(label: string, rule: MinRule | null | undefined, j: Judgement): string {
  switch (j.status) {
    case "충족":
      return `${label}: 지금 성적으로 충족해요 (${j.reason}). 이 등급을 지키면 돼요`;
    case "근접":
      return `${label}: ${j.fixes.slice(0, 2).map((k) => SUBJECT_LABEL[k]).join(" 또는 ")} 1등급만 올리면 충족해요`;
    case "미충족": {
      if (!rule) return `${label}: ${j.reason}`;
      if (j.sum !== null && j.sum > rule.maxSum) {
        const areas = j.used.map((u) => AREA_LABEL[u.area]).join("·");
        return `${label}: ${areas} 등급 합을 ${fmt(j.sum - rule.maxSum)} 줄여야 해요 (지금 ${fmt(j.sum)}, 기준 ${rule.maxSum})`;
      }
      return `${label}: ${j.reason}`;
    }
    case "자료 부족":
      return `${label}: ${j.reason} — 다음 모의고사 뒤에 다시 볼게요`;
    default:
      return `${label}: 기준이 아직 없어요. 담임 선생님께 알려 주세요`;
  }
}

// ── S4 다음 학년에 이어갈 주제 ─────────────────────────

/** 기록 제목에서 이어갈 주제 (진로활동·교과세특 먼저). AI 가 꺼져 있을 때 */
export function nextTopicsRule(records: { area: string; title: string }[], n = 3): string[] {
  const order = ["진로활동", "교과세특", "동아리활동", "자율활동"];
  const titles = [...records]
    .sort((a, b) => order.indexOf(a.area) - order.indexOf(b.area))
    .map((r) => r.title.trim())
    .filter(Boolean);
  return [...new Set(titles)].slice(0, n).map((t) => `${t} — 한 단계 더 깊이`);
}

/** 기록 본문에서 자주 나온 두 글자 이상 낱말 (조사 떼고). 키워드 대신 쓴다 */
export function frequentWords(texts: string[], n = 5): string[] {
  const STOP = new Set(["활동", "학생", "통해", "대한", "위해", "과정", "내용", "참여", "수업", "모습", "자신", "관련", "있음", "보임", "함"]);
  const count = new Map<string, number>();
  for (const t of texts) {
    for (const raw of t.match(/[가-힣A-Za-z]{2,}/g) ?? []) {
      const w = raw.length < 3 ? raw : raw.replace(/(을|를|이|가|은|는|의|에|에서|으로|로|과|와|도|만|하여|하고|하며|했음|함|임|음)$/, "");
      if (w.length < 2 || STOP.has(w)) continue;
      count.set(w, (count.get(w) ?? 0) + 1);
    }
  }
  return [...count.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

// ── /me 진로 키워드 정리 ─────────────────────────────

const CAREER_FIELDS: [RegExp, string, string[]][] = [
  [/디자인|미술|건축|예술|패션|영상|애니|웹툰|그림/, "디자인·예술", ["디자인", "시각 표현", "창작"]],
  [/의사|의학|약|간호|생명|보건|수의|병원|치료/, "의학·보건", ["생명과학", "보건", "돌봄"]],
  [/공학|기계|전기|전자|물리|항공|자동차|로봇|반도체/, "공학", ["물리", "설계", "기술"]],
  [/컴퓨터|소프트웨어|프로그래|개발|코딩|인공지능|AI|데이터|게임|앱/, "컴퓨터·정보", ["프로그래밍", "데이터", "인공지능"]],
  [/경영|경제|회계|금융|무역|마케팅|창업|사업/, "경영·경제", ["경제", "경영", "통계"]],
  [/교사|선생|교육|상담|심리|사회복지|아이/, "교육·상담", ["교육", "심리", "소통"]],
  [/법|정치|행정|외교|경찰|검사|변호/, "법·행정", ["법", "정책", "사회 문제"]],
  [/환경|지구|기후|해양|지리|생태/, "환경·지구", ["환경", "기후", "생태"]],
  [/화학|신소재|에너지|배터리/, "화학·소재", ["화학", "소재", "에너지"]],
  [/언론|기자|방송|작가|문학|글|출판|번역|언어/, "언론·문학", ["글쓰기", "언어", "미디어"]],
  [/체육|운동|스포츠|트레이너|선수/, "체육", ["운동", "건강", "스포츠 과학"]],
  [/요리|조리|식품|영양|제과|바리스타/, "식품·조리", ["식품", "영양", "조리"]],
];

/** 자유 문장 → 진로 분야 + 키워드 (규칙). 맞는 분야가 없으면 빈 배열 */
export function careerKeywordsRule(text: string): { field: string; keywords: string[] }[] {
  return CAREER_FIELDS.filter(([re]) => re.test(text)).slice(0, 2).map(([, field, keywords]) => ({ field, keywords }));
}
