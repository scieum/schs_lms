import "server-only";
import { schoolYear } from "@/lib/domain/curriculum";
import type { ActivityLog } from "@/lib/domain/activity";
import type { RecordArea, RecordDraft, RecordMemo } from "@/lib/domain/writing";
import { isDemo } from "../../env";
import { store } from "../demo";
import { check, db, isUuid, selectIn } from "../supabase";

// 교사 AI 기록 쓰기(세특·누가기록 특기사항·행발).
// 인터페이스 + 데모(메모리) 구현 + Supabase 구현을 이 파일 한 곳에 둔다. index.ts 가 합친다.
// 초안·메모는 추가만 한다 (C4). 마지막 버전이 지금 값이다.

export type NewRecordDraft = Omit<RecordDraft, "id" | "createdAt">;
export type NewRecordMemo = Omit<RecordMemo, "id" | "createdAt">;

export interface WritingRepo {
  /** 영역·학년도·학생으로 초안 버전 전체 (오래된 것부터) */
  listRecordDrafts(filter: { area: RecordArea; year: number; studentIds: string[] }): Promise<RecordDraft[]>;
  addRecordDraft(r: NewRecordDraft): Promise<RecordDraft>;
  /** scope = "행발" | "자율·자치" | "동아리" | "진로" | "세특:<과목ID>" */
  listRecordMemos(scope: string, studentIds: string[]): Promise<RecordMemo[]>;
  addRecordMemo(r: NewRecordMemo): Promise<RecordMemo>;
}

// ---------- 데모 ----------

interface WritingStore {
  drafts: RecordDraft[];
  memos: RecordMemo[];
}
const g = globalThis as unknown as { __schswriting?: WritingStore };

function seed(): WritingStore {
  const y = schoolYear();
  const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
  // 공용 데모 누가기록에 예시 몇 건을 더한다 (박지훈 반 자율·진로, 이서연 과학탐구반 동아리)
  const s = store();
  if (!s.logs.some((l) => l.id.startsWith("lw-"))) {
    const L: [string, ActivityLog["area"], string, string, string | null, string, string][] = [
      ["lw-1", "자율·자치", "s-1", "t-homeroom", null, "2026-09-12", "학급 자치회의에서 교실 정리 당번 규칙을 제안하고 투표 결과를 정리해 게시함."],
      ["lw-2", "자율·자치", "s-1", "t-homeroom", null, "2026-10-02", "체육대회 반 응원 도구 디자인을 맡아 친구들의 의견을 모아 시안 3개를 만듦."],
      ["lw-3", "진로", "s-1", "t-homeroom", null, "2026-09-25", "디자인 학과 탐방 후 제품 디자인과 산업 디자인의 차이를 보고서로 정리함."],
      ["lw-4", "자율·자치", "s-6", "t-homeroom", null, "2026-09-12", "학급 도서 정리 담당으로 대출 기록표를 만들어 꾸준히 관리함."],
      ["lw-5", "진로", "s-6", "t-homeroom", null, "2026-10-08", "진로 탐색 주간에 간호사 직업 인터뷰를 준비하며 질문지를 직접 작성함."],
      ["lw-6", "자율·자치", "s-7", "t-homeroom", null, "2026-10-02", "체육대회 준비 위원으로 종목별 참가 명단을 정리하고 연습 일정을 공지함."],
      ["lw-7", "진로", "s-8", "t-homeroom", null, "2026-09-25", "공학 계열 진로 특강을 듣고 관심 있는 로봇 공학 분야의 기사를 스크랩함."],
      ["lw-8", "동아리", "s-2", "t-subject", "club-1", "2026-09-17", "빗면 마찰 실험을 설계하며 측정 조건을 바꿔 가설을 세 번 검증함."],
      ["lw-9", "동아리", "s-2", "t-subject", "club-1", "2026-10-07", "실험 결과를 그래프로 정리해 부원들 앞에서 발표하고 질문에 답함."],
      ["lw-10", "동아리", "s-3", "t-subject", "club-1", "2026-09-17", "소리 공명 장치를 직접 만들어 관 길이에 따른 변화를 측정함."],
      ["lw-11", "동아리", "s-4", "t-subject", "club-1", "2026-10-07", "탐구 주제 선정 토론에서 주변 하천 수질 조사를 제안해 모둠 주제로 채택됨."],
    ];
    s.logs.push(...L.map(([id, area, studentId, authorId, clubId, date, content], i) => ({ id, area, studentId, authorId, clubId, date, content, createdAt: ago(30 - i) })));
  }
  const memos: RecordMemo[] = [
    { id: "m-1", scope: "행발", studentId: "s-1", authorId: "t-homeroom", content: "책임감 강함, 친구 의견 경청, 학급 행사 디자인 도맡음, 처음엔 발표 긴장 → 2학기 자신감", createdAt: ago(5) },
    { id: "m-2", scope: "행발", studentId: "s-6", authorId: "t-homeroom", content: "차분하고 꼼꼼함, 도서 정리 꾸준, 어려운 친구 먼저 도와줌", createdAt: ago(4) },
    { id: "m-3", scope: "행발", studentId: "s-7", authorId: "t-homeroom", content: "리더십, 체육대회 준비 위원, 갈등 조정 잘함", createdAt: ago(3) },
    { id: "m-4", scope: "행발", studentId: "s-8", authorId: "t-homeroom", content: "말수 적지만 맡은 일 끝까지 함, 수학·과학 질문 많음", createdAt: ago(2) },
  ];
  const drafts: RecordDraft[] = [
    {
      id: "rd-1", area: "행발", studentId: "s-6", authorId: "t-homeroom", year: y, semester: null, unit: "bytes", max: 900, status: "draft",
      content: "차분하고 꼼꼼한 성격으로 학급 도서 정리를 맡아 대출 기록표를 만들어 한 학기 동안 꾸준히 관리함. 어려움을 겪는 친구에게 먼저 다가가 도움을 주는 배려심이 돋보임.",
      createdAt: ago(1),
    },
  ];
  return { drafts, memos };
}

