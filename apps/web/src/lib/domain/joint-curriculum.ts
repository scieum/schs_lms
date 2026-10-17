// 공동교육과정 참고 (Figma N12): 공동교육과정을 운영하는 선생님이 보는 안내.
// 성적·학생부 규칙은 「2026학년도 학교생활기록부 기재요령(고등학교)」 원문(쪽수)을 옮긴 것이다.
// 지역 운영 세부(플랫폼·신청 일정·출결 인정 기준)는 교육청 공문마다 달라 여기 적지 않고 "공문 기준"으로 안내한다.

export type JointKind = "school" | "online";
export const JOINT_TABS: [JointKind, string][] = [["school", "학교 간"], ["online", "온라인"]];

/** 한 학기 흐름 (일반적인 순서 — 세부 일정은 교육청 공문). online 이 있으면 온라인 탭에서 그 줄을 쓴다 */
export const JOINT_FLOW: { step: string; line: string; online?: string }[] = [
  { step: "개설 신청", line: "거점학교가 과목 신청", online: "교육청이 과목 개설" },
  { step: "수강 신청", line: "소속 학교 거쳐 신청" },
  { step: "수업·출결", line: "출결은 거점학교 기준", online: "실시간 쌍방향 · 접속 기록" },
  { step: "평가", line: "거점학교 평가 계획" },
  { step: "성적 처리", line: "석차등급 '･' 입력" },
  { step: "세특 입력", line: "과목별 500자" },
];

export type JointRule = { rule: string; detail: string; page: string };

export const JOINT_RULES: JointRule[] = [
  { rule: "석차등급은 '･' 입력", detail: "원점수·과목평균·성취도·성취도별 분포비율·수강자 수는 산출하고 석차등급란만 '･'", page: "95쪽" },
  { rule: "비고는 자동 표시", detail: "학교 간은 '공동교육과정', 온라인학교 개설 과목은 '온라인학교'로 나이스가 표시", page: "94쪽" },
  { rule: "수강자 수 = 수강 학생 모두", detail: "거점학교가 그 과목을 수강한 학생 모두(이수하지 못한 학생 포함)로 성적 산출", page: "95쪽" },
  { rule: "본교·타교 나누면 따로", detail: "본교 학생과 타교 학생을 구분해 운영하면 같은 과목도 따로 개설하고 따로 성적 산출 (공동교육과정 규정은 타교 학생에게만)", page: "96쪽" },
  { rule: "재이수는 최하위 성취도", detail: "미이수 과목을 공동교육과정·온라인학교로 재이수하면 교과·과목·학점·성취도(최하위)만, 비고 '공동교육과정, 재이수'", page: "96·116쪽" },
  { rule: "세특은 교과 담당교사", detail: "성취기준에 따른 성취수준의 특성·참여도를 문장으로, 과목별 500자. 1학기는 8월 31일까지 입력", page: "95·208쪽" },
];

/** 학교 간 / 온라인 다른 점: [이름표, 내용] */
export const JOINT_DIFF: Record<JointKind, [string, string][]> = {
  school: [
    ["수업", "거점학교 방문 수업"],
    ["시간표", "방과후·주말 · 이동 시간 포함"],
    ["출결", "거점학교 기준 · 소속 학교에 통보"],
    ["수상", "거점학교 상은 교내상으로 (64쪽)"],
  ],
  online: [
    ["수업", "실시간 쌍방향 화상 수업"],
    ["플랫폼", "교육청 지정 플랫폼"],
    ["출결", "접속 기록·카메라 기준 · 개강 전 안내"],
    ["평가", "화면으로 확인 가능한 방식"],
  ],
};

export const JOINT_LINKS: { label: string; href: string | null; note: string }[] = [
  { label: "교육청 공문", href: null, note: "운영 계획 · 신청 일정" },
  { label: "학생부 종합지원포털", href: "https://star.moe.go.kr/web/contents/m21100.do", note: "star.moe.go.kr" },
];
