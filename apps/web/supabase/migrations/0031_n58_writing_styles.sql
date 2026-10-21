-- 내 스타일 (Figma N58): 교사가 영역(세특 · 창체 · 행발)마다 저장하는 내 프롬프트 + 레퍼런스 생기부(최대 3개). 0030 다음에 실행.
-- 레퍼런스에는 학생 이름 · 학번을 넣지 않는다(저장 전 검사). AI에는 구조 · 문장 길이 · 서술어 참고로만 보낸다.
create table if not exists writing_styles (
  teacher_id uuid not null references teachers(id) on delete cascade,
  area text not null check (area in ('세특', '창체', '행발')),
  prompt text not null default '' check (char_length(prompt) <= 2000),
  refs text[] not null default '{}' check (cardinality(refs) <= 3),
  updated_at timestamptz not null default now(),
  primary key (teacher_id, area)
);
alter table writing_styles enable row level security;
grant select, insert, update, delete on writing_styles to service_role;
