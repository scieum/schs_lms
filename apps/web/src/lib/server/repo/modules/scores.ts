import "server-only";
import {
  averageTrend, emptyGrades, judgeMinimum, mockAverage, sortExams,
  type Exam, type Grades, type MinCounselList, type MinRule, type MockScore, type NewMinRule, type SchoolGrade, type StudentTarget, type StudyPlan, type Verdict,
} from "@/lib/domain/scores";
import {
  addDays, cellStatus, periodSummary, seoulNow, sessionPeriods, studentDays, weekDays, weekStart,
  type NightAttendance, type NightNotice, type NightRequest, type NightSignup, type Period, type Place, type Session,
} from "@/lib/domain/night";
import { check, db, isUuid, selectIn } from "../supabase";

// 성적(모의고사·내신)·수능 최저 기준·야간 자율학습.
// 인터페이스 + 데모(메모리) 구현 + Supabase 구현을 이 파일 한 곳에 둔다. index.ts 가 합친다.
// 성적·출석 기록은 지우지 않는다. 성적을 다시 올리면 새 행을 더하고 읽을 때 최근 것을 쓴다 (C4).

export type NightEntry = { date: string; session: Session; place: Place };

/** 학생 한 명의 성적·최저 요약 (학생 홈 S1·학생 기록 H2용) */
export interface ScoresStudentSummary {
  latestExam: Exam | null;
  latestGrades: Grades | null;
  latestAverage: number | null;
  trend: { label: string; average: number | null }[];
  targets: { rank: number; university: string; major: string; status: Verdict; reason: string }[];
}

/** 반 학생별 한 줄 요약 (담임 홈 H1용) */
export interface ScoresClassRow {
  studentId: string;
  latestAverage: number | null;
  /** 1순위 목표 대학 판정. 목표가 없으면 null */
  verdict: Verdict | null;
  reason: string | null;
}

export interface ScoresRepo {
  // 시험·모의고사
  listExams(): Promise<Exam[]>;
  createExam(e: { year: number; month: number }): Promise<Exam>;
  /** 학생·시험별 가장 최근 성적 */
  listMockScores(studentIds: string[]): Promise<MockScore[]>;
  /** 성적 반영 (추가만). 반영한 학생 수 */
  addMockScores(examId: string, rows: { studentId: string; grades: Grades }[], by: string): Promise<number>;
  listSchoolGrades(studentIds: string[]): Promise<SchoolGrade[]>;

  // 수능 최저 기준·목표 대학
  listMinRules(): Promise<MinRule[]>;
  addMinRule(r: NewMinRule, by: string): Promise<MinRule>;
  archiveMinRule(id: string): Promise<void>;
  listStudentTargets(studentIds: string[]): Promise<StudentTarget[]>;
  /** 학생의 목표 대학을 통째로 바꾼다 (최대 3개) */
  setStudentTargets(studentId: string, targets: Omit<StudentTarget, "studentId">[]): Promise<void>;
  addMinCounselList(l: Omit<MinCounselList, "id" | "createdAt">): Promise<MinCounselList>;
  latestMinCounselList(grade: number, classNo: number): Promise<MinCounselList | null>;
  addStudyPlan(studentId: string, items: string[]): Promise<StudyPlan>;
  latestStudyPlan(studentId: string): Promise<StudyPlan | null>;

  // 야간 자율학습
  /** from~to (포함) 사이 신청. studentIds 를 주면 그 학생만 */
  listNightSignups(from: string, to: string, studentIds?: string[]): Promise<NightSignup[]>;
  /** 신청 저장 (같은 날이면 덮어씀) */
  saveNightSignups(studentId: string, entries: NightEntry[]): Promise<void>;
  cancelNightSignups(studentId: string, dates: string[]): Promise<void>;
  listNightAttendance(from: string, to: string, studentIds?: string[]): Promise<NightAttendance[]>;
  setNightAttendance(rows: NightAttendance[], by: string): Promise<void>;
  listNightRequests(studentIds: string[], status?: NightRequest["status"]): Promise<NightRequest[]>;
  addNightRequest(r: Omit<NightRequest, "id" | "status" | "createdAt">): Promise<NightRequest>;
  /** 승인하면 신청에 반영한다. 이미 처리된 요청이면 null */
  decideNightRequest(id: string, approve: boolean, by: string): Promise<NightRequest | null>;
  getNightClosure(grade: number, classNo: number, date: string): Promise<string | null>;
  closeNightDay(grade: number, classNo: number, date: string, by: string): Promise<void>;
  addNightNotices(rows: { studentId: string; body: string }[], by: string): Promise<number>;
  listNightNotices(studentId: string): Promise<NightNotice[]>;

