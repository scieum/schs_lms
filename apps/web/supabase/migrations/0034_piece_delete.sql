-- 조각 지우기 (2026-10-22 "조각 삭제 기능 만들어보자"). 0033 다음에 실행.
-- 지운 조각은 없애지 않고 deleted_at 만 적는다 — 화면 · 글 짓기에서 빠지고 기록은 남는다(C4 추가만 · 지우기는 숨김).
-- 쓴 선생님 본인만 지운다(앱 서버에서 author_id 로 확인).
alter table record_memos add column if not exists deleted_at timestamptz;
alter table activity_logs add column if not exists deleted_at timestamptz;
