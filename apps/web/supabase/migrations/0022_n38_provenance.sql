-- N38 문장 근거 · AI 원안 기록 · 맞춤법 (Figma N38, docs/design-system.md). 0021 다음에 실행.
-- 모든 표 RLS 켬 + 정책 없음 — 앱은 서버에서 service role 로만 읽고 쓴다.

-- AI 원안: AI가 처음 만든 글을 고칠 수 없게 남긴다 (추가만 · 수정·삭제 없음).
-- sentences = [{ i, start, end, sources: [{ type: 'survey'|'piece'|'log'|'file'|'common', ref, q?, page? }], own? }]
-- 인용 글은 저장하지 않는다 — ref 로 그때 읽는다. 학생은 내부 id 만 (이름·학번 없음).
create table if not exists ai_originals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('program', 'setuk_merge', 'setuk_memo', 'setuk_keyword', 'behavior_keyword', 'record')),
  student_id uuid not null references students(id),
  scope text,                                    -- 과목 id · 프로그램 id · 영역
  content text not null,
  sentences jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists ai_originals_student on ai_originals (student_id, created_at desc);

alter table ai_originals enable row level security;
revoke all on ai_originals from anon, authenticated;
grant select, insert on ai_originals to service_role;

-- 고칠 수 없음: service role 이라도 바꾸거나 지우면 예외
create or replace function ai_originals_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'ai_originals 는 고치거나 지울 수 없어요 (AI 원안 보존)';
end;
$$;
drop trigger if exists ai_originals_no_change on ai_originals;
create trigger ai_originals_no_change before update or delete on ai_originals
  for each row execute function ai_originals_immutable();

-- 기록 버전마다: 이어 붙인 AI 원안 · 지금 글 기준 문장 근거 · 확정 때 수정 비율 · 적게 고친 채 확정한 까닭(60자)
-- 마이그레이션 전 글은 ai_original_id = null → 근거·원안 비교·수정 칩 없음
alter table setuk_records add column if not exists ai_original_id uuid references ai_originals(id);
alter table setuk_records add column if not exists sentence_sources jsonb;
alter table setuk_records add column if not exists edit_ratio smallint check (edit_ratio between 0 and 100);
alter table setuk_records add column if not exists low_edit_reason text check (char_length(low_edit_reason) <= 60);

alter table record_drafts add column if not exists ai_original_id uuid references ai_originals(id);
alter table record_drafts add column if not exists sentence_sources jsonb;
alter table record_drafts add column if not exists edit_ratio smallint check (edit_ratio between 0 and 100);
alter table record_drafts add column if not exists low_edit_reason text check (char_length(low_edit_reason) <= 60);

alter table draft_versions add column if not exists ai_original_id uuid references ai_originals(id);
alter table draft_versions add column if not exists sentence_sources jsonb;
alter table draft_versions add column if not exists edit_ratio smallint check (edit_ratio between 0 and 100);
alter table draft_versions add column if not exists low_edit_reason text check (char_length(low_edit_reason) <= 60);

-- 학교 설정 (관리자만 바꿈): 확정 전에 한 번 더 묻는 수정 비율 기준(%) · 문장 맞추기 어절 겹침 기준
insert into app_state (key, value) values ('edit_ratio_min', '10'::jsonb) on conflict (key) do nothing;
insert into app_state (key, value) values ('source_match_min', '0.5'::jsonb) on conflict (key) do nothing;
