-- N43 차시별 활동 메뉴 (Figma N43 ②, docs/design-system.md). 0023 다음에 실행 (0024 는 N42 몫으로 비워 둠 — 순서 상관없음).
-- 분반 · 동아리 · 담임 반(자율·자치 · 진로)마다 수업 계획 하나: 차시 · 날짜 · 활동명 · 활동 내용. 학생 정보는 없다.
-- 학생 메모 칸의 차시 칩으로 남긴 메모는 기존 표에 그대로 쌓고(세특 record_memos · 창체 activity_logs) 차시 연결만 둔다.
-- 계획이나 차시를 지워도 남긴 메모는 남는다 (연결만 끊김 · on delete set null).
-- 기재요령 인용 모음(N43 ①)은 저장소 JSON 이라 표가 없다.

create table if not exists lesson_plans (
  id uuid primary key default gen_random_uuid(),
  school_year int not null,
  scope_kind text not null check (scope_kind in ('offering', 'club', 'homeroom')),
  -- 공통 활동과 같은 범위 글: "세특:<courseId>[:<분반>]" · "동아리:<clubId>" · "자율·자치:2-3" · "진로:2-3"
  scope_id text not null,
  title text not null default '',
  source text not null check (source in ('excel', 'doc')),
  file_name text,
  created_by uuid not null references accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_year, scope_kind, scope_id)
);

create table if not exists lesson_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references lesson_plans(id) on delete cascade,
  no int not null check (no between 1 and 999),
  date date,
  title text not null check (char_length(title) between 1 and 40),
  detail text not null default '',
  position int not null default 0
);
create index if not exists lesson_plan_items_plan on lesson_plan_items (plan_id, position);

-- 차시 메모: 세특은 record_memos(scope '세특:<courseId>#차시'), 창체는 activity_logs. 남길 날짜 = 차시 날짜(없으면 오늘)
alter table record_memos add column if not exists lesson_item_id uuid references lesson_plan_items(id) on delete set null;
alter table record_memos add column if not exists date date;
alter table activity_logs add column if not exists lesson_item_id uuid references lesson_plan_items(id) on delete set null;
-- 공통 활동(N26)도 차시에 이어 둘 수 있다 ("차시에서 고르기" · "공통 활동으로 만들기")
alter table common_activities add column if not exists lesson_item_id uuid references lesson_plan_items(id) on delete set null;
create index if not exists record_memos_lesson on record_memos (lesson_item_id) where lesson_item_id is not null;
create index if not exists activity_logs_lesson on activity_logs (lesson_item_id) where lesson_item_id is not null;

alter table lesson_plans enable row level security;
alter table lesson_plan_items enable row level security;
grant select, insert, update, delete on lesson_plans, lesson_plan_items to service_role;
revoke all on lesson_plans, lesson_plan_items from anon, authenticated;

-- "여러 학생에게" 되돌리기(5초): 방금 만든 차시 메모만 지운다 (서버가 lesson_item_id 있음 · 같은 교사 · 10분 안을 확인)
grant delete on record_memos, activity_logs to service_role;