  // 다른 화면용 요약
  /** 학생 한 명: 최근 모의고사·평균·추이·목표 대학 판정 (학생 홈 S1, 학생 기록 H2) */
  scoresStudentSummary(studentId: string): Promise<ScoresStudentSummary>;
  /** 반 학생별: 최근 평균 + 1순위 목표 판정 (담임 홈 H1) */
  scoresClassSummary(studentIds: string[]): Promise<ScoresClassRow[]>;
  /** 오늘(한국 시간) 야자 교시별 신청·출석·결석 수 (담임 홈 H1) */
  nightClassToday(studentIds: string[], date?: string): Promise<Record<Period, { signed: number; present: number; absent: number; unchecked: number }>>;
  /** 학생의 이번 주 야자 신청 일수·출석 일수 (학생 홈 S1) */
  nightStudentWeek(studentId: string, date?: string): Promise<{ signed: number; attended: number }>;
}

type Base = Omit<ScoresRepo, "scoresStudentSummary" | "scoresClassSummary" | "nightClassToday" | "nightStudentWeek">;

/** 요약 메서드는 기본 메서드만으로 만든다 (데모·Supabase 공통) */
function withSummaries(base: Base): ScoresRepo {
  async function studentSummary(studentId: string): Promise<ScoresStudentSummary> {
    const [exams, scores, rules, targets] = await Promise.all([base.listExams(), base.listMockScores([studentId]), base.listMinRules(), base.listStudentTargets([studentId])]);
    const sorted = sortExams(exams).filter((e) => scores.some((s) => s.examId === e.id));
    const latestExam = sorted[sorted.length - 1] ?? null;
    const latest = latestExam ? scores.find((s) => s.examId === latestExam.id)! : null;
    const ruleMap = new Map(rules.map((r) => [r.id, r]));
    return {
      latestExam,
      latestGrades: latest?.grades ?? null,
      latestAverage: latest ? mockAverage(latest.grades) : null,
      trend: averageTrend(exams, scores).map((p) => ({ label: p.label, average: p.average })),
      targets: targets
        .sort((a, b) => a.rank - b.rank)
        .map((t) => {
          const j = judgeMinimum(t.ruleId ? ruleMap.get(t.ruleId) : null, latest?.grades);
          return { rank: t.rank, university: t.university, major: t.major, status: j.status, reason: j.reason };
        }),
    };
  }
  return {
    ...base,
    scoresStudentSummary: studentSummary,
    async scoresClassSummary(studentIds) {
      const [exams, scores, rules, targets] = await Promise.all([base.listExams(), base.listMockScores(studentIds), base.listMinRules(), base.listStudentTargets(studentIds)]);
      const order = sortExams(exams).map((e) => e.id);
      const ruleMap = new Map(rules.map((r) => [r.id, r]));
      return studentIds.map((id) => {
        const mine = scores.filter((s) => s.studentId === id).sort((a, b) => order.indexOf(a.examId) - order.indexOf(b.examId));
        const latest = mine[mine.length - 1];
        const t = targets.filter((x) => x.studentId === id).sort((a, b) => a.rank - b.rank)[0];
        const j = t ? judgeMinimum(t.ruleId ? ruleMap.get(t.ruleId) : null, latest?.grades) : null;
        return { studentId: id, latestAverage: latest ? mockAverage(latest.grades) : null, verdict: j?.status ?? null, reason: j?.reason ?? null };
      });
    },
    async nightClassToday(studentIds, date) {
      const d = date ?? seoulNow().date;
      const [signups, att] = await Promise.all([base.listNightSignups(d, d, studentIds), base.listNightAttendance(d, d, studentIds)]);
      const at = (p: Period) =>
        periodSummary(studentIds.map((id) => cellStatus(signups.find((s) => s.studentId === id), att.find((a) => a.studentId === id && a.period === p), p)));
      return { 1: at(1), 2: at(2) };
    },
    async nightStudentWeek(studentId, date) {
      const days = weekDays(date ?? seoulNow().date);
      const [signups, att] = await Promise.all([
        base.listNightSignups(days[0], days[4], [studentId]),
        base.listNightAttendance(days[0], days[4], [studentId]),
      ]);
      return studentDays(studentId, days, signups, att);
    },
  };
}

// ================================================================ 데모

interface ScoresStore {
  exams: Exam[];
  mock: MockScore[];
  school: SchoolGrade[];
  rules: (MinRule & { active: boolean })[];
  targets: StudentTarget[];
  counsel: MinCounselList[];
  plans: StudyPlan[];
  signups: Map<string, NightSignup>; // studentId|date
  attendance: Map<string, NightAttendance>; // studentId|date|period
  requests: NightRequest[];
  closures: Map<string, string>; // grade|class|date → closedAt
  notices: NightNotice[];
  seq: number;
}

const g = globalThis as unknown as { __schsScores?: ScoresStore };

