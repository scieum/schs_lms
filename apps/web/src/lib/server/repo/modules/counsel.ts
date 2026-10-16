import "server-only";
import type {
  CorrectionRequest, CounselRecord, PastRecord, RecInterest, RecItem,
} from "@/lib/domain/counsel";
import { schoolYear } from "@/lib/domain/curriculum";
import { store } from "../demo";
import { check, db, isUuid } from "../supabase";

// 상담 기록·학생 추천·정정 요청·전년도 확정 생기부.
// 인터페이스 + 데모(메모리) 구현 + Supabase 구현을 이 파일 한 곳에 둔다. index.ts 가 합친다.
// 상담 기록·확정본·정정 요청은 추가만 한다 (C4). 권한 판정은 domain/counsel.ts 에서 한다 — 여기는 저장만.

export type NewCounsel = Omit<CounselRecord, "id" | "createdAt">;
export type NewPastRecord = Omit<PastRecord, "id">;
export type NewRecItem = Omit<RecItem, "id" | "createdAt">;
export type NewRecInterest = Omit<RecInterest, "id" | "createdAt">;

export interface CounselRepo {
  /** 상담 기록. 권한 거르기는 호출한 쪽에서 visibleCounsel 로 한다 */
  listCounsel(filter: { studentIds?: string[]; authorId?: string }): Promise<CounselRecord[]>;
  addCounsel(r: NewCounsel): Promise<CounselRecord>;

  /** 확정 생기부(지난 학년도). 학생 화면은 recordsForStudent 로 한 번 더 거른다 */
  listPastRecords(studentIds: string[]): Promise<PastRecord[]>;
  addPastRecords(rows: NewPastRecord[]): Promise<number>;

  addCorrectionRequest(r: Omit<CorrectionRequest, "id" | "createdAt" | "status">): Promise<CorrectionRequest>;
  listCorrectionRequests(studentIds: string[]): Promise<CorrectionRequest[]>;

  listRecItems(): Promise<RecItem[]>;
  addRecItem(r: NewRecItem): Promise<RecItem>;
  listRecInterests(studentId: string): Promise<RecInterest[]>;
  /** 같은 항목(카탈로그 id 또는 제목)이 이미 있으면 그대로 둔다 */
  addRecInterest(r: NewRecInterest): Promise<RecInterest>;
  removeRecInterest(studentId: string, id: string): Promise<void>;

  /** 학생 희망 진로 (students.career_goal) */
  updateStudentCareerGoal(studentId: string, goal: string | null): Promise<void>;
}

// ---------------- 데모 ----------------

interface CounselStore {
  counsel: CounselRecord[];
  past: PastRecord[];
  corrections: CorrectionRequest[];
  recItems: RecItem[];
  interests: RecInterest[];
}

const g = globalThis as unknown as { __schsCounsel?: CounselStore };

