-- 앱 서버(service role)에만 권한을 준다.
-- 프로젝트에서 "새 테이블 자동 공개"를 끈 경우 service_role 도 권한이 없으므로 명시한다.
-- anon/authenticated 에는 아무 권한도 주지 않는다 (RLS 정책도 없음).

grant usage on schema public to service_role;
grant select, insert, update on accounts, teachers, students to service_role;
-- 감사 로그는 추가·읽기만 (C4)
grant select, insert on audit_logs to service_role;
grant execute on function register_students(jsonb) to service_role;

revoke all on accounts, teachers, students, audit_logs from anon, authenticated;
