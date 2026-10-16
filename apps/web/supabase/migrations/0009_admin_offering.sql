-- 교사 가입(첫 가입자 = 관리자) · 계정 관리(최근 접속) · 과목 신청(개설·학생 신청)
-- 0001·0002 와 같은 원칙: RLS 켜고 정책 없음, 앱 서버(service_role)만 접근

-- ── 계정: 최근 접속 시각 ─────────────────────────────
alter table accounts add column if not exists last_login_at timestamptz;

-- ── 교사 가입: 한 트랜잭션에서 교사 수를 세고 역할을 정한다 ──
-- 동시에 두 명이 "첫 가입"을 해도 관리자가 둘 생기지 않도록 트랜잭션 잠금을 건다.
create or replace function register_teacher(p_name text, p_password_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  new_id uuid;
  v_roles text[];
  v_dept text;
begin
  perform pg_advisory_xact_lock(hashtext('register_teacher'));
  if exists (select 1 from accounts where kind = 'teacher' and login_id = p_name) then
    raise exception 'duplicate_name';
  end if;
  select count(*) into n from teachers;
  if n = 0 then
    v_roles := array['admin', 'subject'];
    v_dept := '교육과정부';
  else
    v_roles := array['subject'];
    v_dept := null;
  end if;

  insert into accounts (kind, login_id, password_hash, must_change_password, last_login_at)
  values ('teacher', p_name, p_password_hash, false, now())
  returning id into new_id;
  insert into teachers (id, name, roles, dept) values (new_id, p_name, v_roles, v_dept);

  return jsonb_build_object('id', new_id, 'roles', to_jsonb(v_roles), 'dept', v_dept);
end;
$$;

-- ── 관리자가 교사 한 명 추가 (인증코드로 첫 로그인) ─────
create or replace function admin_create_teacher(
  p_name text, p_password_hash text, p_roles text[], p_dept text, p_homeroom_grade int, p_homeroom_class int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if exists (select 1 from accounts where kind = 'teacher' and login_id = p_name) then
    raise exception 'duplicate_name';
  end if;
  insert into accounts (kind, login_id, password_hash, must_change_password)
  values ('teacher', p_name, p_password_hash, true)
  returning id into new_id;
  insert into teachers (id, name, roles, dept, homeroom_grade, homeroom_class)
  values (new_id, p_name, p_roles, p_dept, p_homeroom_grade, p_homeroom_class);
  return new_id;
end;
$$;

-- ── 과목 신청 ─────────────────────────────────────
-- 한 학년의 한 학기 신청 묶음
create table offering_rounds (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  semester int not null check (semester in (1, 2)),
  grade int not null check (grade between 1 and 3),
  deadline date not null,
  max_credits int not null default 16 check (max_credits between 1 and 40),
  created_at timestamptz not null default now(),
  unique (year, semester, grade)
);

create table offerings (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references offering_rounds(id),
  subject text not null,
  field text not null,
  credits int not null check (credits between 1 and 10),
  capacity int not null check (capacity between 1 and 200),  -- 한 반 정원
  sections int not null default 1 check (sections between 1 and 20),
  course_id uuid references school_courses(id),
  active boolean not null default true,                     -- 지우지 않고 내린다
  created_at timestamptz not null default now()
);
create unique index offerings_active_unique on offerings (round_id, subject) where active;

-- 학생의 지금 신청 (신청할 때마다 통째로 바꾼다)
create table offering_choices (
  round_id uuid not null references offering_rounds(id),
  student_id uuid not null references students(id),
  offering_id uuid not null references offerings(id),
  created_at timestamptz not null default now(),
  primary key (student_id, offering_id)
);
create index offering_choices_offering on offering_choices (offering_id);

alter table offering_rounds enable row level security;
alter table offerings enable row level security;
alter table offering_choices enable row level security;

-- 학생 신청: 과목 행을 잠그고 자리를 다시 센 뒤 통째로 바꾼다 (동시 신청으로 정원을 넘지 않게).
-- 이미 신청해 둔 과목은 자리를 지킨다. 자리가 없으면 'full:<과목>' 예외.
create or replace function apply_offerings(p_round uuid, p_student uuid, p_offerings uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  taken int;
begin
  if (select count(*) from offerings where id = any(p_offerings) and round_id = p_round and active)
     <> (select count(distinct x) from unnest(p_offerings) as x) then
    raise exception 'unknown_offering';
  end if;

  for o in
    select * from offerings
    where id = any(p_offerings) and round_id = p_round and active
    order by id
    for update
  loop
    if not exists (select 1 from offering_choices where student_id = p_student and offering_id = o.id) then
      select count(*) into taken from offering_choices where offering_id = o.id;
      if taken >= o.capacity * o.sections then
        raise exception 'full:%', o.subject;
      end if;
    end if;
  end loop;

  delete from offering_choices where round_id = p_round and student_id = p_student;
  insert into offering_choices (round_id, student_id, offering_id)
  select distinct p_round, p_student, x from unnest(p_offerings) as x;
end;
$$;

revoke all on function register_teacher(text, text) from public, anon, authenticated;
revoke all on function admin_create_teacher(text, text, text[], text, int, int) from public, anon, authenticated;
revoke all on function apply_offerings(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function register_teacher(text, text) to service_role;
grant execute on function admin_create_teacher(text, text, text[], text, int, int) to service_role;
grant execute on function apply_offerings(uuid, uuid, uuid[]) to service_role;

grant all on offering_rounds, offerings, offering_choices to service_role;
revoke all on offering_rounds, offerings, offering_choices from anon, authenticated;
