-- 성적(모의고사·내신) · 수능 최저 기준·목표 대학 · 야간 자율학습
-- 원칙: RLS 켜고 정책 없음, 앱 서버(service_role)만 접근. 성적·출석·감사 성격의 기록은 추가만(C4).
-- 모의고사 과목은 공통과목 그대로: 국어·수학·영어·한국사·탐구1(통합사회)·탐구2(통합과학), 등급 1~9.

create table exams (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null check (month between 1 and 12),
  name text not null,
  created_at timestamptz not null default now(),
  unique (year, month)
);

-- 같은 시험을 다시 올리면 새 행을 더한다. 읽을 때 학생·시험별 가장 최근 행을 쓴다
create table mock_scores (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id),
  student_id uuid not null references students(id),
  ko smallint check (ko between 1 and 9),
  ma smallint check (ma between 1 and 9),
  en smallint check (en between 1 and 9),
  hi smallint check (hi between 1 and 9),
  t1 smallint check (t1 between 1 and 9),
  t2 smallint check (t2 between 1 and 9),
  uploaded_by uuid references accounts(id),
  created_at timestamptz not null default now()
);
create index mock_scores_lookup on mock_scores (student_id, exam_id, created_at desc);

create table school_grades (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  grade int not null check (grade between 1 and 3),
  semester int not null check (semester in (1, 2)),
  ko smallint check (ko between 1 and 9),
  ma smallint check (ma between 1 and 9),
  en smallint check (en between 1 and 9),
  average numeric(3, 2) not null,
  created_at timestamptz not null default now()
);
create index school_grades_student on school_grades (student_id, grade, semester, created_at desc);

-- 대학별 최저 기준. 지우지 않고 active=false 로 내린다
create table min_rules (
  id uuid primary key default gen_random_uuid(),
  university text not null,
  major text not null,
  pool text[] not null,
  pick int not null,
  max_sum numeric(4, 1) not null,
  required text[] not null default '{}',
  history_max int,
  inquiry text not null default 'best' check (inquiry in ('best', 'avg', 'avgFloor')),
  note text,
  active boolean not null default true,
  created_by uuid references accounts(id),
  created_at timestamptz not null default now()
);

create table student_targets (
  student_id uuid not null references students(id),
  rank int not null check (rank between 1 and 3),
  university text not null,
  major text not null,
  rule_id uuid references min_rules(id),
  updated_at timestamptz not null default now(),
  primary key (student_id, rank)
);

-- 수능 최저 상담 명단 (AI 최저 분석 → 담임 확인 후 저장). 추가만
create table min_counsel_lists (
  id uuid primary key default gen_random_uuid(),
  grade int not null,
  class_no int not null,
  exam_id uuid references exams(id),
  items jsonb not null,
  created_by uuid not null references accounts(id),
  created_at timestamptz not null default now()
);

-- 학생 공부 계획 (AI 성적 분석 → 학생이 확인 후 담기). 추가만
create table study_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  items jsonb not null,
  created_at timestamptz not null default now()
);

-- 야자 신청: 학생·날짜 하나에 한 줄. 취소는 status='취소'
create table night_signups (
  student_id uuid not null references students(id),
  date date not null,
  session text not null check (session in ('1', '2', 'both')),
  place text not null,
  status text not null default '신청' check (status in ('신청', '취소')),
  updated_at timestamptz not null default now(),
  primary key (student_id, date)
);
create index night_signups_date on night_signups (date);

create table night_attendance (
  student_id uuid not null references students(id),
  date date not null,
  period int not null check (period in (1, 2)),
  status text not null check (status in ('출석', '결석', '조퇴')),
  checked_by uuid references accounts(id),
  updated_at timestamptz not null default now(),
  primary key (student_id, date, period)
);
create index night_attendance_date on night_attendance (date);

-- 마감 뒤 신청·이번 주 변경은 담임 승인
create table night_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  dates date[] not null,
  session text not null check (session in ('1', '2', 'both')),
  place text not null,
  note text not null default '',
  status text not null default '대기' check (status in ('대기', '승인', '반려')),
  decided_by uuid references accounts(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index night_requests_status on night_requests (status, created_at);

create table night_closures (
  grade int not null,
  class_no int not null,
  date date not null,
  closed_by uuid not null references accounts(id),
  closed_at timestamptz not null default now(),
  primary key (grade, class_no, date)
);

-- 담임 → 학생 확인 메시지 (AI 출결 살펴보기 → 확인 후 보내기). 추가만
create table night_notices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  body text not null,
  created_by uuid not null references accounts(id),
  created_at timestamptz not null default now()
);
create index night_notices_student on night_notices (student_id, created_at desc);

alter table exams enable row level security;
alter table mock_scores enable row level security;
alter table school_grades enable row level security;
alter table min_rules enable row level security;
alter table student_targets enable row level security;
alter table min_counsel_lists enable row level security;
alter table study_plans enable row level security;
alter table night_signups enable row level security;
alter table night_attendance enable row level security;
alter table night_requests enable row level security;
alter table night_closures enable row level security;
alter table night_notices enable row level security;

grant select, insert on exams to service_role;
grant select, insert on mock_scores to service_role;
grant select, insert on school_grades to service_role;
grant select, insert, update on min_rules to service_role;
grant select, insert, update, delete on student_targets to service_role;
grant select, insert on min_counsel_lists to service_role;
grant select, insert on study_plans to service_role;
grant select, insert, update on night_signups to service_role;
grant select, insert, update on night_attendance to service_role;
grant select, insert, update on night_requests to service_role;
grant select, insert on night_closures to service_role;
grant select, insert on night_notices to service_role;
