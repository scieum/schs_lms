-- 조각 지우기 권한 고침 (2026-11-03 "permission denied for table record_memos"). 0040 다음에 실행.
-- 0034 는 deleted_at 칸만 더하고 서버(service_role)에 고칠 권한을 안 줬다.
-- deleted_at 칸만 고칠 수 있게 한다 — 조각 글은 그대로 추가만 (C4).
grant update (deleted_at) on record_memos, activity_logs to service_role;