type G6 = [ko: number | null, ma: number | null, en: number | null, hi: number | null, t1: number | null, t2: number | null];
const grades = ([ko, ma, en, hi, t1, t2]: G6): Grades => ({ ko, ma, en, hi, t1, t2 });
const clamp = (n: number | null) => (n === null ? null : Math.min(9, Math.max(1, n)));

function seedScores(): ScoresStore {
  const year = 2026;
  const months = [3, 4, 6, 7, 9, 10];
  const exams: Exam[] = months.map((m) => ({ id: `ex-${m}`, year, month: m, name: `${m}월 모의고사` }));
  const at = (m: number) => new Date(Date.UTC(year, m - 1, 20)).toISOString();

  // 김민준(s-1): 평균 3.3 → 3.1 → 3.0 → 2.8 → 2.6 → 2.3, 수학이 가장 많이 오름 (Figma S3)
  const minjun: Record<number, G6> = {
    3: [2, 5, 3, 3, 3, 3],
    4: [2, 5, 3, 3, 2, 3],
    6: [3, 4, 2, 3, 3, 3],
    7: [3, 3, 2, 3, 3, 3],
    9: [2, 3, 2, 3, 3, 4],
    10: [2, 3, 2, 3, 2, 2],
  };
  // 10월 기준 등급 (Figma H4 판정 표). 이전 시험은 조금씩 낮게(숫자 크게) 만든다
  const october: Record<string, G6> = {
    "s-2": [2, 3, 1, 2, 2, 3],
    "s-3": [3, 3, 4, 4, 4, 3],
    "s-6": [3, 2, 2, 3, 3, 4],
    "s-7": [2, 2, 3, 3, 2, 3],
    "s-8": [4, 3, 3, 4, 3, 3],
    "s-9": [1, 2, 1, 1, 1, 2],
    "s-10": [5, 4, 5, 5, 5, 5],
    "s-11": [3, 4, 3, 3, 4, 4],
    "s-12": [1, 1, 1, 1, 2, 2],
    "s-13": [3, 3, 4, 4, 3, 4],
    "s-14": [3, null, 2, 3, 3, 3], // 10월 수학 결시 → 자료 부족
    "s-15": [4, 5, 4, 3, 4, 5],
  };
  const mock: MockScore[] = [];
  for (const m of months) mock.push({ examId: `ex-${m}`, studentId: "s-1", grades: grades(minjun[m]), createdAt: at(m) });
  Object.entries(october).forEach(([sid, base], si) => {
    months.forEach((m, mi) => {
      const behind = months.length - 1 - mi; // 10월이면 0
      const row = base.map((v, k) => (v === null ? (m === 10 ? null : 3) : clamp(v + (behind > 0 && (si + k + mi) % 3 === 0 ? 1 : 0) + (behind >= 4 ? 1 : 0)))) as G6;
      mock.push({ examId: `ex-${m}`, studentId: sid, grades: grades(row), createdAt: at(m) });
    });
  });

  const school: SchoolGrade[] = [
    { studentId: "s-1", grade: 1, semester: 1, ko: 2, ma: 3, en: 2, average: 2.4 },
    { studentId: "s-1", grade: 1, semester: 2, ko: 2, ma: 2, en: 2, average: 2.2 },
    { studentId: "s-1", grade: 2, semester: 1, ko: 2, ma: 2, en: 1, average: 2.1 },
  ];
  for (const sid of Object.keys(october)) {
    const [ko, ma, en] = october[sid];
    const avg = Math.round((((ko ?? 3) + (ma ?? 3) + (en ?? 3)) / 3) * 10) / 10;
    school.push({ studentId: sid, grade: 1, semester: 1, ko: clamp((ko ?? 3) + 1), ma: clamp((ma ?? 3) + 1), en, average: Math.min(9, avg + 0.4) });
    school.push({ studentId: sid, grade: 1, semester: 2, ko, ma: clamp((ma ?? 3) + 1), en, average: Math.min(9, avg + 0.2) });
    school.push({ studentId: sid, grade: 2, semester: 1, ko, ma, en, average: avg });
  }

  const R = (id: string, university: string, major: string, pick: number, maxSum: number, p: Partial<MinRule> = {}): MinRule & { active: boolean } => ({
    id, university, major, pool: ["ko", "ma", "en", "tam"], pick, maxSum, required: [], historyMax: null, inquiry: "best", note: null, active: true, ...p,
  });
  const rules = [
    R("mr-1", "A대", "산업디자인", 2, 5, { historyMax: 4 }),
    R("mr-2", "A대", "컴퓨터공학", 2, 4),
    R("mr-3", "B대", "경영", 3, 7),
    R("mr-4", "B대", "디자인공학", 3, 7),
    R("mr-5", "C대", "시각디자인", 2, 4, { required: ["ma"] }),
    R("mr-6", "C대", "기계공학", 2, 4),
    R("mr-7", "D대", "간호", 2, 5),
    R("mr-8", "E대", "의예", 4, 5, { inquiry: "avg", note: "과탐 2과목 평균" }),
  ];
  const T = (studentId: string, rank: number, ruleId: string): StudentTarget => {
    const r = rules.find((x) => x.id === ruleId)!;
    return { studentId, rank, university: r.university, major: r.major, ruleId };
  };
  const targets: StudentTarget[] = [
    T("s-1", 1, "mr-1"), T("s-1", 2, "mr-4"), T("s-1", 3, "mr-5"),
    T("s-2", 1, "mr-3"), T("s-3", 1, "mr-7"), T("s-6", 1, "mr-3"), T("s-7", 1, "mr-1"), T("s-8", 1, "mr-6"),
    T("s-9", 1, "mr-8"), T("s-10", 1, "mr-6"), T("s-11", 1, "mr-7"), T("s-12", 1, "mr-8"), T("s-13", 1, "mr-3"), T("s-14", 1, "mr-2"),
  ];

  // 야자: 지난 5주 + 이번 주(오늘까지). 날짜는 오늘 기준으로 만든다
  const today = seoulNow().date;
  const thisWeek = weekStart(today);
  const signups = new Map<string, NightSignup>();
  const attendance = new Map<string, NightAttendance>();
  // 학생별 요일(1=월…5=금)·시간·장소. 오승우(s-8)·송유나(s-15)는 신청하지 않음
  const pattern: Record<string, [number[], Session, Place]> = {
    "s-1": [[1, 3, 4], "both", "자습실 A"],
    "s-2": [[1, 2, 3, 4, 5], "both", "자습실 A"],
    "s-3": [[1, 2, 4, 5], "1", "자습실 B"],
    "s-6": [[1, 2, 3, 4, 5], "both", "자습실 A"],
    "s-7": [[2, 3, 5], "both", "도서관"],
    "s-9": [[1, 2, 3, 4, 5], "2", "자습실 A"],
    "s-10": [[1, 3, 5], "both", "자습실 B"],
    "s-11": [[1, 2, 3, 4, 5], "both", "자습실 A"],
    "s-12": [[1, 2, 3, 4, 5], "both", "도서관"],
    "s-13": [[1, 3, 5], "both", "자습실 A"],
    "s-14": [[1, 2, 3, 4, 5], "both", "자습실 B"],
  };
  // 이번 주 결석·조퇴 (Figma H5: 2회 이상 결석 3명, 금요일에 몰림)
  const misses: Record<string, [number, Period, "결석" | "조퇴"][]> = {
    "s-14": [[2, 1, "결석"], [5, 1, "결석"], [5, 2, "결석"]],
    "s-10": [[1, 2, "결석"], [5, 1, "결석"], [5, 2, "결석"]],
    "s-13": [[3, 2, "조퇴"], [5, 1, "조퇴"]],
  };
  for (let w = -5; w <= 0; w++) {
    const monday = addDays(thisWeek, w * 7);
    for (const [sid, [days, session, place]] of Object.entries(pattern)) {
      for (const d of days) {
        const date = addDays(monday, d - 1);
        if (date > today) continue;
        signups.set(`${sid}|${date}`, { studentId: sid, date, session, place, status: "신청" });
        for (const p of sessionPeriods(session)) {
          if (date === today && p === 2) continue; // 오늘 2교시는 아직 확인 전
          const miss = w === 0 ? misses[sid]?.find(([dd, pp]) => dd === d && pp === p) : undefined;
          // 지난주까지는 가끔 결석 (출결 4주 기록)
          const pastMiss = w < 0 && (sid.length + d + w + p) % 11 === 0;
          const status = miss ? miss[2] : pastMiss ? "결석" : "출석";
          attendance.set(`${sid}|${date}|${p}`, { studentId: sid, date, period: p, status });
        }
      }
    }
  }
  // 다음 주: 몇 명은 이미 신청 (김민준은 미신청)
  const nextMonday = addDays(thisWeek, 7);
  for (const sid of ["s-2", "s-6", "s-11", "s-12", "s-14", "s-4", "s-5"]) {
    for (let d = 0; d < 5; d++) {
      const date = addDays(nextMonday, d);
      signups.set(`${sid}|${date}`, { studentId: sid, date, session: "both", place: sid === "s-12" ? "도서관" : "자습실 A", status: "신청" });
    }
  }

  const created = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
  const restOfWeek = [0, 1, 2, 3, 4].map((i) => addDays(thisWeek, i)).filter((d) => d >= today);
  const requests: NightRequest[] = [
    { id: "nr-1", studentId: "s-8", dates: restOfWeek.length ? restOfWeek : [nextMonday], session: "both", place: "자습실 A", note: "학원 일정 변경으로 오늘부터 참여", status: "대기", createdAt: created(5) },
    { id: "nr-2", studentId: "s-10", dates: [addDays(nextMonday, 1)], session: "both", place: "자습실 B", note: "화요일 자율학습 추가 신청", status: "대기", createdAt: created(3) },
    { id: "nr-3", studentId: "s-15", dates: [addDays(nextMonday, 0), addDays(nextMonday, 2)], session: "2", place: "자습실 A", note: "2교시만 참여", status: "대기", createdAt: created(1) },
  ];

  return { exams, mock, school, rules, targets, counsel: [], plans: [], signups, attendance, requests, closures: new Map(), notices: [], seq: 100 };
}

