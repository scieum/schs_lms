import "server-only";
import { z } from "zod";
import { aiJson } from "./claude";

// 영랑이: 사용법 문의(안내서 근거) + AI로 만들기(안내 문자·가정통신문 등 초안). docs/ai-features.md §0-1
// - 사용법 답은 아래 안내서(GUIDE)만 근거로 한다. 답과 함께 해당 화면 링크를 돌려준다.
// - 키가 없으면 안내서에서 낱말이 겹치는 항목을 골라 답한다("자동").

export interface GuideEntry { id: string; title: string; href: string; who: ("teacher" | "homeroom" | "admin" | "student")[]; body: string }

export const GUIDE: GuideEntry[] = [
  { id: "1.1", title: "첫 로그인과 비밀번호", href: "/me", who: ["teacher", "homeroom", "admin", "student"], body: "처음에는 학교에서 받은 인증코드로 로그인하고 바로 새 비밀번호를 정해요. 비밀번호는 내 정보에서 바꿀 수 있고, 잊으면 관리자 선생님께 초기화를 요청해요. 5번 틀리면 10분 잠겨요." },
  { id: "1.2", title: "교사 가입", href: "/signup", who: ["teacher", "admin"], body: "로그인 화면의 '교사 가입'에서 학교 인증코드로 가입해요. 맨 처음 가입한 선생님이 관리자가 돼요." },
  { id: "2.1", title: "학생 등록", href: "/students/new", who: ["teacher", "homeroom", "admin"], body: "학생 등록에서 엑셀 양식을 받아 채운 뒤 올리거나, 한 명씩 추가해요. 열 이름이 달라도 AI가 맞춰 줘요. 가명ID는 자동으로 붙어요." },
  { id: "3.1", title: "프로그램 등록과 설문 발행", href: "/teacher/programs/new", who: ["teacher", "homeroom", "admin"], body: "프로그램 → 새 프로그램. 계획서나 기안문(PDF·캡처)을 올리면 이름·영역·기간·대상을 AI가 채워요. 확인 후 등록하면 대상 학생 화면에 설문과 서류 제출 칸이 열려요." },
  { id: "3.2", title: "응답 현황과 미응답 알림", href: "/teacher/programs", who: ["teacher", "homeroom", "admin"], body: "프로그램 상세에서 응답률, 미응답 학생, 초안 상태를 봐요. 미응답 독촉 문구를 AI로 만들고 확인 후 보내요." },
  { id: "4.1", title: "제출 서류 올리기", href: "/teacher/programs", who: ["teacher", "homeroom", "admin"], body: "프로그램 상세 → 자료 관리에서 여러 파일을 한 번에 올려요. 파일 이름의 학번·이름으로 학생과 자동 연결되고, 안 되면 직접 지정해요." },
  { id: "4.2", title: "합본 PDF 나누기", href: "/teacher/programs", who: ["teacher", "homeroom", "admin"], body: "자료 관리에서 합본 파일의 '페이지 나누기'를 누르세요. 쪽 구간마다 학생을 고르거나, N쪽씩 나누거나, 첫 쪽 이름으로 자동 인식할 수 있어요." },
  { id: "5.1", title: "초안 만들기와 검토·확정", href: "/teacher/drafts", who: ["teacher", "homeroom", "admin"], body: "프로그램 상세의 '초안 만들기'로 학생별 초안을 만들고, 초안 검토에서 고친 뒤 확정해요. 반려할 때는 사유가 필요해요. 확정된 초안만 담임 선생님께 전달돼요." },
  { id: "5.2", title: "분량(바이트·글자)", href: "/teacher/drafts", who: ["teacher", "homeroom", "admin"], body: "초안을 만들 때 바이트나 글자 수로 분량을 정해요. NEIS 기준(한글 3바이트)으로 자동 검사해요." },
  { id: "6.1", title: "교과 세특 쓰기", href: "/teacher/setuk", who: ["teacher", "homeroom", "admin"], body: "내 수업에서 담당 과목을 정한 뒤 교과 세특에서 학생별로 써요. 관찰 메모나 (주제)/(활동)/(키워드)를 넣으면 AI 초안을 만들어요." },
  { id: "6.5", title: "이동반 명단 (선택 과목)", href: "/teacher/subjects", who: ["teacher", "homeroom", "admin"], body: "2·3학년 선택 과목은 내 수업 → 이동반 명단에서 나이스 명단 파일(엑셀·CSV)을 올리거나 나이스 화면의 명단을 복사해 붙여 넣으면 학번·이름으로 학생을 자동으로 찾아요. 확인 후 저장하면 교과 세특 학생 목록이 명단대로 바뀌어요." },
  { id: "6.6", title: "학사일정과 급식", href: "/schedule", who: ["teacher", "homeroom", "admin", "student"], body: "홈 아래에서 오늘의 급식과 다가오는 학사일정을 봐요. 학사일정 화면에서 달별 일정을 볼 수 있어요. 나이스 정보 기준이에요." },
  { id: "6.7", title: "한글 파일(HWPX) 올리기", href: "/teacher/programs/new", who: ["teacher", "homeroom", "admin", "student"], body: "계획서·기안문과 제출 서류는 HWPX도 올릴 수 있어요. 글을 바로 읽어요. HWP는 한글에서 '다른 이름으로 저장 → HWPX'로 저장해 올려 주세요." },
  { id: "6.2", title: "누가기록과 특기사항", href: "/teacher/logs", who: ["teacher", "homeroom", "admin"], body: "누가기록에 동아리·자율·진로 활동을 날짜별로 쌓아요. 학기말에 AI 기록 쓰기에서 특기사항 초안으로 만들어요." },
  { id: "6.3", title: "행발 쓰기", href: "/homeroom/behavior", who: ["homeroom", "admin"], body: "담임은 행발에서 반 학생별 관찰 키워드와 누가기록으로 AI 초안을 만들고 확정해요." },
  { id: "6.4", title: "나이스로 옮기기", href: "/teacher/setuk", who: ["teacher", "homeroom", "admin"], body: "확정된 기록을 '나이스로 내보내기'로 받은 뒤, 나이스 입력 도우미(크롬 확장)로 열린 나이스 화면에 채워요. 저장은 직접 눌러요." },
  { id: "7.1", title: "상담 기록", href: "/teacher/counseling", who: ["teacher", "homeroom", "admin"], body: "상담 기록에서 학생을 골라 기록해요. 교과 선생님은 본인 기록만, 담임은 반 학생 기록 전체를 봐요. 고쳐도 이전 버전이 남아요." },
  { id: "7.2", title: "봉사 확인서", href: "/teacher/service", who: ["teacher", "homeroom", "admin"], body: "봉사 확인서 사진·PDF를 올리면 AI가 날짜·시간·기관을 읽어요. 확인 후 보내면 담임 선생님의 봉사 받은함에 도착해요." },
  { id: "8.1", title: "성적 업로드와 수능 최저", href: "/homeroom/scores", who: ["homeroom", "admin"], body: "담임은 성적 업로드에서 엑셀이나 성적표 사진을 올려요. 수능 최저에서 대학별 기준으로 충족 여부를 한 번에 봐요." },
  { id: "8.2", title: "야간 자율학습 관리", href: "/homeroom/night", who: ["homeroom", "admin"], body: "야간 자율학습에서 교시별 출석을 체크하고 신청 변경을 승인해요." },
  { id: "9.1", title: "계정 관리", href: "/admin/accounts", who: ["admin"], body: "관리자는 계정 관리에서 교사 추가, 역할·담임 반 지정, 비밀번호 초기화, 잠금 해제를 해요. 교사 명부를 붙여 넣어 여러 명을 한 번에 추가할 수도 있어요." },
  { id: "9.2", title: "편제표와 과목 개설", href: "/admin/curriculum", who: ["admin"], body: "편제표에서 학년·학기별 과목을 관리하고, 과목 개설에서 과목 신청의 정원과 마감을 정해요." },
  { id: "10.1", title: "설문·서류 제출 (학생)", href: "/student/submit", who: ["student"], body: "홈이나 설문·서류 제출에서 프로그램을 골라 문항에 답하고 서류를 올려요. 마감 전에는 임시 저장할 수 있어요. 작성 도우미는 힌트만 줘요." },
  { id: "10.2", title: "성적·생활기록부 (학생)", href: "/student/scores", who: ["student"], body: "성적·최저에서 모의고사 추이와 목표 대학 최저 충족 여부를 봐요. 생활기록부에서는 확정된 지난 학년도 기록을 봐요." },
  { id: "10.3", title: "야자·과목 신청 (학생)", href: "/student/night", who: ["student"], body: "야자 신청에서 다음 주 요일·교시를 고르고, 과목 신청에서 학점과 정원을 보며 신청해요." },
];

