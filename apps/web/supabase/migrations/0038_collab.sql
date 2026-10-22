-- 협업방 (Figma N69, 2026-10-22): 사이드바 대분류 "협업". 누구나 방을 만들고 선생님을 초대(교과 · 학년 무관). 0037 다음에 실행.
-- 올리는 것 = 메모 · 수행평가 · 차시 · 프롬프트 · 자료(링크 · 글). 지우기는 deleted_at 만 채운다(C4). 학생 이름 · 학번은 올리기 전에 막는다.
create table if not exists collab_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  intro text not null default '' check (char_length(intro) <= 200),
  owner_id uuid not null references teachers(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists collab_members (
  room_id uuid not null references collab_rooms(id),
  teacher_id uuid not null references teachers(id),
  joined_at timestamptz not null default now(),
  primary key (room_id, teacher_id)
);
create table if not exists collab_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references collab_rooms(id),
  kind text not null check (kind in ('메모', '수행평가', '차시', '프롬프트', '자료')),
  title text not null check (char_length(title) between 2 and 80),
  body text not null default '' check (char_length(body) <= 4000),
  meta jsonb not null default '{}'::jsonb,
  author_id uuid references teachers(id),
  author_name text not null,
  editor_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists collab_members_teacher on collab_members(teacher_id);
create index if not exists collab_items_room on collab_items(room_id) where deleted_at is null;
alter table collab_rooms enable row level security;
alter table collab_members enable row level security;
alter table collab_items enable row level security;
grant select, insert, update, delete on collab_rooms, collab_members, collab_items to service_role;
