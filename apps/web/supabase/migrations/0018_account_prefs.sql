-- 내 정보 · 설정 (Figma N14): 프로필 사진(256px 정사각 이미지, data URL)과 숨긴 메뉴(사이드바 주소 목록). 0017 다음에 실행.
create table if not exists account_prefs (
  account_id uuid primary key references accounts(id) on delete cascade,
  avatar text,                                   -- data:image/webp;base64,... (브라우저에서 256px 로 줄여 보냄, 약 20KB)
  hidden_menus text[] not null default '{}',     -- 숨긴 메뉴 href (예: /teacher/joint). 주소로는 여전히 들어갈 수 있다
  updated_at timestamptz not null default now()
);
alter table account_prefs enable row level security;
grant select, insert, update, delete on account_prefs to service_role;