function ws(): WritingStore {
  if (!g.__schswriting) g.__schswriting = seed();
  return g.__schswriting;
}

// 데모에서는 처음 불러올 때 예시 누가기록이 공용 저장소에 들어가도록 (누가기록 화면에서도 보이게)
if (isDemo) ws();

const byTime = <T extends { createdAt: string }>(a: T, b: T) => a.createdAt.localeCompare(b.createdAt);

export const demoWriting: WritingRepo = {
  async listRecordDrafts({ area, year, studentIds }) {
    const set = new Set(studentIds);
    return ws().drafts.filter((r) => r.area === area && r.year === year && set.has(r.studentId)).sort(byTime);
  },
  async addRecordDraft(r) {
    const row: RecordDraft = { ...r, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    ws().drafts.push(row);
    return row;
  },
  async listRecordMemos(scope, studentIds) {
    const set = new Set(studentIds);
    return ws().memos.filter((m) => m.scope === scope && set.has(m.studentId)).sort(byTime);
  },
  async addRecordMemo(r) {
    const row: RecordMemo = { ...r, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    ws().memos.push(row);
    return row;
  },
};

// ---------- Supabase ----------

type DraftRow = {
  id: string; area: RecordArea; student_id: string; author_id: string; year: number; semester: 1 | 2 | null;
  content: string; unit: RecordDraft["unit"]; max_len: number; status: RecordDraft["status"]; created_at: string;
};
type MemoRow = { id: string; scope: string; student_id: string; author_id: string; content: string; created_at: string };

const toDraft = (r: DraftRow): RecordDraft => ({
  id: r.id, area: r.area, studentId: r.student_id, authorId: r.author_id, year: r.year, semester: r.semester,
  content: r.content, unit: r.unit, max: r.max_len, status: r.status, createdAt: r.created_at,
});
const toMemo = (r: MemoRow): RecordMemo => ({ id: r.id, scope: r.scope, studentId: r.student_id, authorId: r.author_id, content: r.content, createdAt: r.created_at });

export const supabaseWriting: WritingRepo = {
  async listRecordDrafts({ area, year, studentIds }) {
    const ids = studentIds.filter(isUuid);
    if (!ids.length) return [];
    const r = await selectIn<DraftRow>(ids, (part) => db().from("record_drafts").select("*").eq("area", area).eq("year", year).in("student_id", part).order("created_at"),
      (a, b) => a.created_at.localeCompare(b.created_at));
    return r.map(toDraft);
  },
  async addRecordDraft(x) {
    const r = check(await db().from("record_drafts").insert({
      area: x.area, student_id: x.studentId, author_id: x.authorId, year: x.year, semester: x.semester,
      content: x.content, unit: x.unit, max_len: x.max, status: x.status,
    }).select("*").single());
    return toDraft(r as DraftRow);
  },
  async listRecordMemos(scope, studentIds) {
    const ids = studentIds.filter(isUuid);
    if (!ids.length) return [];
    const r = await selectIn<MemoRow>(ids, (part) => db().from("record_memos").select("*").eq("scope", scope).in("student_id", part).order("created_at"),
      (a, b) => a.created_at.localeCompare(b.created_at));
    return r.map(toMemo);
  },
  async addRecordMemo(x) {
    const r = check(await db().from("record_memos").insert({ scope: x.scope, student_id: x.studentId, author_id: x.authorId, content: x.content }).select("*").single());
    return toMemo(r as MemoRow);
  },
};
