-- 편제표(학교 개설 과목) · 교사 교과/담당 과목 · 교과 세특 기록
-- 0001·0002 와 같은 원칙: RLS 켜고 정책 없음, 앱 서버(service_role)만 접근

create table school_courses (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  grade int not null check (grade between 1 and 3),
  semester int not null check (semester in (1, 2)),
  subject text not null,                    -- 2022 개정 과목 이름 또는 학교 지정 과목 이름
  subject_group text not null,              -- 교과(군)
  course_type text check (course_type in ('공통', '일반 선택', '진로 선택', '융합 선택')), -- null = 2022 개정 밖 과목
  credits int not null check (credits between 1 and 10),
  active boolean not null default true,     -- 지우지 않고 내린다
  created_at timestamptz not null default now()
);
create unique index school_courses_active_unique on school_courses (year, grade, semester, subject) where active;

create table teacher_groups (
  teacher_id uuid primary key references teachers(id),
  groups text[] not null default '{}'
);

create table teacher_courses (
  teacher_id uuid not null references teachers(id),
  course_id uuid not null references school_courses(id),
  classes int[] not null default '{}',
  primary key (teacher_id, course_id)
);

-- 세특은 추가만 한다 (C4): 고칠 때마다 새 줄, 마지막 줄이 현재 내용
create table setuk_records (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references school_courses(id),
  student_id uuid not null references students(id),
  author_id uuid not null references accounts(id),
  content text not null,
  unit text not null check (unit in ('bytes', 'chars')),
  max_len int not null check (max_len > 0),
  status text not null check (status in ('draft', 'confirmed')),
  created_at timestamptz not null default now()
);
create index setuk_records_course_student on setuk_records (course_id, student_id, created_at desc);

alter table school_courses enable row level security;
alter table teacher_groups enable row level security;
alter table teacher_courses enable row level security;
alter table setuk_records enable row level security;

grant select, insert, update on school_courses, teacher_groups to service_role;
grant select, insert, delete on teacher_courses to service_role;
grant select, insert on setuk_records to service_role;
revoke all on school_courses, teacher_groups, teacher_courses, setuk_records from anon, authenticated;
