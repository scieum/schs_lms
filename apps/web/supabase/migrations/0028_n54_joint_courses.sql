-- 공동교육과정 → 내 수업 (Figma N54): 교사가 만드는 공동교육과정 수업 + 다른 학교 수강생. 0027 다음에 실행.
-- 수업은 school_courses 한 줄(joint = 'school' 학교 간 | 'online' 온라인, owner_id = 만든 교사). 편제표 · 수강 신청에는 안 보인다.
alter table school_courses add column if not exists joint text check (joint in ('school', 'online'));
alter table school_courses add column if not exists owner_id uuid references teachers(id);
-- 같은 학기 같은 과목 막기는 편제표 과목끼리만, 공동교육과정은 만든 교사마다
drop index if exists school_courses_active_unique;
create unique index if not exists school_courses_active_unique on school_courses (year, grade, semester, subject) where active and joint is null;
create unique index if not exists school_courses_joint_unique on school_courses (owner_id, year, grade, semester, subject) where active and joint is not null;

-- 다른 학교 학생: school = 소속 학교 이름(본교는 null). 계정은 로그인 못 하게 만든다(비밀번호 칸 '!' · 잠금 9999년).
-- 학번 칸은 'joint:<id>' (본교 학번과 겹치지 않게). 명단은 course_rosters(분반 '공동')에 함께 들어간다.
alter table students add column if not exists school text;
create index if not exists students_school_idx on students (school) where school is not null;
