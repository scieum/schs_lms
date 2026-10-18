-- 공통 활동 (Figma N26): 과목(분반)·반·동아리 전체가 같이 한 활동(수행평가 등)을 한 번 등록하고,
-- 학생 자료를 한꺼번에 올려 학생마다 "[활동명] …" 조각을 만든다. 자료 파일은 저장하지 않고 만든 조각만 남긴다. 0018 다음에 실행.
create table if not exists common_activities (
  id uuid primary key default gen_random_uuid(),
  -- "세특:<courseId>" · "세특:<courseId>:<분반>" · "자율·자치:2-3" · "진로:2-3" · "행발:2-3" · "동아리:<clubId>"
  scope text not null,
  name text not null check (char_length(name) between 1 and 40),
  date date,
  description text not null default '',
  author_id uuid not null references accounts(id),
  created_at timestamptz not null default now()
);
create index if not exists common_activities_scope on common_activities (scope, created_at desc);

-- 공통 활동에서 만든 조각 (학생 상태·개수 셈). 추가만 한다 (C4). 조각 글은 record_memos(세특·행발) / activity_logs(창체)에도 들어간다
create table if not exists common_activity_pieces (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references common_activities(id) on delete cascade,
  student_id uuid not null references students(id),
  author_id uuid not null references accounts(id),
  content text not null,
  file_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists common_activity_pieces_activity on common_activity_pieces (activity_id, student_id);

-- 창체 누가기록 중 공통 활동에서 만든 것 (조각 칸 "공통 활동" 칩)
alter table activity_logs add column if not exists common_activity_id uuid references common_activities(id) on delete set null;

alter table common_activities enable row level security;
alter table common_activity_pieces enable row level security;
grant select, insert, update, delete on common_activities to service_role;
grant select, insert, update, delete on common_activity_pieces to service_role;
