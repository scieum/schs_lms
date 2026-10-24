// 문의 게시판 (2026-10-22, 도구): 선생님이 쓰다 막힌 점을 묻고, 관리자(교육과정부)가 답해 쌓아 둔다 — 같은 질문을 다시 찾아보게.
// 처음 글(SEED_QNA)은 실제로 들어온 질문과 답이다. 새 문답이 오면 여기와 운영 DB(supabase/seed_qna_*.sql)에 같이 더한다.

export const QNA_CATEGORIES = ["조각 · 글 짓기", "수업 · 명단", "나이스", "특색활동", "계정 · 기타"] as const;
export type QnaCategory = (typeof QNA_CATEGORIES)[number];
export const isQnaCategory = (v: unknown): v is QnaCategory => (QNA_CATEGORIES as readonly string[]).includes(String(v));

export type QnaPost = {
  id: string;
  category: QnaCategory;
  title: string;
  question: string;
  /** 답 (없으면 답변 대기) */
  answer: string | null;
  /** 물은 교사 (처음 글은 null) */
  authorId: string | null;
  authorName: string;
  answeredBy: string | null;
  createdAt: string;
  answeredAt: string | null;
  /** AI 답 초안 (관리자만 봄, 0037) */
  draftAnswer?: string | null;
};

export const QNA_LIMITS = { title: 80, question: 2000, answer: 4000 } as const;

export function checkQuestion(input: { category: string; title: string; question: string }): string | null {
  if (!isQnaCategory(input.category)) return "분류를 골라 주세요";
  const title = input.title.trim(), q = input.question.trim();
  if (title.length < 2) return "제목을 2자 이상 써 주세요";
  if (title.length > QNA_LIMITS.title) return `제목은 ${QNA_LIMITS.title}자까지예요`;
  if (q.length < 5) return "질문을 5자 이상 써 주세요";
  if (q.length > QNA_LIMITS.question) return `질문은 ${QNA_LIMITS.question.toLocaleString("ko-KR")}자까지예요`;
  return null;
}

export function checkAnswer(answer: string): string | null {
  const a = answer.trim();
  if (a.length < 2) return "답을 2자 이상 써 주세요";
  if (a.length > QNA_LIMITS.answer) return `답은 ${QNA_LIMITS.answer.toLocaleString("ko-KR")}자까지예요`;
  return null;
}

export type QnaState = "전체" | "답변 완료" | "답변 대기";