function S(): ScoresStore {
  if (!g.__schsScores) g.__schsScores = seedScores();
  return g.__schsScores;
}
const nextId = (p: string) => `${p}-${++S().seq}`;
const inRange = (d: string, from: string, to: string) => d >= from && d <= to;
const ruleOut = (r: MinRule & { active: boolean }): MinRule => ({
  id: r.id, university: r.university, major: r.major, pool: [...r.pool], pick: r.pick, maxSum: r.maxSum, required: [...r.required],
  historyMax: r.historyMax, inquiry: r.inquiry, note: r.note,
});

const demoBase: Base = {
  async listExams() {
    return sortExams(S().exams);
  },
  async createExam({ year, month }) {
    const found = S().exams.find((e) => e.year === year && e.month === month);
    if (found) return found;
    const e: Exam = { id: nextId("ex"), year, month, name: `${month}월 모의고사` };
    S().exams.push(e);
    return e;
  },
  async listMockScores(studentIds) {
    const ids = new Set(studentIds);
    const latest = new Map<string, MockScore>();
    for (const m of S().mock) {
      if (!ids.has(m.studentId)) continue;
      const k = `${m.examId}|${m.studentId}`;
      const prev = latest.get(k);
      if (!prev || prev.createdAt <= m.createdAt) latest.set(k, m);
    }
    return [...latest.values()];
  },
  async addMockScores(examId, rows) {
    const now = new Date().toISOString();
    for (const r of rows) S().mock.push({ examId, studentId: r.studentId, grades: { ...r.grades }, createdAt: now });
    return rows.length;
  },
  async listSchoolGrades(studentIds) {
    const ids = new Set(studentIds);
    return S().school.filter((x) => ids.has(x.studentId)).sort((a, b) => a.grade - b.grade || a.semester - b.semester);
  },

  async listMinRules() {
    return S().rules.filter((r) => r.active).map(ruleOut);
  },
  async addMinRule(r) {
    const rule = { ...r, id: nextId("mr"), active: true };
    S().rules.push(rule);
    return ruleOut(rule);
  },
  async archiveMinRule(id) {
    const r = S().rules.find((x) => x.id === id);
    if (r) r.active = false;
  },
  async listStudentTargets(studentIds) {
    const ids = new Set(studentIds);
    return S().targets.filter((t) => ids.has(t.studentId)).sort((a, b) => a.rank - b.rank);
  },
  async setStudentTargets(studentId, targets) {
    const s = S();
    s.targets = [...s.targets.filter((t) => t.studentId !== studentId), ...targets.map((t) => ({ ...t, studentId }))];
  },
  async addMinCounselList(l) {
    const out: MinCounselList = { ...l, id: nextId("mc"), createdAt: new Date().toISOString() };
    S().counsel.push(out);
    return out;
  },
  async latestMinCounselList(grade, classNo) {
    return [...S().counsel].reverse().find((c) => c.grade === grade && c.classNo === classNo) ?? null;
  },
  async addStudyPlan(studentId, items) {
    const out: StudyPlan = { id: nextId("sp"), studentId, items, createdAt: new Date().toISOString() };
    S().plans.push(out);
    return out;
  },
  async latestStudyPlan(studentId) {
    return [...S().plans].reverse().find((p) => p.studentId === studentId) ?? null;
  },

  async listNightSignups(from, to, studentIds) {
    const ids = studentIds ? new Set(studentIds) : null;
    return [...S().signups.values()].filter((s) => inRange(s.date, from, to) && (!ids || ids.has(s.studentId)));
  },
  async saveNightSignups(studentId, entries) {
    for (const e of entries) S().signups.set(`${studentId}|${e.date}`, { studentId, ...e, status: "신청" });
  },
  async cancelNightSignups(studentId, dates) {
    for (const d of dates) {
      const s = S().signups.get(`${studentId}|${d}`);
      if (s) s.status = "취소";
    }
  },
  async listNightAttendance(from, to, studentIds) {
    const ids = studentIds ? new Set(studentIds) : null;
    return [...S().attendance.values()].filter((a) => inRange(a.date, from, to) && (!ids || ids.has(a.studentId)));
  },
  async setNightAttendance(rows) {
    for (const r of rows) S().attendance.set(`${r.studentId}|${r.date}|${r.period}`, { ...r });
  },
  async listNightRequests(studentIds, status) {
    const ids = new Set(studentIds);
    return S().requests.filter((r) => ids.has(r.studentId) && (!status || r.status === status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async addNightRequest(r) {
    const out: NightRequest = { ...r, id: nextId("nr"), status: "대기", createdAt: new Date().toISOString() };
    S().requests.push(out);
    return out;
  },
  async decideNightRequest(id, approve) {
    const r = S().requests.find((x) => x.id === id);
    if (!r || r.status !== "대기") return null;
    r.status = approve ? "승인" : "반려";
    if (approve) await demoBase.saveNightSignups(r.studentId, r.dates.map((date) => ({ date, session: r.session, place: r.place })));
    return { ...r };
  },
  async getNightClosure(grade, classNo, date) {
    return S().closures.get(`${grade}|${classNo}|${date}`) ?? null;
  },
  async closeNightDay(grade, classNo, date) {
    const k = `${grade}|${classNo}|${date}`;
    if (!S().closures.has(k)) S().closures.set(k, new Date().toISOString());
  },
  async addNightNotices(rows, by) {
    const now = new Date().toISOString();
    for (const r of rows) S().notices.push({ id: nextId("nn"), studentId: r.studentId, body: r.body, createdBy: by, createdAt: now });
    return rows.length;
  },
  async listNightNotices(studentId) {
    return S().notices.filter((n) => n.studentId === studentId).reverse();
  },
};

export const demoScores: ScoresRepo = withSummaries(demoBase);

// ================================================================ Supabase

type ExamRow = { id: string; year: number; month: number; name: string };
type MockRow = { exam_id: string; student_id: string; ko: number | null; ma: number | null; en: number | null; hi: number | null; t1: number | null; t2: number | null; created_at: string };
type SchoolRow = { student_id: string; grade: number; semester: 1 | 2; ko: number | null; ma: number | null; en: number | null; average: number | string; created_at: string };
type RuleRow = {
  id: string; university: string; major: string; pool: MinRule["pool"]; pick: number; max_sum: number | string; required: MinRule["required"];
  history_max: number | null; inquiry: MinRule["inquiry"]; note: string | null;
};
type TargetRow = { student_id: string; rank: number; university: string; major: string; rule_id: string | null };
type CounselRow = { id: string; grade: number; class_no: number; exam_id: string | null; items: MinCounselList["items"]; created_by: string; created_at: string };
type PlanRow = { id: string; student_id: string; items: string[]; created_at: string };
type SignupRow = { student_id: string; date: string; session: Session; place: Place; status: NightSignup["status"] };
type AttRow = { student_id: string; date: string; period: Period; status: NightAttendance["status"] };
type RequestRow = { id: string; student_id: string; dates: string[]; session: Session; place: Place; note: string; status: NightRequest["status"]; created_at: string };
type NoticeRow = { id: string; student_id: string; body: string; created_by: string; created_at: string };

const toExam = (r: ExamRow): Exam => ({ id: r.id, year: r.year, month: r.month, name: r.name });
const toRule = (r: RuleRow): MinRule => ({
  id: r.id, university: r.university, major: r.major, pool: r.pool, pick: r.pick, maxSum: Number(r.max_sum), required: r.required ?? [],
  historyMax: r.history_max, inquiry: r.inquiry, note: r.note,
});
const toTarget = (r: TargetRow): StudentTarget => ({ studentId: r.student_id, rank: r.rank, university: r.university, major: r.major, ruleId: r.rule_id });
const toCounsel = (r: CounselRow): MinCounselList => ({ id: r.id, grade: r.grade, classNo: r.class_no, examId: r.exam_id, items: r.items, createdBy: r.created_by, createdAt: r.created_at });
const toPlan = (r: PlanRow): StudyPlan => ({ id: r.id, studentId: r.student_id, items: r.items, createdAt: r.created_at });
const toSignup = (r: SignupRow): NightSignup => ({ studentId: r.student_id, date: r.date, session: r.session, place: r.place, status: r.status });
const toAtt = (r: AttRow): NightAttendance => ({ studentId: r.student_id, date: r.date, period: Number(r.period) as Period, status: r.status });
const toRequest = (r: RequestRow): NightRequest => ({ id: r.id, studentId: r.student_id, dates: r.dates, session: r.session, place: r.place, note: r.note, status: r.status, createdAt: r.created_at });
const uuids = (ids: string[]) => ids.filter(isUuid);

const supabaseBase: Base = {
  async listExams() {
    const r = check(await db().from("exams").select("id, year, month, name").order("year").order("month"));
    return (r as ExamRow[]).map(toExam);
  },
  async createExam({ year, month }) {
    const r = check(await db().from("exams").upsert({ year, month, name: `${month}월 모의고사` }, { onConflict: "year,month" }).select("id, year, month, name").single());
    return toExam(r as ExamRow);
  },
  async listMockScores(studentIds) {
    const ids = uuids(studentIds);
    if (!ids.length) return [];
    const r = await selectIn<MockRow>(ids, (part) => db().from("mock_scores").select("exam_id, student_id, ko, ma, en, hi, t1, t2, created_at").in("student_id", part).order("created_at", { ascending: false }),
      (a, b) => b.created_at.localeCompare(a.created_at));
    const latest = new Map<string, MockScore>();
    for (const x of r as MockRow[]) {
      const k = `${x.exam_id}|${x.student_id}`;
      if (latest.has(k)) continue;
      const gr = emptyGrades();
      gr.ko = x.ko; gr.ma = x.ma; gr.en = x.en; gr.hi = x.hi; gr.t1 = x.t1; gr.t2 = x.t2;
      latest.set(k, { examId: x.exam_id, studentId: x.student_id, grades: gr, createdAt: x.created_at });
    }
    return [...latest.values()];
  },
  async addMockScores(examId, rows, by) {
    if (!rows.length) return 0;
    check(await db().from("mock_scores").insert(rows.map((r) => ({ exam_id: examId, student_id: r.studentId, ...r.grades, uploaded_by: isUuid(by) ? by : null }))));
    return rows.length;
  },
  async listSchoolGrades(studentIds) {
    const ids = uuids(studentIds);
    if (!ids.length) return [];
    const r = await selectIn<SchoolRow>(ids, (part) => db().from("school_grades").select("student_id, grade, semester, ko, ma, en, average, created_at").in("student_id", part).order("created_at", { ascending: false }),
      (a, b) => b.created_at.localeCompare(a.created_at));
    const seen = new Set<string>();
    const out: SchoolGrade[] = [];
    for (const x of r as SchoolRow[]) {
      const k = `${x.student_id}|${x.grade}|${x.semester}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ studentId: x.student_id, grade: x.grade, semester: x.semester, ko: x.ko, ma: x.ma, en: x.en, average: Number(x.average) });
    }
    return out.sort((a, b) => a.grade - b.grade || a.semester - b.semester);
  },

  async listMinRules() {
    const r = check(await db().from("min_rules").select("*").eq("active", true).order("university").order("major"));
    return (r as RuleRow[]).map(toRule);
  },
  async addMinRule(x, by) {
    const r = check(await db().from("min_rules").insert({
      university: x.university, major: x.major, pool: x.pool, pick: x.pick, max_sum: x.maxSum, required: x.required, history_max: x.historyMax,
      inquiry: x.inquiry, note: x.note, created_by: isUuid(by) ? by : null,
    }).select("*").single());
    return toRule(r as RuleRow);
  },
  async archiveMinRule(id) {
    if (!isUuid(id)) return;
    check(await db().from("min_rules").update({ active: false }).eq("id", id));
  },
  async listStudentTargets(studentIds) {
    const ids = uuids(studentIds);
    if (!ids.length) return [];
    const r = await selectIn<TargetRow>(ids, (part) => db().from("student_targets").select("student_id, rank, university, major, rule_id").in("student_id", part).order("rank"), (a, b) => a.rank - b.rank);
    return r.map(toTarget);
  },
  async setStudentTargets(studentId, targets) {
    if (!isUuid(studentId)) return;
    check(await db().from("student_targets").delete().eq("student_id", studentId));
    if (targets.length) {
      check(await db().from("student_targets").insert(targets.map((t) => ({
        student_id: studentId, rank: t.rank, university: t.university, major: t.major, rule_id: t.ruleId && isUuid(t.ruleId) ? t.ruleId : null,
      }))));
    }
  },
  async addMinCounselList(l) {
    const r = check(await db().from("min_counsel_lists").insert({ grade: l.grade, class_no: l.classNo, exam_id: l.examId && isUuid(l.examId) ? l.examId : null, items: l.items, created_by: l.createdBy }).select("*").single());
    return toCounsel(r as CounselRow);
  },
  async latestMinCounselList(grade, classNo) {
    const r = check(await db().from("min_counsel_lists").select("*").eq("grade", grade).eq("class_no", classNo).order("created_at", { ascending: false }).limit(1).maybeSingle());
    return r ? toCounsel(r as CounselRow) : null;
  },
  async addStudyPlan(studentId, items) {
    const r = check(await db().from("study_plans").insert({ student_id: studentId, items }).select("*").single());
    return toPlan(r as PlanRow);
  },
  async latestStudyPlan(studentId) {
    if (!isUuid(studentId)) return null;
    const r = check(await db().from("study_plans").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(1).maybeSingle());
    return r ? toPlan(r as PlanRow) : null;
  },

  async listNightSignups(from, to, studentIds) {
    const base = () => db().from("night_signups").select("student_id, date, session, place, status").gte("date", from).lte("date", to);
    if (studentIds) {
      const ids = uuids(studentIds);
      if (!ids.length) return [];
      return (await selectIn<SignupRow>(ids, (part) => base().in("student_id", part))).map(toSignup);
    }
    return (check(await base()) as SignupRow[]).map(toSignup);
  },
  async saveNightSignups(studentId, entries) {
    if (!entries.length) return;
    const now = new Date().toISOString();
    check(await db().from("night_signups").upsert(entries.map((e) => ({ student_id: studentId, date: e.date, session: e.session, place: e.place, status: "신청", updated_at: now })), { onConflict: "student_id,date" }));
  },
  async cancelNightSignups(studentId, dates) {
    if (!dates.length) return;
    check(await db().from("night_signups").update({ status: "취소", updated_at: new Date().toISOString() }).eq("student_id", studentId).in("date", dates));
  },
  async listNightAttendance(from, to, studentIds) {
    const base = () => db().from("night_attendance").select("student_id, date, period, status").gte("date", from).lte("date", to);
    if (studentIds) {
      const ids = uuids(studentIds);
      if (!ids.length) return [];
      return (await selectIn<AttRow>(ids, (part) => base().in("student_id", part))).map(toAtt);
    }
    return (check(await base()) as AttRow[]).map(toAtt);
  },
  async setNightAttendance(rows, by) {
    if (!rows.length) return;
    const now = new Date().toISOString();
    check(await db().from("night_attendance").upsert(
      rows.map((r) => ({ student_id: r.studentId, date: r.date, period: r.period, status: r.status, checked_by: isUuid(by) ? by : null, updated_at: now })),
      { onConflict: "student_id,date,period" },
    ));
  },
  async listNightRequests(studentIds, status) {
    const ids = uuids(studentIds);
    if (!ids.length) return [];
    const rows = await selectIn<RequestRow>(ids, (part) => {
      const q = db().from("night_requests").select("id, student_id, dates, session, place, note, status, created_at").in("student_id", part).order("created_at");
      return status ? q.eq("status", status) : q;
    }, (a, b) => a.created_at.localeCompare(b.created_at));
    return rows.map(toRequest);
  },
  async addNightRequest(r) {
    const x = check(await db().from("night_requests").insert({ student_id: r.studentId, dates: r.dates, session: r.session, place: r.place, note: r.note }).select("id, student_id, dates, session, place, note, status, created_at").single());
    return toRequest(x as RequestRow);
  },
  async decideNightRequest(id, approve, by) {
    if (!isUuid(id)) return null;
    // 대기 상태일 때만 바꾼다 (두 번 눌러도 한 번만 반영)
    const r = check(await db().from("night_requests")
      .update({ status: approve ? "승인" : "반려", decided_by: isUuid(by) ? by : null, decided_at: new Date().toISOString() })
      .eq("id", id).eq("status", "대기")
      .select("id, student_id, dates, session, place, note, status, created_at").maybeSingle());
    if (!r) return null;
    const req = toRequest(r as RequestRow);
    if (approve) await supabaseBase.saveNightSignups(req.studentId, req.dates.map((date) => ({ date, session: req.session, place: req.place })));
    return req;
  },
  async getNightClosure(grade, classNo, date) {
    const r = check(await db().from("night_closures").select("closed_at").eq("grade", grade).eq("class_no", classNo).eq("date", date).maybeSingle());
    return r ? (r as { closed_at: string }).closed_at : null;
  },
  async closeNightDay(grade, classNo, date, by) {
    check(await db().from("night_closures").upsert({ grade, class_no: classNo, date, closed_by: by }, { onConflict: "grade,class_no,date", ignoreDuplicates: true }));
  },
  async addNightNotices(rows, by) {
    if (!rows.length) return 0;
    check(await db().from("night_notices").insert(rows.map((r) => ({ student_id: r.studentId, body: r.body, created_by: by }))));
    return rows.length;
  },
  async listNightNotices(studentId) {
    if (!isUuid(studentId)) return [];
    const r = check(await db().from("night_notices").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(20));
    return (r as NoticeRow[]).map((x) => ({ id: x.id, studentId: x.student_id, body: x.body, createdBy: x.created_by, createdAt: x.created_at }));
  },
};

export const supabaseScores: ScoresRepo = withSummaries(supabaseBase);
