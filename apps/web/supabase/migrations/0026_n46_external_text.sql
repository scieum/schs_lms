-- N46 프로그램 · 외부 생기부 글 직접 넣기 (Figma N46, docs/design-system.md). 0025 다음에 실행.
-- 기관·외부 강사가 보낸 완성된 생기부 글을 교사가 그대로 넣는다: 학생마다 "직접 넣기" 또는 외부글_양식.xlsx 로 한꺼번에.
-- 넣은 글은 draft_versions 에 새 행으로 추가 (source = 'external', ai_original_id 없음 → N38 수정 비율·적게 고친 확정 확인 없음).
-- 자동 확정 없음 · AI 호출 없음. 감사 기록에는 숫자만 남긴다. 새 표 없음 (RLS 는 0006 그대로 켬 · 정책 없음).

-- 초안 버전 출처에 'external' (외부 글 직접 넣기)
alter table draft_versions drop constraint if exists draft_versions_source_check;
alter table draft_versions add constraint draft_versions_source_check check (source in ('ai', 'sample', 'manual', 'external'));

-- 출처 메모 (선택 · 60자): "○○대학교 연계 프로그램 제공" 처럼 교사만 보는 글. 기록 본문에는 들어가지 않는다
alter table draft_versions add column if not exists origin_note text check (char_length(origin_note) <= 60);

-- 프로그램 근거에 '외부 글' (혼자만): 학생 화면에 설문·제출 칸이 열리지 않고 AI 초안을 만들지 않는다
alter table programs drop constraint if exists programs_source_check;
alter table programs add constraint programs_source_check check (source in ('survey', 'docs', 'both', 'memo', 'external'));