/** 찾기 · 분류 · 답 여부 거르기 (최신 위) */
export function filterQna(list: QnaPost[], q: { category?: string | null; state?: string | null; text?: string | null }): QnaPost[] {
  const words = (q.text ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list
    .filter((p) => !q.category || q.category === "전체" || p.category === q.category)
    .filter((p) => !q.state || q.state === "전체" || (q.state === "답변 완료" ? !!p.answer : !p.answer))
    .filter((p) => words.every((w) => `${p.title} ${p.question} ${p.answer ?? ""}`.toLowerCase().includes(w)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const qnaCounts = (list: QnaPost[]): Record<string, number> =>
  Object.fromEntries([["전체", list.length], ...QNA_CATEGORIES.map((c) => [c, list.filter((p) => p.category === c).length])]);

/** 질문 고치기 · 지우기: 물은 교사 본인(답이 달리기 전) · 관리자. 답하기는 관리자만 */
export const canEditQuestion = (p: Pick<QnaPost, "authorId" | "answer">, me: { id: string; admin: boolean }) => me.admin || (!!p.authorId && p.authorId === me.id && !p.answer);

const Q = (id: string, category: QnaCategory, title: string, question: string, answer: string, at: string): QnaPost =>
  ({ id, category, title, question, answer, authorId: null, authorName: "선생님 문의", answeredBy: "교육과정부", createdAt: at, answeredAt: at });

/** 처음 문답 (0035 · 데모 저장소가 같이 쓴다) */
export const SEED_QNA: QnaPost[] = [
  Q("qna-piece-delete", "조각 · 글 짓기", "조각을 잘못 남겼는데 지울 수 있나요?",
    "조각 모으기에서 테스트용으로 하나 적어 봤는데, 조각 삭제 기능은 없나요?",
    `네, 지울 수 있어요. 내가 쓴 조각만 지워져요.

· 조각 모으기 오른쪽 "최근 조각" 줄 끝의 휴지통을 누르면 지워져요. 여러 학생에게 한 번에 남긴 조각이면 그 학생들 것이 모두 지워져요.
· 글 짓기 왼쪽 조각 칸에서도 내가 쓴 조각에는 휴지통이 있어요.
· 동아리 · 담임 누가기록도 같아요.

지운 조각은 화면과 글 짓기에서 빠지고, 기록은 남겨 둬요(나중에 근거가 바뀌지 않게). 다른 선생님이 쓴 조각은 지울 수 없어요.`, "2026-10-22T03:00:00.000Z"),
  Q("qna-piece-shared", "조각 · 글 짓기", "다른 선생님이 쓴 조각도 제 화면에 보이나요?",
    "다른 선생님 아이디로 미적분Ⅰ 한 학생에게 조각을 작성했다면, 제 아이디의 미적분Ⅰ 그 학생에게도 조각이 보이는 구조인가요?",
    `네, 같은 과목 · 같은 학생이면 보여요. 조각은 선생님마다가 아니라 "과목 + 학생"에 붙어요.

· 다만 조각은 자기가 맡은 반 · 분반 학생에게만 쓸 수 있어요. 그래서 서로 보이는 건 같은 과목을 같은 반 · 분반으로 함께 맡은 경우(공동 수업 · 담당 바뀜)나 관리자 계정으로 쓴 경우뿐이에요.
· 조각 모으기 오른쪽 "최근 조각"에는 내가 쓴 것만 나와요. 글 짓기 조각 칸과 학생 칸의 조각 수에는 함께 맡은 선생님 조각도 들어가요.
· 내가 쓴 조각에만 휴지통(지우기)이 보여요.`, "2026-10-22T03:01:00.000Z"),
  Q("qna-rubric-grading", "수업 · 명단", "클리포처럼 수행평가 루브릭을 넣고 채점까지 할 수 있나요?",
    "수행평가 루브릭을 입력해 두면 나중에 채점도 되는 형태가 가능할까요? 과목별 성취기준 · 성취수준도 교육과정에 맞게 찾아서 연결되면 좋겠어요.",
    `네, 돼요. 세특 › 수행평가 › [수행평가 등록]에서 맨 위 [루브릭 채점]을 고르세요.

· 성취기준: 그 과목의 2022 개정 성취기준을 낱말이나 코드로 찾아 연결해요.
· 루브릭: 평가 기준 · 배점 · 수준(상중하 또는 A~E)마다 설명과 점수를 적어요. [AI 성취기준으로 루브릭 만들기]를 누르면 초안을 만들어 줘요.
· 채점: 학생 답안을 한 명씩 또는 합본 PDF로 올리면 AI가 기준마다 수준과 근거를 제안해요. 학생을 눌러 수준을 고친 뒤 [확정하고 조각 남기기]를 누르면 점수가 남고, 답안에서 뽑은 한두 문장이 수행평가 조각으로 들어가요.
· [점수 엑셀로 받기]로 기준별 점수 · 합계를 받아요.

과목별 공식 성취수준 문장은 아직 자료에 없어서, AI가 성취수준 기술 방식으로 초안을 쓰고 선생님이 고쳐 써요. 답안 파일은 저장하지 않아요.`, "2026-10-24T05:00:00.000Z"),
  Q("qna-speech-record", "조각 · 글 짓기", "학생 발표를 녹음해서 글로 받아 적고 조각으로 남길 수 있나요?",
    "수업 중 학생 발표를 녹음하면 텍스트로 전사되고, 그게 바로 조각이 되어 생기부에 녹여 쓸 수 있으면 좋겠어요.",
    `네, 돼요. 조각 모으기에서 [녹음] 탭을 고르세요.

· 받는 학생 · 활동명을 고르고 마이크 버튼으로 녹음 → [멈추고 받아쓰기].
· 받아쓰기는 이 컴퓨터(휴대폰) 안에서 해요. 처음 한 번은 받아쓰기 모델(약 80MB)을 받느라 1분쯤 걸리고, 다음부터는 바로 시작해요.
· 받아쓴 글을 고친 뒤 [AI 요약해 메모 칸에 넣기] 또는 [그대로 넣기] → 'n명에게 남기기'를 누르면 조각이 돼요.

녹음 파일은 남기지 않고, 소리는 밖으로 나가지 않아요(AI 요약을 누르면 받아쓴 글만 이름 · 학번을 가려 보내요). 10분까지 녹음할 수 있어요. 녹음하기 전에 학생들에게 알려 주세요.`, "2026-10-24T05:01:00.000Z"),
];
