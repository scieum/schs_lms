-- 프로그램 · 설문 · 제출 서류 · 생기부 초안 파이프라인 (PRD F2·F3)
-- 0001~0004 와 같은 원칙: RLS 켜고 정책 없음, 앱 서버(service_role)만 접근

create table programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references teachers(id),
  title text not null,
  subject text,
  area text not null check (area in ('세특', '창체-자율', '창체-동아리', '창체-진로')),
  unit text not null default 'bytes' check (unit in ('bytes', 'chars')),
  max_len int not null check (max_len > 0),
  start_date date not null,
  end_date date not null,
  source text not null default 'survey' check (source in ('survey', 'docs', 'both')),
  request_docs boolean not null default false,
  doc_kinds text[] not null default '{}',
  questions jsonb not null default '[]',         -- 고정 4 + 추가 0~2
  target_ids uuid[] not null default '{}',        -- 대상 학생
  overview text not null default '',
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index programs_owner on programs (owner_id, created_at desc);
create index programs_targets on programs using gin (target_ids);

-- 설문 응답: 학생당 하나 (임시 저장 → 제출). 생기부 기록이 아니라 근거 입력이다
create table survey_responses (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id),
  student_id uuid not null references students(id),
  answers jsonb not null default '{}',
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (program_id, student_id)
);

-- 제출 서류 (교사 업로드·학생 제출·합본 나누기 결과). 파일은 Storage(program-docs, 비공개)
create table program_materials (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id),
  student_id uuid references students(id),
  file_name text not null,
  mime text not null,
  size bigint not null,
  pages int,
  file_path text not null,
  status text not null check (status in ('matched', 'needs_review', 'bundle', 'split_done')),
  matched_by text check (matched_by in ('studentNo', 'name', 'manual', 'ai', 'split', 'student')),
  text text,                                      -- 서류에서 읽은 글 (이름·학번 가린 뒤 저장)
  uploader_id uuid not null references accounts(id),
  created_at timestamptz not null default now()
);
create index program_materials_program on program_materials (program_id, created_at desc);
create index program_materials_student on program_materials (student_id);

-- 미제출 사유
create table program_missing (
  program_id uuid not null references programs(id),
  student_id uuid not null references students(id),
  reason text not null,
  set_by uuid not null references accounts(id),
  set_at timestamptz not null default now(),
  primary key (program_id, student_id)
);

-- 초안 생성 작업: PENDING → RUNNING → DONE / ERROR (최대 3회 재시도)
create table draft_jobs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id),
  student_id uuid not null references students(id),
  state text not null default 'PENDING' check (state in ('PENDING', 'RUNNING', 'DONE', 'ERROR')),
  attempts int not null default 0,
  error text,
  unit text not null default 'bytes' check (unit in ('bytes', 'chars')),
  max_len int not null check (max_len > 0),
  manual_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, student_id)
);
create index draft_jobs_state on draft_jobs (state);

-- 초안 버전: 추가만 한다 (C4). draft 초안 · finalized 확정(교사만) · rejected 반려(사유 필수)
create table draft_versions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references draft_jobs(id),
  program_id uuid not null references programs(id),
  student_id uuid not null references students(id),
  content text not null,
  status text not null check (status in ('draft', 'finalized', 'rejected')),
  reason text,
  source text not null check (source in ('ai', 'sample', 'manual')),
  author_id uuid references accounts(id),         -- null = AI
  created_at timestamptz not null default now(),
  check (status <> 'rejected' or (reason is not null and length(trim(reason)) > 0)),
  check (status <> 'finalized' or author_id is not null)
);
create index draft_versions_job on draft_versions (job_id, created_at);
create index draft_versions_student on draft_versions (student_id, created_at);

-- 미응답 독촉 등 학생 앱 알림 기록 (실제 발송 채널은 아직 없다)
create table program_reminders (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id),
  student_ids uuid[] not null,
  message text not null,
  sender_id uuid not null references accounts(id),
  created_at timestamptz not null default now()
);
create index program_reminders_students on program_reminders using gin (student_ids);

alter table programs enable row level security;
alter table survey_responses enable row level security;
alter table program_materials enable row level security;
alter table program_missing enable row level security;
alter table draft_jobs enable row level security;
alter table draft_versions enable row level security;
alter table program_reminders enable row level security;

grant select, insert, update on programs to service_role;
grant select, insert, update on survey_responses to service_role;
grant select, insert, update on program_materials to service_role;
grant select, insert, update, delete on program_missing to service_role;
grant select, insert, update on draft_jobs to service_role;
grant select, insert on draft_versions to service_role;          -- 추가만 (C4)
grant select, insert on program_reminders to service_role;
revoke all on programs, survey_responses, program_materials, program_missing, draft_jobs, draft_versions, program_reminders from anon, authenticated;

insert into storage.buckets (id, name, public) values ('program-docs', 'program-docs', false)
on conflict (id) do nothing;
