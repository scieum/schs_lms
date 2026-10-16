// 감사 로그 행동 이름·묶음. 모르는 행동은 원래 이름 그대로 보여준다.
import { periodStart, type AuditPeriod } from "@/lib/domain/accounts";

const LABEL: Record<string, string> = {
  login: "로그인", logout: "로그아웃", "login.locked": "로그인 잠김", "password.change": "비밀번호 변경",
  "teacher.signup": "교사 가입", "teacher.signup.admin": "교사 가입 (첫 관리자)",
  "account.create": "계정 생성", "account.reset": "비밀번호 초기화", "account.unlock": "잠금 해제", "account.lock": "계정 잠금",
  "account.roles": "역할 변경", "audit.export": "감사 로그 내보내기",
  "student.register": "학생 등록", "course.add": "편제표 과목 추가", "course.archive": "편제표 과목 내림",
  "subjects.assign": "담당 과목 지정", "setuk.save": "세특 저장", "setuk.confirm": "세특 확정", "setuk.export": "세특 내보내기",
  "club.create": "동아리 만들기", "club.members": "동아리 명단", "logs.add": "누가기록 추가",
  "service.scan": "봉사 확인서 읽기", "service.send": "봉사 확인서 보내기", "service.confirm": "봉사 확인서 확인",
  "draft.confirm": "초안 확정", "draft.reject": "초안 반려", "record.view": "학생 기록 열람",
  "offering.round": "과목 신청 열기", "offering.create": "신청 과목 열기", "offering.archive": "신청 과목 내림",
  "offering.sections": "반 늘리기", "offering.settings": "신청 설정", "offering.apply": "과목 신청",
  // 프로그램·초안
  "program.save": "프로그램 임시 저장", "program.publish": "프로그램 발행", "program.close": "프로그램 마감", "program.source": "근거 자료 방식 변경",
  "program.remind": "미응답 알림", "program.ai.questions": "AI 문항 추천", "program.ai.reminder": "AI 독촉 문구",
  "material.upload": "서류 올리기", "material.assign": "서류 학생 지정", "material.student": "서류 학생 연결", "material.missing": "미제출 사유",
  "material.split": "합본 PDF 나누기", "material.ai.read": "AI 서류 읽기", "material.ai.confirm": "AI 연결 확인", "material.ai.split": "AI 쪽 나누기",
  "draft.generate": "초안 만들기", "draft.regenerate": "초안 다시 만들기", "draft.edit": "초안 수정", "draft.finalize": "초안 확정",
  "draft.ai.review": "AI 검토 도우미", "pipeline.retry": "초안 다시 시도", "pipeline.manual": "직접 작성 요청",
  "survey.save": "설문 임시 저장", "survey.submit": "설문 제출", "survey.ai.hint": "AI 작성 힌트",
  // 기록 쓰기·상담
  "record.save": "기록 저장", "record.confirm": "기록 확정", "record.export": "기록 내보내기", "record.ai_draft": "AI 기록 초안", "setuk.ai_draft": "AI 세특 초안",
  "record.ai_flow": "AI 기록 흐름 요약", "record.ai_keywords": "AI 기록 요약", "record.correction": "정정 요청",
  "counsel.add": "상담 기록", "counsel.revise": "상담 기록 수정", "counsel.ai_summary": "AI 상담 요약", "career.update": "희망 진로 변경", "recs.ai": "AI 추천",
  // 성적·최저·야자
  "scores.upload": "성적 업로드", "scores.targets": "목표 대학 설정", "minimum.rule.add": "최저 기준 추가", "minimum.rule.archive": "최저 기준 내림",
  "minimum.counsel.save": "상담 명단 저장", "minimum.export": "최저 판정 내보내기",
  "night.close": "야자 출석 마감", "night.export": "야자 출석 내보내기", "night.notice.send": "야자 확인 메시지",
  "night.request.approve": "야자 변경 승인", "night.request.reject": "야자 변경 반려",
};

export function actionLabel(action: string): string {
  return LABEL[action] ?? action;
}

/** 오른쪽 작은 태그: 관리 · 확정 · 반려 · 열람 (없으면 표시 안 함) */
export function actionGroup(action: string): string | null {
  if (/^(account|audit|course|offering\.(round|create|archive|sections|settings)|subjects|student\.register|teacher\.signup)/.test(action)) return "관리";
  if (/confirm$/.test(action)) return "확정";
  if (/reject$/.test(action)) return "반려";
  if (/view|export/.test(action)) return "열람";
  return null;
}

export const PERIODS: [AuditPeriod, string][] = [["today", "오늘"], ["week", "1주"], ["month", "1개월"]];

export function readPeriod(p: string | undefined): AuditPeriod {
  return PERIODS.some(([k]) => k === p) ? (p as AuditPeriod) : "week";
}

export { periodStart };