export type YeongrangRole = "teacher" | "homeroom" | "admin" | "student" | "guest";

function forRole(role: YeongrangRole) {
  if (role === "guest") return GUIDE.filter((g) => g.id === "1.1" || g.id === "1.2");
  return GUIDE.filter((g) => g.who.includes(role) || (role === "admin" && g.who.some((w) => w !== "student")));
}

/** 키 없을 때: 낱말이 가장 많이 겹치는 안내 항목 */
export function guideMatch(question: string, role: YeongrangRole): GuideEntry | null {
  const words = question.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 2);
  let best: GuideEntry | null = null;
  let score = 0;
  for (const g of forRole(role)) {
    const hay = g.title + " " + g.body;
    const s = words.reduce((n, w) => n + (hay.includes(w) ? 2 : hay.includes(w.slice(0, 2)) ? 1 : 0), 0);
    if (s > score) { score = s; best = g; }
  }
  return score > 0 ? best : null;
}

export type Answer = { text: string; source: string | null; href: string | null; ai: boolean };

const AnswerSchema = z.object({ answer: z.string(), guideId: z.string().nullable() });

export async function answerUsage(question: string, role: YeongrangRole, history: { q: string; a: string }[]): Promise<Answer> {
  const guide = forRole(role);
  const r = await aiJson(AnswerSchema, {
    model: "fast",
    system: `너는 속초고등학교 학생관리시스템의 도우미 "영랑이"다. 아래 사용 안내서만 근거로 짧고 친절하게(2~4문장, ~해요체) 답한다.
안내서에 없는 내용은 모른다고 말하고 관리자 선생님께 문의하라고 안내한다. 답의 근거가 된 안내서 번호를 guideId 에 넣는다(없으면 null).
${role === "guest" ? "사용자는 아직 로그인하지 않았다. 로그인·가입 방법만 안내한다." : role === "student" ? "사용자는 학생이다. 설문 답이나 생활기록부 문장을 대신 써 주지 않는다. 그런 요청에는 스스로 쓸 수 있게 질문 2개를 건넨다." : "사용자는 교사다."}
사용 안내서:
${guide.map((g) => `[${g.id}] ${g.title}: ${g.body}`).join("\n")}`,
    content: [...history.slice(-3).map((h) => `이전 질문: ${h.q}\n이전 답: ${h.a}`), `질문: ${question}`].join("\n\n"),
  });
  if (r.ok) {
    const g = guide.find((x) => x.id === r.data.guideId) ?? null;
    return { text: r.data.answer, source: g ? `사용 안내서 ${g.id}` : null, href: g?.href ?? null, ai: true };
  }
  const g = guideMatch(question, role);
  return g
    ? { text: g.body, source: `사용 안내서 ${g.id}`, href: g.href, ai: false }
    : { text: "그 내용은 안내서에서 찾지 못했어요. 관리자 선생님께 문의해 주세요.", source: null, href: null, ai: false };
}

