-- 역량 보기 결과 저장 (Figma N56): 같은 학생 · 같은 글이면 AI를 다시 부르지 않는다. 0028 다음에 실행.
-- text_hash = 한 문단으로 붙인 글의 sha256. 글을 고치면 해시가 바뀌어 새로 나눈다. 규칙(자동) 결과는 넣지 않는다.
create table if not exists competency_tags (
  student_id uuid not null references students(id) on delete cascade,
  text_hash text not null,
  tags jsonb not null,           -- [{ text, competency, sub }]
  saved_at timestamptz not null default now(),
  primary key (student_id, text_hash)
);
alter table competency_tags enable row level security;
grant select, insert, update, delete on competency_tags to service_role;
