-- 속초고 학생관리시스템 — 1단계 스키마 (계정·교사·학생·감사 로그)
-- 모든 테이블에 RLS를 켜고 정책을 두지 않는다 → anon/authenticated 접근 차단.
-- 앱 서버만 service role 로 접근하고, 권한 판정은 앱의 lib/domain/policy.ts 가 한다.

create extension if not exists pgcrypto;

create table accounts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('student', 'teacher')),
  login_id text not null,                 -- 학생: 학번, 교사: 로그인 이름
  password_hash text not null,            -- bcrypt
  must_change_password boolean not null default true,
  failed_count int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, login_id)
);

create table teachers (
  id uuid primary key references accounts(id),
  name text not null,
  roles text[] not null default '{subject}'
    check (roles <@ array['subject', 'program', 'homeroom', 'admin']),
  homeroom_grade int,
  homeroom_class int,
  dept text,
  created_at timestamptz not null default now()
);

create table students (
  id uuid primary key references accounts(id),
  pseudonym_id text not null unique,      -- S001… AI에는 이 값만 보낸다
  student_no text not null unique,        -- 학번 (학년1 + 반2 + 번호2)
  grade int not null check (grade between 1 and 3),
  class_no int not null check (class_no between 1 and 20),
  number int not null check (number between 1 and 60),
  name text not null,
  birth_date date not null,
  career_goal text,
  created_at timestamptz not null default now()
);

-- 감사 로그는 추가만 한다 (C4)
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references accounts(id),
  action text not null,
  target text,
  at timestamptz not null default now()
);

alter table accounts enable row level security;
alter table teachers enable row level security;
alter table students enable row level security;
alter table audit_logs enable row level security;

-- 학생 여러 명을 한 트랜잭션으로 등록 (계정 + 학생 정보)
create or replace function register_students(rows jsonb)
returns setof students
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  new_id uuid;
begin
  for r in select * from jsonb_array_elements(rows) loop
    insert into accounts (kind, login_id, password_hash, must_change_password)
    values ('student', r->>'student_no', r->>'password_hash', true)
    returning id into new_id;

    return query
    insert into students (id, pseudonym_id, student_no, grade, class_no, number, name, birth_date)
    values (new_id, r->>'pseudonym_id', r->>'student_no', (r->>'grade')::int, (r->>'class_no')::int,
            (r->>'number')::int, r->>'name', (r->>'birth_date')::date)
    returning *;
  end loop;
end;
$$;

revoke all on function register_students(jsonb) from public, anon, authenticated;
