-- 어떤 migrations 를 아직 안 넣었는지 확인 (읽기만 함 · 데이터 바꾸지 않음).
-- Supabase SQL Editor 에 붙여 실행 → "안 넣음" 줄의 번호 SQL 을 migrations 폴더에서 차례로 실행.
-- 앱 관리 현황 "DB 업데이트 확인"(src/lib/server/db-status.ts)과 같은 기준.
with probe(no, label, tbl, col) as (values
  ('0001', '처음 표', 'accounts', 'id'),
  ('0003', '편제표 · 세특', 'school_courses', 'id'),
  ('0004', '동아리 · 누가기록 · 봉사', 'club_members', 'club_id'),
  ('0005', '학생 성별 · 계열', 'students', 'track'),
  ('0006', '프로그램 · 초안', 'survey_responses', 'id'),
  ('0007', '성적 · 야자', 'mock_scores', 'id'),
  ('0008', '상담 · 지난 기록', 'past_records', 'id'),
  ('0009', '관리 · 과목 개설', 'accounts', 'last_login_at'),
  ('0010', '창체 · 행발 글', 'record_memos', 'id'),
  ('0011', '프로그램 함께 맡기', 'programs', 'co_owner_ids'),
  ('0012', '봉사 기간', 'service_records', 'end_date'),
  ('0013', '이동반 명단', 'course_rosters', 'course_id'),
  ('0014', '학사일정', 'school_events', 'id'),
  ('0015', '학사일정 휴업일 · 부서', 'school_events', 'holiday'),
  ('0016', '이동반 분반', 'teacher_courses', 'sections'),
  ('0017', '노션 일정 연결', 'app_state', 'key'),
  ('0018', '내 정보 설정', 'account_prefs', 'account_id'),
  ('0019', '공통 활동', 'common_activity_pieces', 'id'),
  ('0020', '문장 보관함 · 성취수준 · 행발 키워드', 'behavior_picks', 'student_id'),
  ('0021', '자료 보존', 'retention_holds', 'id'),
  ('0022', 'AI 원안 · 근거', 'ai_originals', 'id'),
  ('0023', '프로그램 교사 메모', 'programs', 'use_memos'),
  ('0024', '반 전체 쓰기 잠금', 'class_write_locks', 'scope'),
  ('0025', '차시별 활동', 'lesson_plan_items', 'id'),
  ('0026', '외부 생기부 글', 'draft_versions', 'origin_note'),
  ('0027', '메뉴 순서', 'account_prefs', 'menu_layout'),
  ('0028', '공동교육과정', 'school_courses', 'joint'),
  ('0029', '역량 결과 저장', 'competency_tags', 'student_id'),
  ('0030', '생기부 팁', 'tips_posts', 'id'),
  ('0031', '내 스타일', 'writing_styles', 'teacher_id'),
  ('0033', '수행평가', 'course_assessments', 'id'),
  ('0034', '조각 지우기', 'record_memos', 'deleted_at'),
  ('0035', '문의 게시판', 'qna_posts', 'id'),
  ('0036', '프롬프트 보관함', 'prompt_stars', 'account_id'),
  ('0037', '문의 AI 답 초안', 'qna_posts', 'draft_answer'),
  ('0038', '협업방', 'collab_items', 'id')
)
select p.no, p.label,
  case when c.column_name is null then '안 넣음' else '들어감' end as 상태
from probe p
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = p.tbl and c.column_name = p.col
union all
-- 0002 서버 권한: service_role 이 teachers 를 읽을 수 있나
select '0002', '서버 권한',
  case when has_table_privilege('service_role', 'public.teachers', 'select') then '들어감' else '안 넣음' end
where to_regclass('public.teachers') is not null
union all
-- 0032 는 표가 아니라 팁 글 고침: 0030 이 있을 때만 본다
select '0032', '생기부 팁 서술어 글 고침',
  case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tips_posts')
    -- 표가 없을 때도 이 쿼리가 깨지지 않게 글자로 된 쿼리를 그때만 돌린다
    then (case when (xpath('/row/c/text()', query_to_xml($q$select count(*) as c from public.tips_posts where title = '서술어 세 단계 — LV1 · LV2 · LV3'$q$, false, true, '')))[1]::text::int > 0 then '들어감' else '안 넣음' end)
    else '안 넣음 (0030 먼저)' end
order by 1;
