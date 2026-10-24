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
    `지금은 루브릭 채점까지는 안 돼요. 대신 이만큼은 돼요.

· 세특 › 수행평가에 평가 내용 · 기준을 적고 학생 자료(한 명씩 · 합본 PDF)를 올리면, AI가 학생마다 읽고 요약을 "수행평가" 조각으로 남겨요.
· 글 짓기에서 그 과목의 2022 개정 성취기준 가운데 학생 활동과 겹치는 것을 찾아 AI에 함께 줘요.
· 성취수준(A~E 또는 상 · 중 · 하)은 글 짓기에서 학생마다 골라 글 말투에 반영해요.

루브릭으로 기준별 점수를 매기는 기능은 성적 정보라서, 성적 기능을 잠가 둔 지금 방침에 맞춰 아직 만들지 않았어요. "루브릭 → 성취기준 연결 → AI가 기준별 수준과 근거 제안 → 선생님 확정" 순서로 만드는 것을 검토하고 있어요.`, "2026-10-24T05:00:00.000Z"),
  Q("qna-speech-record", "조각 · 글 짓기", "학생 발표를 녹음해서 글로 받아 적고 조각으로 남길 수 있나요?",
    "수업 중 학생 발표를 녹음하면 텍스트로 전사되고, 그게 바로 조각이 되어 생기부에 녹여 쓸 수 있으면 좋겠어요.",
    `지금은 녹음 기능이 없어요. 발표 내용은 이렇게 남길 수 있어요.

· 조각 모으기에 발표 내용을 메모로 바로 적기 (여러 학생에게 한 번에도 돼요)
· 발표 자료(PDF · PPTX · 사진)를 올리면 AI가 학생마다 요약해 조각으로 남겨요.

"녹음 → 글로 받아 적기 → 선생님 확인 → 학생별 조각"은 만들 수 있어요. 다만 학생 목소리가 음성 인식 서비스로 나가는 문제가 있어서, 어디서 받아 적을지(기기 안 · 브라우저 · 외부 서비스)를 정하는 중이에요. 녹음 파일은 남기지 않는 방향이에요.`, "2026-10-24T05:01:00.000Z"),
];
