-- 노션 학사일정 자동 연결: 노션 페이지 id 로 앱 일정을 맞추고, 마지막 동기화 결과를 남긴다. 0015 다음에 실행.
alter table school_events add column if not exists notion_id text;
create unique index if not exists school_events_notion_id on school_events (notion_id) where notion_id is not null;

create table if not exists app_state (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table app_state enable row level security;
grant select, insert, update, delete on app_state to service_role;