function seed(): CounselStore {
  const at = (d: string) => `${d}T09:00:00+09:00`;
  const C: [string, string, string, CounselRecord["area"], string, string][] = [
    // 김민준(s-1): Figma T5 문구 — 이서연·박지훈 작성 섞음
    ["cn-1", "s-1", "t-subject", "진로", "2026-10-15", "공학 계열과 디자인 사이에서 고민 중. 산업디자인공학과를 소개하고 관련 활동을 추천함."],
    ["cn-2", "s-1", "t-subject", "학습", "2026-10-02", "과학 탐구 발표 주제 선정 상담. 미세플라스틱 관련 선행 연구 자료를 안내함."],
    ["cn-3", "s-1", "t-homeroom", "진로", "2026-09-18", "희망 진로 설문 결과를 함께 보고, 디자인 동아리 활동 계획을 세움."],
    ["cn-4", "s-6", "t-subject", "학습", "2026-10-13", "화학 실험 보고서 쓰는 순서를 함께 정리함."],
    ["cn-5", "s-7", "t-homeroom", "생활", "2026-10-07", "등교 시간이 늦어지는 이유를 이야기함. 아침 루틴을 같이 정함."],
    ["cn-6", "s-7", "t-subject", "진로", "2026-09-25", "생명과학 계열 학과 정보를 안내함."],
    ["cn-7", "s-9", "t-subject", "학습", "2026-09-10", "물리 서술형 답안 쓰는 법을 연습함."],
  ];
  const counsel: CounselRecord[] = C.map(([id, studentId, authorId, area, date, content]) => ({ id, studentId, authorId, area, date, content, prevId: null, createdAt: at(date) }));

  // 김민준 1학년(지난 학년도) 확정 생기부 — Figma S4 문구
  const y = schoolYear() - 1;
  const P: [PastRecord["area"], string, string, string][] = [
    ["진로활동", "진로 탐색 주간", "산업디자인 직업 탐색 활동에서 생활 속 불편을 관찰 일지로 기록하고, 등굣길 우산 거치대 문제를 사용자 인터뷰로 구체화함. 시제품 스케치 3안을 비교하며 사용 맥락에 따라 형태가 달라져야 함을 설명하는 등 문제를 사람 중심으로 바라보는 태도가 돋보임.", "이서연"],
    ["진로활동", "전공 탐색 발표", "지역 업사이클링 공방을 조사해 폐어구로 만든 생활용품 사례를 발표함. 재료의 내구성과 가격을 표로 정리해 친환경 디자인의 현실적 한계까지 짚어냄.", "박지훈"],
    ["자율활동", "학급 환경 개선", "학급 게시판 배치를 바꾸자는 의견을 내고, 친구들의 동선을 관찰해 자주 보는 위치에 공지를 옮기는 안을 만들어 실행함.", "박지훈"],
    ["동아리활동", "디자인 씽킹반", "교내 분리수거장 표지판을 다시 디자인하는 프로젝트에서 그림 기호를 맡아 3차례 수정 끝에 완성함. 사용자 의견을 받아 글자 크기를 키운 과정을 보고서로 남김.", "최민호"],
    ["교과세특", "통합과학1", "물질의 규칙성 단원에서 생활 속 플라스틱 재질 표시를 조사하고, 재질별 재활용 가능성을 표로 정리해 발표함.", "이서연"],
    ["교과세특", "공통국어1", "광고 문구 분석 활동에서 같은 제품을 두 가지 문체로 소개하고, 듣는 사람에 따라 표현이 달라져야 함을 설명함.", "박지훈"],
    ["교과세특", "공통수학1", "도형의 방정식 단원에서 좌표를 이용해 의자 등받이 곡선을 설계하는 과제를 수행함.", "김태현"],
    ["교과세특", "미술", "생활용품 리디자인 과제에서 손잡이 각도를 바꾼 머그컵 모형을 만들고 사용 소감을 받아 개선함.", "윤소라"],
  ];
  const past: PastRecord[] = P.map(([area, title, content, teacherName], i) => ({
    id: `pr-${i + 1}`, studentId: "s-1", year: y, grade: 1, area, title, content, teacherName, confirmedAt: `${y + 1}-02-21`,
  }));

  const R: [RecItem["kind"], string, string, string[], string][] = [
    ["도서", "디자인의 디자인", "하라 켄야", ["디자인", "산업디자인", "시각디자인"], "2026-10-14"],
    ["대회", "청소년 디자인 공모전", "11.30 마감 · 개인·팀", ["디자인", "산업디자인"], "2026-10-10"],
    ["활동", "업사이클링 메이커 동아리", "매주 목 7교시", ["디자인", "환경", "공학"], "2026-10-08"],
    ["진로", "디자이너 직업인 특강", "11.06 (금) 5교시", ["디자인"], "2026-10-05"],
    ["도서", "사용자 경험 디자인 첫걸음", "청소년 교양", ["디자인", "산업디자인", "UX"], "2026-09-30"],
    ["대회", "교내 탐구 발표 대회", "12.10 신청 마감", [], "2026-09-28"],
    ["도서", "이기적 유전자", "리처드 도킨스", ["생명과학", "의학", "생명"], "2026-09-20"],
    ["진로", "의료인 직업 특강", "11.20 (금) 6교시", ["의학", "간호", "보건"], "2026-09-18"],
  ];
  const recItems: RecItem[] = R.map(([kind, title, meta, careers, d], i) => ({ id: `rec-${i + 1}`, kind, title, meta, careers, createdBy: "t-admin", createdAt: at(d) }));

  return { counsel, past, corrections: [], recItems, interests: [] };
}

