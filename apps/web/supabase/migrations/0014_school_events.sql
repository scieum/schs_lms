-- 직접 추가한 학사일정 (교사·학생 누구나). 나이스 학사일정과 함께 보인다. 올린 사람·관리자만 고치거나 지운다(앱에서 확인).
create table if not exists school_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 60),
  start_date date not null,
  end_date date not null,
  grades int[] not null default '{}',
  memo text,
  author_id uuid not null references accounts(id),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists school_events_period on school_events (start_date, end_date);
alter table school_events enable row level security;
grant select, insert, update, delete on school_events to service_role;
