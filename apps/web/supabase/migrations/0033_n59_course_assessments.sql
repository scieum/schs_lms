-- 수행평가 (Figma N59): 교과 교사가 과목(분반)마다 등록. 0032 다음에 실행.
-- 학생 자료 파일은 저장하지 않는다 — AI가 읽은 요약만 record_memos(scope '세특:<과목>#수행:<수행평가 id>')에 추가된다(C4).
create table if not exists course_assessments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references school_courses(id),
  section text,                         -- 이동반 분반 (고정반이면 null)
  teacher_id uuid not null references teachers(id),
  title text not null check (char_length(title) between 2 and 40),
  date date not null,
  description text not null default '' check (char_length(description) <= 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists course_assessments_course_idx on course_assessments (course_id) where deleted_at is null;
alter table course_assessments enable row level security;
grant select, insert, update, delete on course_assessments to service_role;