function cs(): CounselStore {
  if (!g.__schsCounsel) g.__schsCounsel = seed();
  return g.__schsCounsel;
}

const now = () => new Date().toISOString();

export const demoCounsel: CounselRepo = {
  async listCounsel({ studentIds, authorId }) {
    const ids = studentIds ? new Set(studentIds) : null;
    return cs().counsel.filter((r) => (!ids || ids.has(r.studentId)) && (!authorId || r.authorId === authorId)).map((r) => ({ ...r }));
  },
  async addCounsel(r) {
    const row: CounselRecord = { ...r, id: crypto.randomUUID(), createdAt: now() };
    cs().counsel.push(row);
    return { ...row };
  },
  async listPastRecords(studentIds) {
    const ids = new Set(studentIds);
    return cs().past.filter((r) => ids.has(r.studentId)).map((r) => ({ ...r }));
  },
  async addPastRecords(rows) {
    cs().past.push(...rows.map((r) => ({ ...r, id: crypto.randomUUID() })));
    return rows.length;
  },
  async addCorrectionRequest(r) {
    const row: CorrectionRequest = { ...r, id: crypto.randomUUID(), status: "requested", createdAt: now() };
    cs().corrections.push(row);
    return { ...row };
  },
  async listCorrectionRequests(studentIds) {
    const ids = new Set(studentIds);
    return cs().corrections.filter((r) => ids.has(r.studentId)).map((r) => ({ ...r }));
  },
  async listRecItems() {
    return cs().recItems.map((r) => ({ ...r, careers: [...r.careers] }));
  },
  async addRecItem(r) {
    const row: RecItem = { ...r, careers: [...r.careers], id: crypto.randomUUID(), createdAt: now() };
    cs().recItems.push(row);
    return { ...row };
  },
  async listRecInterests(studentId) {
    return cs().interests.filter((r) => r.studentId === studentId).map((r) => ({ ...r }));
  },
  async addRecInterest(r) {
    const s = cs();
    const dup = s.interests.find((x) => x.studentId === r.studentId && (r.itemId ? x.itemId === r.itemId : x.title === r.title));
    if (dup) return { ...dup };
    const row: RecInterest = { ...r, id: crypto.randomUUID(), createdAt: now() };
    s.interests.push(row);
    return { ...row };
  },
  async removeRecInterest(studentId, id) {
    const s = cs();
    s.interests = s.interests.filter((x) => !(x.id === id && x.studentId === studentId));
  },
  async updateStudentCareerGoal(studentId, goal) {
    // 공용 데모 store 의 학생 한 명만 고친다 (최소 변경)
    const st = store().students.get(studentId);
    if (st) store().students.set(studentId, { ...st, careerGoal: goal });
  },
};

// ---------------- Supabase ----------------

type CounselRow = { id: string; student_id: string; author_id: string; area: CounselRecord["area"]; date: string; content: string; prev_id: string | null; created_at: string };
type PastRow = { id: string; student_id: string; year: number; grade: number; area: PastRecord["area"]; title: string; content: string; teacher_name: string; confirmed_at: string };
type CorrectionRow = { id: string; student_id: string; record_id: string; reason: string; status: CorrectionRequest["status"]; created_at: string };
type RecItemRow = { id: string; kind: RecItem["kind"]; title: string; meta: string; careers: string[]; created_by: string; created_at: string };
type InterestRow = { id: string; student_id: string; item_id: string | null; kind: RecInterest["kind"]; title: string; meta: string; source: RecInterest["source"]; created_at: string };

const toCounsel = (r: CounselRow): CounselRecord => ({ id: r.id, studentId: r.student_id, authorId: r.author_id, area: r.area, date: r.date, content: r.content, prevId: r.prev_id, createdAt: r.created_at });
const toPast = (r: PastRow): PastRecord => ({ id: r.id, studentId: r.student_id, year: r.year, grade: r.grade, area: r.area, title: r.title, content: r.content, teacherName: r.teacher_name, confirmedAt: r.confirmed_at });
const toCorrection = (r: CorrectionRow): CorrectionRequest => ({ id: r.id, studentId: r.student_id, recordId: r.record_id, reason: r.reason, status: r.status, createdAt: r.created_at });
const toRecItem = (r: RecItemRow): RecItem => ({ id: r.id, kind: r.kind, title: r.title, meta: r.meta, careers: r.careers ?? [], createdBy: r.created_by, createdAt: r.created_at });
const toInterest = (r: InterestRow): RecInterest => ({ id: r.id, studentId: r.student_id, itemId: r.item_id, kind: r.kind, title: r.title, meta: r.meta, source: r.source, createdAt: r.created_at });

