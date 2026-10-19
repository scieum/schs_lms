-- N41 프로그램 교사 메모 (Figma N41, docs/design-system.md). 0022 다음에 실행.
-- 프로그램 초안 근거에 "교사 메모"를 더한다: 설문·서류와 함께(use_memos) 또는 메모만(source = 'memo').
-- 메모 글은 새 표 없이 record_memos 에 scope '프로그램:<program id>' 로 남긴다 (추가만 — 최신 한 건이 지금 메모, 0010 그대로 RLS 켬 · 정책 없음).
-- AI에는 이름·학번을 가린 글만 가명ID와 함께 보낸다. 감사 기록에는 학생 수만 남긴다.

alter table programs drop constraint if exists programs_source_check;
alter table programs add constraint programs_source_check check (source in ('survey', 'docs', 'both', 'memo'));
alter table programs add column if not exists use_memos boolean not null default false;

-- AI 원안 문장 근거에 'memo' 종류가 생긴다 (ai_originals.sentences jsonb — 스키마 변경 없음)
