-- AI 기록 쓰기: 창체 특기사항(자율·자치/동아리/진로)·행발(행동특성 및 종합의견) 초안과 교사 관찰 메모
-- 0001~0004 와 같은 원칙: RLS 켜고 정책 없음, 앱 서버(service_role)만 접근. 고칠 때마다 새 버전을 추가한다 (C4)

create table record_drafts (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('자율·자치', '동아리', '진로', '행발')),
  student_id uuid not null references students(id),
  author_id uuid not null references accounts(id),
  year int not null,
  semester int check (semester in (1, 2)),
  content text not null,
  unit text not null check (unit in ('bytes', 'chars')),
  max_len int not null check (max_len > 0),
  status text not null check (status in ('draft', 'confirmed')),
  created_at timestamptz not null default now()
);
create index record_drafts_area_student on record_drafts (area, year, student_id, created_at desc);

-- 교사 관찰 메모(행발 키워드, 세특 관찰 메모 등). scope = '행발' | '자율·자치' | '동아리' | '진로' | '세특:<과목 id>'
create table record_memos (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  student_id uuid not null references students(id),
  author_id uuid not null references accounts(id),
  content text not null,
  created_at timestamptz not null default now()
);
create index record_memos_scope_student on record_memos (scope, student_id, created_at desc);

alter table record_drafts enable row level security;
alter table record_memos enable row level security;

grant select, insert on record_drafts, record_memos to service_role;
revoke all on record_drafts, record_memos from anon, authenticated;
