-- 문의 게시판 AI 답 초안 (2026-10-22): 새 문의가 오면 사용 가이드로 쓴 답 초안을 적어 둔다(관리자만 봄, 저장해야 게시). 0036 다음에 실행.
-- 슬랙 · 카카오 알림은 환경변수(SLACK_WEBHOOK_URL · KAKAO_REST_KEY · KAKAO_REFRESH_TOKEN)로 켠다. 카카오 새 refresh 토큰은 app_state(kakao_refresh)에 적힌다.
alter table qna_posts add column if not exists draft_answer text check (draft_answer is null or char_length(draft_answer) <= 4000);