const uuids = (ids: string[]) => ids.filter(isUuid);

export const supabaseCounsel: CounselRepo = {
  async listCounsel({ studentIds, authorId }) {
    let q = db().from("counsel_records").select("*");
    if (studentIds) {
      const ids = uuids(studentIds);
      if (!ids.length) return [];
      q = q.in("student_id", ids);
    }
    if (authorId) {
      if (!isUuid(authorId)) return [];
      q = q.eq("author_id", authorId);
    }
    const rows = check(await q.order("date", { ascending: false }));
    return (rows as CounselRow[]).map(toCounsel);
  },
  async addCounsel(r) {
    const row = check(await db().from("counsel_records").insert({
      student_id: r.studentId, author_id: r.authorId, area: r.area, date: r.date, content: r.content, prev_id: r.prevId,
    }).select("*").single());
    return toCounsel(row as CounselRow);
  },
  async listPastRecords(studentIds) {
    const ids = uuids(studentIds);
    if (!ids.length) return [];
    const rows = check(await db().from("past_records").select("*").in("student_id", ids).order("year").order("area"));
    return (rows as PastRow[]).map(toPast);
  },
  async addPastRecords(rows) {
    if (!rows.length) return 0;
    check(await db().from("past_records").insert(rows.map((r) => ({
      student_id: r.studentId, year: r.year, grade: r.grade, area: r.area, title: r.title, content: r.content, teacher_name: r.teacherName, confirmed_at: r.confirmedAt,
    }))));
    return rows.length;
  },
  async addCorrectionRequest(r) {
    const row = check(await db().from("record_corrections").insert({ student_id: r.studentId, record_id: r.recordId, reason: r.reason }).select("*").single());
    return toCorrection(row as CorrectionRow);
  },
  async listCorrectionRequests(studentIds) {
    const ids = uuids(studentIds);
    if (!ids.length) return [];
    const rows = check(await db().from("record_corrections").select("*").in("student_id", ids).order("created_at", { ascending: false }));
    return (rows as CorrectionRow[]).map(toCorrection);
  },
  async listRecItems() {
    const rows = check(await db().from("rec_items").select("*").eq("active", true).order("created_at", { ascending: false }));
    return (rows as RecItemRow[]).map(toRecItem);
  },
  async addRecItem(r) {
    const row = check(await db().from("rec_items").insert({ kind: r.kind, title: r.title, meta: r.meta, careers: r.careers, created_by: r.createdBy }).select("*").single());
    return toRecItem(row as RecItemRow);
  },
  async listRecInterests(studentId) {
    if (!isUuid(studentId)) return [];
    const rows = check(await db().from("rec_interests").select("*").eq("student_id", studentId).order("created_at", { ascending: false }));
    return (rows as InterestRow[]).map(toInterest);
  },
  async addRecInterest(r) {
    let q = db().from("rec_interests").select("*").eq("student_id", r.studentId);
    q = r.itemId ? q.eq("item_id", r.itemId) : q.eq("title", r.title);
    const dup = check(await q.maybeSingle());
    if (dup) return toInterest(dup as InterestRow);
    const row = check(await db().from("rec_interests").insert({
      student_id: r.studentId, item_id: r.itemId, kind: r.kind, title: r.title, meta: r.meta, source: r.source,
    }).select("*").single());
    return toInterest(row as InterestRow);
  },
  async removeRecInterest(studentId, id) {
    if (!isUuid(studentId) || !isUuid(id)) return;
    check(await db().from("rec_interests").delete().eq("id", id).eq("student_id", studentId));
  },
  async updateStudentCareerGoal(studentId, goal) {
    if (!isUuid(studentId)) return;
    check(await db().from("students").update({ career_goal: goal }).eq("id", studentId));
  },
};
