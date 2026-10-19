-- N39 자료 보존 기간 · 자동 파기 (Figma N39 ③, docs/design-system.md). 0020 다음에 실행.
-- 지우는 것: 학생이 올린 원본 파일(program-docs · service-docs Storage) · 파일에서 읽은 글(program_materials.text).
-- 지우지 않는 것: 확정한 초안(draft_versions) · 담임에게 보낸 기록 · 세특·창체·행발 기록 · 감사 로그.
-- 모든 표 RLS 켬 + 정책 없음 — 앱은 서버에서 service role 로만 읽고 쓴다 (관리자 화면 /admin/retention).

-- 보존 기간 설정: 키마다 기준(base)과 날 수(days). 숫자는 이 표에만 둔다.
--   raw_files      학생이 올린 원본 파일    기본 학기 마감 후 30일
--   extracted_text 파일에서 읽은 글         기본 학기 마감 후 90일
--   base: term_end(학기 마감 후 n일) · confirm(초안 확정 뒤 n일) · year_end(학년 말 2월 말 + n일)
create table if not exists retention_settings (
  key text primary key check (key in ('raw_files', 'extracted_text')),
  days int not null check (days between 0 and 365),
  base text not null check (base in ('term_end', 'confirm', 'year_end')),
  updated_by uuid references accounts(id),
  updated_at timestamptz not null default now()
);
insert into retention_settings (key, days, base) values ('raw_files', 30, 'term_end'), ('extracted_text', 90, 'term_end')
on conflict (key) do nothing;

-- 한 번 미루기 (자료 묶음마다 1번, 지울 날 + 30일). target = 프로그램 id 또는 'service:2026-1'(봉사 확인서 학기 묶음)
create table if not exists retention_holds (
  target text primary key,
  until date not null,
  held_by uuid references accounts(id),
  held_at timestamptz not null default now()
);

-- 파기 실행 기록 (건수만). items = [{ label: "과학 탐구 발표 · 2학기", files: 48, texts: 48 }] — 학생 이름·파일 이름 없음
create table if not exists retention_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  trigger text not null check (trigger in ('cron', 'visit', 'admin')),
  programs int not null default 0,
  files int not null default 0,
  texts int not null default 0,
  items jsonb not null default '[]'::jsonb,
  actor_id uuid references accounts(id)
);
create index if not exists retention_runs_at on retention_runs (ran_at desc);

-- 지운 자리 표시: 원본을 지우면 file_path 를 비우고 purged_at, 읽은 글을 지우면 text = null · text_purged_at
alter table program_materials alter column file_path drop not null;
alter table program_materials add column if not exists purged_at timestamptz;
alter table program_materials add column if not exists text_purged_at timestamptz;
alter table service_records alter column file_path drop not null;
alter table service_records add column if not exists purged_at timestamptz;

-- 학기 마감 날짜 (학사일정): app_state(0017) 키 term_end_1 · term_end_2 = "MM-DD" (없으면 07-31 · 01-31)
insert into app_state (key, value) values ('term_end_1', '"07-31"'::jsonb), ('term_end_2', '"01-31"'::jsonb) on conflict (key) do nothing;

alter table retention_settings enable row level security;
alter table retention_holds enable row level security;
alter table retention_runs enable row level security;
grant select, insert, update on retention_settings to service_role;
grant select, insert, update, delete on retention_holds to service_role;
grant select, insert on retention_runs to service_role;
revoke all on retention_settings, retention_holds, retention_runs from anon, authenticated;
