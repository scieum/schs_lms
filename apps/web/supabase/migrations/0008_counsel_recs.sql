-- 상담 기록 · 지난 학년도 확정 생기부 · 정정 요청 · 추천 카탈로그 · 관심 담기
-- 같은 원칙: RLS 켜고 정책 없음, 앱 서버(service_role)만 접근. 권한 판정은 앱(domain/counsel.ts)이 한다.

-- 상담 기록: 추가만 한다 (C4). 고칠 때는 prev_id 로 이전 버전을 가리키는 새 행을 넣는다
create table counsel_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  author_id uuid not null references accounts(id),
  area text not null check (area in ('진로', '학습', '생활')),
  date date not null,
  content text not null check (length(content) between 1 and 2000),
  prev_id uuid references counsel_records(id),
  created_at timestamptz not null default now()
);
create index counsel_records_student on counsel_records (student_id, date desc);
create index counsel_records_author on counsel_records (author_id, date desc);

-- 학년도가 끝나 확정된 생기부 (학생은 지난 학년도 것만 본다, C5). 추가만 한다 (C4)
create table past_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  year int not null,
  grade int not null check (grade between 1 and 3),
  area text not null check (area in ('자율활동', '동아리활동', '진로활동', '교과세특')),
  title text not null,
  content text not null,
  teacher_name text not null,
  confirmed_at date not null,
  created_at timestamptz not null default now()
);
create index past_records_student on past_records (student_id, year);

-- 학생의 정정 요청 → 담임이 본다 (고치는 것은 담임이 나이스에서)
create table record_corrections (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  -- past_records.id 또는 'setuk:<세특 id>' (확정 세특에서 온 기록)
  record_id text not null,
  reason text not null check (length(reason) between 5 and 500),
  status text not null default 'requested' check (status in ('requested', 'done')),
  created_at timestamptz not null default now()
);
create index record_corrections_student on record_corrections (student_id, created_at desc);

-- 추천 카탈로그: 교사·관리자가 넣는다. 지우지 않고 active=false 로 내린다
create table rec_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('도서', '대회', '활동', '진로')),
  title text not null,
  meta text not null default '',
  careers text[] not null default '{}',
  created_by uuid not null references accounts(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 학생이 담은 추천 (카탈로그 항목 또는 확인한 AI 추천)
create table rec_interests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id),
  item_id uuid references rec_items(id),
  kind text not null check (kind in ('도서', '대회', '활동', '진로')),
  title text not null,
  meta text not null default '',
  source text not null check (source in ('catalog', 'ai')),
  created_at timestamptz not null default now()
);
create unique index rec_interests_item on rec_interests (student_id, item_id) where item_id is not null;
create index rec_interests_student on rec_interests (student_id, created_at desc);

alter table counsel_records enable row level security;
alter table past_records enable row level security;
alter table record_corrections enable row level security;
alter table rec_items enable row level security;
alter table rec_interests enable row level security;

-- 상담 기록·확정본·정정 요청은 추가만 (update/delete 권한 없음)
grant select, insert on counsel_records to service_role;
grant select, insert on past_records to service_role;
grant select, insert, update on record_corrections to service_role;
grant select, insert, update on rec_items to service_role;
grant select, insert, delete on rec_interests to service_role;
revoke all on counsel_records, past_records, record_corrections, rec_items, rec_interests from anon, authenticated;
