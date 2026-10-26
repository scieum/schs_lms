-- 예시 답안 채점 (Figma N80, 2026-10-27): 답이 있는 루브릭 수행평가에 교사가 예시 답안을 넣으면
-- AI가 학생 답안과 맞춰 보고 맞은 점 · 빠진 점을 근거로 수준을 제안한다. 학생에게는 보이지 않는다. 0039 다음에 실행.
alter table course_assessments add column if not exists model_answer text not null default '' check (char_length(model_answer) <= 4000);
