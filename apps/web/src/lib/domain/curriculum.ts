// 2022 개정 교육과정 고등학교 보통 교과 — 교과(군) → 과목 (공통 / 일반·진로·융합 선택)
// 출처: 강원특별자치도교육청·부산광역시교육청 고교학점제지원센터 과목 안내 (2026-10-16 확인)
// 강원 자료의 "기후의 역사와 문화"는 교육과정 원문 이름 "과학의 역사와 문화"로 적는다.

export const SUBJECT_GROUPS = [
  "국어", "수학", "영어", "사회", "과학", "체육", "예술", "기술·가정/정보", "제2외국어/한문", "교양",
] as const;
export type SubjectGroup = (typeof SUBJECT_GROUPS)[number];

export const COURSE_TYPES = ["공통", "일반 선택", "진로 선택", "융합 선택"] as const;
export type CourseType = (typeof COURSE_TYPES)[number];

type Table = Record<SubjectGroup, Partial<Record<CourseType, string[]>>>;

const LANGS = ["독일어", "프랑스어", "스페인어", "중국어", "일본어", "러시아어", "아랍어", "베트남어"];
const CULTURES = ["독일어권 문화", "프랑스어권 문화", "스페인어권 문화", "중국 문화", "일본 문화", "러시아 문화", "아랍 문화", "베트남 문화"];

const TABLE: Table = {
  국어: {
    공통: ["공통국어1", "공통국어2"],
    "일반 선택": ["화법과 언어", "독서와 작문", "문학"],
    "진로 선택": ["주제 탐구 독서", "문학과 영상", "직무 의사소통"],
    "융합 선택": ["독서 토론과 글쓰기", "매체 의사소통", "언어생활 탐구"],
  },
  수학: {
    공통: ["공통수학1", "공통수학2", "기본수학1", "기본수학2"],
    "일반 선택": ["대수", "미적분Ⅰ", "확률과 통계"],
    "진로 선택": ["기하", "미적분Ⅱ", "경제 수학", "인공지능 수학", "직무 수학"],
    "융합 선택": ["수학과 문화", "실용 통계", "수학과제 탐구"],
  },
  영어: {
    공통: ["공통영어1", "공통영어2", "기본영어1", "기본영어2"],
    "일반 선택": ["영어Ⅰ", "영어Ⅱ", "영어 독해와 작문"],
    "진로 선택": ["영미 문학 읽기", "영어 발표와 토론", "심화 영어", "심화 영어 독해와 작문", "직무 영어"],
    "융합 선택": ["실생활 영어 회화", "미디어 영어", "세계 문화와 영어"],
  },
  사회: {
    공통: ["한국사1", "한국사2", "통합사회1", "통합사회2"],
    "일반 선택": ["세계시민과 지리", "세계사", "사회와 문화", "현대사회와 윤리"],
    "진로 선택": ["한국지리 탐구", "도시의 미래 탐구", "동아시아 역사 기행", "정치", "법과 사회", "경제", "윤리와 사상", "인문학과 윤리", "국제 관계의 이해"],
    "융합 선택": ["여행지리", "역사로 탐구하는 현대 세계", "사회문제 탐구", "금융과 경제생활", "윤리문제 탐구", "기후변화와 지속가능한 세계"],
  },
  과학: {
    공통: ["통합과학1", "통합과학2", "과학탐구실험1", "과학탐구실험2"],
    "일반 선택": ["물리학", "화학", "생명과학", "지구과학"],
    "진로 선택": ["역학과 에너지", "전자기와 양자", "물질과 에너지", "화학 반응의 세계", "세포와 물질대사", "생물의 유전", "지구시스템과학", "행성우주과학"],
    "융합 선택": ["과학의 역사와 문화", "기후변화와 환경생태", "융합과학 탐구"],
  },
  체육: {
    "일반 선택": ["체육1", "체육2"],
    "진로 선택": ["운동과 건강", "스포츠 문화", "스포츠 과학"],
    "융합 선택": ["스포츠 생활1", "스포츠 생활2"],
  },
  예술: {
    "일반 선택": ["음악", "미술", "연극"],
    "진로 선택": ["음악 연주와 창작", "음악 감상과 비평", "미술 창작", "미술 감상과 비평"],
    "융합 선택": ["음악과 미디어", "미술과 매체"],
  },
  "기술·가정/정보": {
    "일반 선택": ["기술·가정", "정보"],
    "진로 선택": ["로봇과 공학세계", "생활과학 탐구", "인공지능 기초", "데이터 과학"],
    "융합 선택": ["창의 공학 설계", "지식 재산 일반", "생애 설계와 자립", "아동발달과 부모", "소프트웨어와 생활"],
  },
  "제2외국어/한문": {
    "일반 선택": [...LANGS, "한문"],
    "진로 선택": [...LANGS.map((l) => `${l} 회화`), ...LANGS.map((l) => `심화 ${l}`), "한문 고전 읽기"],
    "융합 선택": [...CULTURES, "언어생활과 한자"],
  },
  교양: {
    "일반 선택": ["진로와 직업", "생태와 환경"],
    "진로 선택": ["인간과 철학", "논리와 사고", "인간과 심리", "교육의 이해", "삶과 종교", "보건"],
    "융합 선택": ["인간과 경제활동", "논술"],
  },
};

export interface CurriculumSubject {
  name: string;
  group: SubjectGroup;
  type: CourseType;
}

export const CURRICULUM_2022: CurriculumSubject[] = SUBJECT_GROUPS.flatMap((group) =>
  COURSE_TYPES.flatMap((type) => (TABLE[group][type] ?? []).map((name) => ({ name, group, type }))),
);

export function subjectsOf(group: SubjectGroup): CurriculumSubject[] {
  return CURRICULUM_2022.filter((s) => s.group === group);
}

export function isSubjectGroup(v: string): v is SubjectGroup {
  return (SUBJECT_GROUPS as readonly string[]).includes(v);
}

/** 이름 비교용: 공백 제거, 로마 숫자 Ⅰ·Ⅱ ↔ I·II·1·2 통일 */
export function normalizeSubjectName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/\s+/g, "")
    .replace(/Ⅱ|II(?![a-z])/g, "2")
    .replace(/Ⅰ|I(?![a-z])/g, "1")
    .replace(/[·ㆍ・]/g, "·");
}

/** 학교 편제표의 과목 이름을 2022 개정 과목에 맞춘다. 못 찾으면 null (학교 지정 과목) */
export function matchSubject(raw: string): CurriculumSubject | null {
  const key = normalizeSubjectName(raw);
  return CURRICULUM_2022.find((s) => normalizeSubjectName(s.name) === key) ?? null;
}

/** 편제표 한 줄: 학년도·학년·학기에 개설한 과목 */
export interface Course {
  id: string;
  year: number;
  grade: number;
  semester: 1 | 2;
  /** 2022 개정 과목 이름, 또는 학교 지정 과목 이름 */
  subject: string;
  group: SubjectGroup;
  /** 2022 개정 과목이 아니면 null (교육감 승인·계열 과목) */
  type: CourseType | null;
  credits: number;
}

export function courseLabel(c: Pick<Course, "grade" | "semester" | "subject">): string {
  return `${c.subject} · ${c.grade}학년 ${c.semester}학기`;
}

/** 담당 교사의 과목 배정: 과목 + 맡은 반 */
export interface TeacherCourse {
  teacherId: string;
  courseId: string;
  classes: number[];
}

/** 현재 학년도: 3월에 바뀐다 */
export function schoolYear(now = new Date()): number {
  return now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
}
