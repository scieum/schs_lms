-- 루브릭 채점 수행평가 (Figma N72, 2026-10-24): 수행평가에 종류 · 루브릭을 더하고, 학생마다 판정(AI 제안 · 확정)을 쌓는다. 0038 다음에 실행.
-- 답안 파일은 저장하지 않는다. 판정은 고치지 않고 새 줄로 더한다(C4) — 화면은 학생마다 가장 최근 줄을 쓴다.
-- 확정하면 "조각으로 남길 글"이 record_memos(scope '세특:<과목>#수행:<수행평가 id>')에 더해진다.
alter table course_assessments add column if not exists kind text not null default 'summary' check (kind in ('summary', 'rubric'));
alter table course_assessments add column if not exists rubric jsonb;

create table if not exists assessment_grades (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references course_assessments(id),
  student_id uuid not null references students(id),
  teacher_id uuid not null references teachers(id),
  picks jsonb not null,                 -- [{ criterionId, level, reason }]
  total integer not null check (total >= 0),
  status text not null check (status in ('ai', 'confirmed')),
  reading text not null default '' check (char_length(reading) <= 1200),
  piece text not null default '' check (char_length(piece) <= 600),
  created_at timestamptz not null default now()
);
create index if not exists assessment_grades_assessment_idx on assessment_grades (assessment_id, student_id, created_at desc);
alter table assessment_grades enable row level security;
grant select, insert on assessment_grades to service_role;
