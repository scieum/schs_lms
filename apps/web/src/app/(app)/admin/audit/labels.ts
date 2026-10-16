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
