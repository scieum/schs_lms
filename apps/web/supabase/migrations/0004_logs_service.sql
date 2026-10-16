-- 동아리 · 창체 누가기록(자율·자치/동아리/진로) · 봉사활동 확인서
-- 0001~0003 과 같은 원칙: RLS 켜고 정책 없음, 앱 서버(service_role)만 접근

create table clubs (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  name text not null,
  advisor_id uuid not null references teachers(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index clubs_active_unique on clubs (year, name) where active;

create table club_members (
  club_id uuid not null references clubs(id),
  student_id uuid not null references students(id),
  primary key (club_id, student_id)
);

-- 누가기록은 추가만 한다 (C4)
create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('자율·자치', '동아리', '진로')),
  student_id uuid not null references students(id),
  author_id uuid not null references accounts(id),
  club_id uuid references clubs(id),
  date date not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index activity_logs_student on activity_logs (student_id, area, date desc);

-- 봉사 확인서: 담당 교사가 올리고 담임이 확인한다. 파일은 Storage(service-docs, 비공개)
create table service_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  uploader_id uuid not null references accounts(id),
  date date not null,
  hours numeric(4, 1) not null check (hours > 0 and hours <= 24),
  organization text not null,
  activity text not null,
  file_path text not null,
  file_name text not null,
  mime text not null,
  status text not null default 'sent' check (status in ('sent', 'confirmed')),
  confirmed_by uuid references accounts(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index service_records_student on service_records (student_id, date desc);

alter table clubs enable row level security;
alter table club_members enable row level security;
alter table activity_logs enable row level security;
alter table service_records enable row level security;

grant select, insert, update on clubs to service_role;
grant select, insert, delete on club_members to service_role;
grant select, insert on activity_logs to service_role;
grant select, insert, update on service_records to service_role;
revoke all on clubs, club_members, activity_logs, service_records from anon, authenticated;

insert into storage.buckets (id, name, public) values ('service-docs', 'service-docs', false)
on conflict (id) do nothing;
