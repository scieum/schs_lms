-- 프롬프트 보관함 (도구, 2026-10-22): 과목별 공식 프롬프트(관리자) · 선생님 공유 프롬프트 · ★ 별. 0035 다음에 실행.
-- 지우기는 deleted_at 만 채운다(C4). 별은 계정마다 한 번(다시 누르면 뺌). 학생 이름 · 학번은 올리기 전에 막는다.
create table if not exists prompt_docs (
  id text primary key,
  official boolean not null default false,
  public boolean not null default false,
  area text not null check (area in ('세특', '창체', '행발')),
  subject text check (subject is null or char_length(subject) <= 30),
  title text not null check (char_length(title) between 2 and 60),
  body text not null check (char_length(body) between 10 and 8000),
  author_id uuid references teachers(id),
  author_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists prompt_stars (
  prompt_id text not null references prompt_docs(id),
  account_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (prompt_id, account_id)
);
alter table prompt_docs enable row level security;
alter table prompt_stars enable row level security;
grant select, insert, update, delete on prompt_docs to service_role;
grant select, insert, update, delete on prompt_stars to service_role;
