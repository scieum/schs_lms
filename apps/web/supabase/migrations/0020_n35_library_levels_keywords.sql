-- N35 문장 보관함 · 성취수준 · 행발 키워드 메뉴판 (Figma N35, docs/design-system.md). 0019 다음에 실행.
-- 모든 표 RLS 켬 + 정책 없음 — 앱은 서버에서 service role 로만 읽고 쓴다.

-- 문장 보관함 (교사 개인): 본문에서 고른 문장 · AI 결과를 이름·학번을 지우고 저장한다.
-- 학생 id·이름·학번 열은 두지 않는다 (subject 는 세특 과목명만).
create table if not exists sentence_library (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references accounts(id) on delete cascade,
  area text not null check (area in ('세특', '창체', '행발', '동아리')),
  subject text,
  text text not null check (char_length(text) between 2 and 600),
  tags text[] not null default '{}',             -- 최대 5개 · 12자 (서버에서 자름)
  source text not null default 'body' check (source in ('body', 'variant', 'soften', 'fix', 'draft')),
  use_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sentence_library_owner on sentence_library (owner_id, created_at desc);

-- 세특 성취수준 (학생마다 A~E 또는 상·중·하). AI 초안의 말투만 바꾼다 — 수준 글자는 글에 넣지 않는다
create table if not exists achievement_levels (
  course_id text not null,
  student_id uuid not null references students(id),
  school_year int not null,
  semester int not null,
  level text not null check (level in ('A', 'B', 'C', 'D', 'E', '상', '중', '하')),
  author_id uuid references accounts(id),
  updated_at timestamptz not null default now(),
  primary key (course_id, student_id, school_year, semester)
);

-- 행발 키워드 메뉴판 (교사마다 따로): { groups: { id, label, items: { id, label, custom?, hidden? }[] }[] }
create table if not exists behavior_keywords (
  owner_id uuid primary key references accounts(id) on delete cascade,
  menu jsonb not null,
  updated_at timestamptz not null default now()
);

-- 학생별 고른 키워드 · 에피소드 메모 (라벨 그대로 저장 — 메뉴판이 바뀌어도 고른 말은 남음)
create table if not exists behavior_picks (
  student_id uuid not null references students(id),
  school_year int not null,
  owner_id uuid references accounts(id),
  keywords text[] not null default '{}',
  memo text not null default '' check (char_length(memo) <= 600),
  use_logs boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (student_id, school_year)
);

alter table sentence_library enable row level security;
alter table achievement_levels enable row level security;
alter table behavior_keywords enable row level security;
alter table behavior_picks enable row level security;
grant select, insert, update, delete on sentence_library to service_role;
grant select, insert, update, delete on achievement_levels to service_role;
grant select, insert, update, delete on behavior_keywords to service_role;
grant select, insert, update, delete on behavior_picks to service_role;

-- 학교 설정 성취수준 단계: app_state(0017) 키 achievement_scale = "A-E"(기본) | "상중하"
insert into app_state (key, value) values ('achievement_scale', '"A-E"'::jsonb) on conflict (key) do nothing;
