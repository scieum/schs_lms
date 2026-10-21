-- 메뉴 순서 바꾸기 (Figma N53): 내가 바꾼 사이드바 순서. [{ "label": "업무", "items": ["/schedule", ...] }, ...]. 0026 다음에 실행.
-- 비어 있으면(null) 처음 순서. 홈은 늘 맨 위라 넣지 않는다.
alter table account_prefs add column if not exists menu_layout jsonb;
