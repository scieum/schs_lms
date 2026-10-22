-- 문의 게시판 (도구, 2026-10-22): 선생님이 묻고 관리자가 답한 글을 쌓아 둔다 + 처음 문답 2개(코드 SEED_QNA 와 같은 글). 0034 다음에 실행.
-- 지우기는 deleted_at 만 채운다(C4). 처음 문답은 author_id 가 비어 있다. 학생 이름 · 학번은 올리기 전에 막는다.
create table if not exists qna_posts (
  id text primary key,
  category text not null check (category in ('조각 · 글 짓기', '수업 · 명단', '나이스', '특색활동', '계정 · 기타')),
  title text not null check (char_length(title) between 2 and 80),
  question text not null check (char_length(question) between 5 and 2000),
  answer text check (answer is null or char_length(answer) between 2 and 4000),
  author_id uuid references teachers(id),
  author_name text not null,
  answered_by text,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  deleted_at timestamptz
);
alter table qna_posts enable row level security;
grant select, insert, update, delete on qna_posts to service_role;

insert into qna_posts (id, category, title, question, answer, author_id, author_name, answered_by, created_at, answered_at) values
  ('qna-piece-delete', '조각 · 글 짓기', '조각을 잘못 남겼는데 지울 수 있나요?',
   '조각 모으기에서 테스트용으로 하나 적어 봤는데, 조각 삭제 기능은 없나요?',
   '네, 지울 수 있어요. 내가 쓴 조각만 지워져요.

· 조각 모으기 오른쪽 "최근 조각" 줄 끝의 휴지통을 누르면 지워져요. 여러 학생에게 한 번에 남긴 조각이면 그 학생들 것이 모두 지워져요.
· 글 짓기 왼쪽 조각 칸에서도 내가 쓴 조각에는 휴지통이 있어요.
· 동아리 · 담임 누가기록도 같아요.

지운 조각은 화면과 글 짓기에서 빠지고, 기록은 남겨 둬요(나중에 근거가 바뀌지 않게). 다른 선생님이 쓴 조각은 지울 수 없어요.',
   null, '선생님 문의', '교육과정부', '2026-10-22T03:00:00.000Z', '2026-10-22T03:00:00.000Z'),
  ('qna-piece-shared', '조각 · 글 짓기', '다른 선생님이 쓴 조각도 제 화면에 보이나요?',
   '다른 선생님 아이디로 미적분Ⅰ 한 학생에게 조각을 작성했다면, 제 아이디의 미적분Ⅰ 그 학생에게도 조각이 보이는 구조인가요?',
   '네, 같은 과목 · 같은 학생이면 보여요. 조각은 선생님마다가 아니라 "과목 + 학생"에 붙어요.

· 다만 조각은 자기가 맡은 반 · 분반 학생에게만 쓸 수 있어요. 그래서 서로 보이는 건 같은 과목을 같은 반 · 분반으로 함께 맡은 경우(공동 수업 · 담당 바뀜)나 관리자 계정으로 쓴 경우뿐이에요.
· 조각 모으기 오른쪽 "최근 조각"에는 내가 쓴 것만 나와요. 글 짓기 조각 칸과 학생 칸의 조각 수에는 함께 맡은 선생님 조각도 들어가요.
· 내가 쓴 조각에만 휴지통(지우기)이 보여요.',
   null, '선생님 문의', '교육과정부', '2026-10-22T03:01:00.000Z', '2026-10-22T03:01:00.000Z')
on conflict (id) do nothing;
