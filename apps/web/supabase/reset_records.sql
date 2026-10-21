-- 기록 비우기 (2026-10-22 "학생 · 교사 정보를 제외한 데이터들은 모두 지우고 공유할 수 있는 깨끗한 형태로").
-- ⚠ 되돌릴 수 없다. 실행 전에 Supabase 대시보드 Database → Backups 에서 백업이 있는지 확인한다.
--
-- 남기는 것: accounts · teachers · students(계정 · 학생 · 교사), school_courses · teacher_groups · teacher_courses · course_rosters(편제표 · 수업 배정 · 분반 명단),
--           clubs · club_members(동아리 명단), school_events(학사일정), app_state · retention_settings(학교 설정), tips_posts(생기부 팁),
--           exams · min_rules · rec_items · offering_rounds · offerings(시험 목록 · 대학 기준 · 추천 활동 · 과목 개설),
--           account_prefs · behavior_keywords · writing_styles(교사 개인 설정).
-- 지우는 것: 아래 목록 — 세특 · 창체 · 행발 글과 조각 · 누가기록 · 봉사 · 프로그램(설문 · 서류 · 초안) · 상담 · 지난 기록 · 성적 · 야자 ·
--           공통 활동 · 수행평가 · 성취수준 · 문장 보관함 · 차시 계획 · 과목 신청 · 감사 로그 · 보존 기록.
--
-- 쓰는 법: SQL Editor 에 통째로 붙여 Run. 아직 없는 표(안 넣은 SQL)는 건너뛴다.
-- CASCADE 를 쓰지 않는다 — 남기는 표가 지우는 표를 가리키면 아무것도 지우지 않고 멈춘다(안전).
-- 올린 파일(Storage 의 program-docs · service-docs 버킷)은 SQL 로 지울 수 없어 대시보드 Storage 에서 버킷을 비운다.

do $$
declare
  wipe text[] := array[
    -- 글 · 조각
    'setuk_records', 'record_drafts', 'record_memos', 'record_corrections', 'ai_originals', 'competency_tags',
    'achievement_levels', 'behavior_picks', 'sentence_library', 'class_write_locks',
    -- 누가기록 · 봉사 · 공통 활동 · 수행평가 · 차시
    'activity_logs', 'service_records', 'common_activity_pieces', 'common_activities', 'course_assessments',
    'lesson_plan_items', 'lesson_plans',
    -- 프로그램 (설문 · 서류 · 초안)
    'draft_versions', 'draft_jobs', 'program_reminders', 'program_missing', 'program_materials', 'survey_responses', 'programs',
    -- 상담 · 지난 기록 · 추천 담기
    'counsel_records', 'past_records', 'rec_interests',
    -- 성적 · 최저 · 야자 · 과목 신청
    'mock_scores', 'school_grades', 'student_targets', 'study_plans', 'min_counsel_lists',
    'night_signups', 'night_attendance', 'night_requests', 'night_closures', 'night_notices', 'offering_choices',
    -- 감사 로그 · 보존(파기) 기록
    'audit_logs', 'retention_holds', 'retention_runs'
  ];
  present text[] := '{}';
  t text;
  n bigint;
begin
  foreach t in array wipe loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      raise notice '% — %줄 지움', t, n;
      present := present || t;
    end if;
  end loop;
  if array_length(present, 1) > 0 then
    -- 한 번에 비운다 (서로 가리키는 지우는 표끼리는 함께라 괜찮다)
    execute 'truncate table ' || (select string_agg(format('public.%I', x), ', ') from unnest(present) x) || ' restart identity';
  end if;
  -- 학생 · 교사 계정의 마지막 접속 · 잠금은 처음 상태로
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'accounts' and column_name = 'last_login_at') then
    update public.accounts set last_login_at = null;
  end if;
  update public.accounts set failed_count = 0, locked_until = null;
end $$;

-- 끝난 뒤 확인: 남긴 표의 줄 수
select 'students' as 표, count(*) from public.students
union all select 'teachers', count(*) from public.teachers
union all select 'accounts', count(*) from public.accounts
union all select 'school_courses', count(*) from public.school_courses;
