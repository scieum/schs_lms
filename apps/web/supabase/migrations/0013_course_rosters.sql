-- 이동반 명단: 2·3학년 선택 과목은 반이 섞이므로 교사·과목마다 수강 학생 목록을 둔다.
-- 비어 있으면 앱은 예전처럼 teacher_courses.classes(반) 기준으로 학생을 정한다.
create table if not exists course_rosters (
  teacher_id uuid not null references teachers(id),
  course_id uuid not null references school_courses(id),
  student_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (teacher_id, course_id)
);
alter table course_rosters enable row level security;
grant select, insert, update, delete on course_rosters to service_role;