export const MAKE_KINDS = ["안내 문자", "가정통신문", "상담 요약", "회의 메모 정리"] as const;
export type MakeKind = (typeof MAKE_KINDS)[number];

const DraftSchema = z.object({ draft: z.string() });

export async function makeDraft(kind: MakeKind, input: string): Promise<{ ok: true; text: string; ai: boolean } | { ok: false; error: string }> {
  const r = await aiJson(DraftSchema, {
    model: "write",
    system: `너는 고등학교 교사의 업무 글을 돕는 "영랑이"다. 요청한 종류의 글 초안을 한국어로 쓴다.
- 안내 문자: 학생·학부모에게 보내는 3~5문장 문자. 날짜·마감·준비물을 분명하게.
- 가정통신문: 제목, 인사, 본문, 맺음말 형식. 공손한 공문 문체.
- 상담 요약: 사실 위주로 3~5줄, 다음 상담 주제 1~2개.
- 회의 메모 정리: 안건·논의·결정·할 일로 나눠 짧게.
입력에 학생 실명이 있으면 "○○"로 바꿔 쓴다. 입력에 없는 사실(날짜·장소·숫자)은 만들지 않고 [ ]로 비워 둔다. draft 에 본문만 넣는다.`,
    content: `종류: ${kind}\n내용 메모:\n${input}`,
    maxTokens: 2000,
  });
  return r.ok ? { ok: true, text: r.data.draft.trim(), ai: true } : { ok: false, error: r.error };
}
