import "server-only";
import { isDemo } from "./env";
import { db } from "./repo/supabase";

// 관리 현황 "DB 업데이트 확인": supabase/migrations 의 SQL 마다 그 SQL 이 만든 표 · 열 하나를 읽어 보고, 없으면 "아직 안 넣음".
// 새 SQL 을 만들면 여기에도 한 줄 더한다 (apps/CLAUDE.md 실행 순서와 같은 번호).

type Probe = { no: string; label: string; table: string; column?: string; where?: [string, string] };

const PROBES: Probe[] = [
  { no: "0001", label: "처음 표", table: "accounts", column: "id" },
  { no: "0002", label: "서버 권한", table: "teachers", column: "id" },
  { no: "0003", label: "편제표 · 세특", table: "school_courses", column: "id" },
  { no: "0004", label: "동아리 · 누가기록 · 봉사", table: "club_members", column: "club_id" },
  { no: "0005", label: "학생 성별 · 계열", table: "students", column: "track" },
  { no: "0006", label: "프로그램 · 초안", table: "survey_responses", column: "id" },
  { no: "0007", label: "성적 · 야자", table: "mock_scores", column: "id" },
  { no: "0008", label: "상담 · 지난 기록", table: "past_records", column: "id" },
  { no: "0009", label: "관리 · 과목 개설", table: "accounts", column: "last_login_at" },
  { no: "0010", label: "창체 · 행발 글", table: "record_memos", column: "id" },
  { no: "0011", label: "프로그램 함께 맡기", table: "programs", column: "co_owner_ids" },
  { no: "0012", label: "봉사 기간", table: "service_records", column: "end_date" },
  { no: "0013", label: "이동반 명단", table: "course_rosters", column: "course_id" },
  { no: "0014", label: "학사일정", table: "school_events", column: "id" },
  { no: "0015", label: "학사일정 휴업일 · 부서", table: "school_events", column: "holiday" },
  { no: "0016", label: "이동반 분반", table: "teacher_courses", column: "sections" },
  { no: "0017", label: "노션 일정 연결", table: "app_state", column: "key" },
  { no: "0018", label: "내 정보 설정", table: "account_prefs", column: "account_id" },
  { no: "0019", label: "공통 활동", table: "common_activity_pieces", column: "id" },
  { no: "0020", label: "문장 보관함 · 성취수준", table: "achievement_levels", column: "student_id" },
  { no: "0021", label: "자료 보존", table: "retention_holds", column: "id" },
  { no: "0022", label: "AI 원안 · 근거", table: "ai_originals", column: "id" },
  { no: "0023", label: "프로그램 교사 메모", table: "programs", column: "use_memos" },
  { no: "0024", label: "반 전체 쓰기 잠금", table: "class_write_locks", column: "scope" },
  { no: "0025", label: "차시별 활동", table: "lesson_plan_items", column: "id" },
  { no: "0026", label: "외부 생기부 글", table: "draft_versions", column: "origin_note" },
  { no: "0027", label: "메뉴 순서", table: "account_prefs", column: "menu_layout" },
  { no: "0028", label: "공동교육과정", table: "school_courses", column: "joint" },
  { no: "0029", label: "역량 결과 저장", table: "competency_tags", column: "student_id" },
  { no: "0030", label: "생기부 팁", table: "tips_posts", column: "id" },
  { no: "0031", label: "내 스타일", table: "writing_styles", column: "teacher_id" },
  { no: "0032", label: "생기부 팁 서술어 글 고침", table: "tips_posts", column: "id", where: ["title", "서술어 세 단계 — LV1 · LV2 · LV3"] },
  { no: "0033", label: "수행평가", table: "course_assessments", column: "id" },
  { no: "0034", label: "조각 지우기", table: "record_memos", column: "deleted_at" },
  { no: "0035", label: "문의 게시판", table: "qna_posts", column: "id" },
  { no: "0036", label: "프롬프트 보관함", table: "prompt_stars", column: "account_id" },
  { no: "0037", label: "문의 AI 답 초안", table: "qna_posts", column: "draft_answer" },
  { no: "0038", label: "협업방", table: "collab_items", column: "id" },
  { no: "0039", label: "루브릭 채점", table: "assessment_grades", column: "id" },
];

export type DbStatus = { demo: true } | { demo: false; missing: { no: string; label: string; why: string }[]; total: number };

export async function dbStatus(): Promise<DbStatus> {
  if (isDemo) return { demo: true };
  const results = await Promise.all(PROBES.map(async (p) => {
    let q = db().from(p.table).select(p.column ?? "*", { count: "exact", head: true });
    if (p.where) q = q.eq(p.where[0], p.where[1]);
    const { error, count } = await q;
    if (error) return { no: p.no, label: p.label, why: /permission/i.test(error.message) ? "권한 없음" : "표 · 열 없음" };
    if (p.where && !count) return { no: p.no, label: p.label, why: "내용 고침 안 됨" };
    return null;
  }));
  // 0002(권한)가 빠지면 모든 표가 권한 없음으로 나오므로 그때는 0002 하나만 알린다
  const missing = results.filter((x): x is NonNullable<typeof x> => !!x);
  const perm = missing.filter((m) => m.why === "권한 없음");
  return { demo: false, missing: perm.length > 5 ? [{ no: "0002", label: "서버 권한", why: "권한 없음" }] : missing, total: PROBES.length };
}
