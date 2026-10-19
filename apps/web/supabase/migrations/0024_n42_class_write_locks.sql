-- N42 반 전체 글 쓰기: 같은 학생을 두 탭이 동시에 AI로 쓰지 않게 하는 잠금 (서버리스라 메모리 잠금을 못 씀).
-- 학생 × 범위(세특 과목·분반 / 영역·동아리) 한 줄. 시작할 때 upsert(만료 3분), 끝나면 지운다. 다른 run_id 가 살아 있으면 "이미 쓰는 중"으로 건너뛴다.
-- 이름·학번·글은 두지 않는다 (내부 id 만). RLS 켜고 정책 없음 — 서버가 service role 로만 읽고 쓴다.

create table if not exists class_write_locks (
  student_id uuid not null references students(id) on delete cascade,
  scope text not null check (char_length(scope) between 1 and 120),
  run_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (student_id, scope)
);

create index if not exists class_write_locks_expires on class_write_locks (expires_at);

alter table class_write_locks enable row level security;
grant select, insert, update, delete on class_write_locks to service_role;

-- 봉사 활동내용 고침 (N42 ④ "바꾸고 확인"): 확인서 파일은 그대로 두고 activity 칸만 바꾼다 — 새 칸 없음.
