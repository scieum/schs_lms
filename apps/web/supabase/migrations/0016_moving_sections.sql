-- 이동반 분반: 선택과목은 고정반(학생 등록의 반) 대신 분반마다 나이스 명단으로 학생을 정한다.
-- teacher_courses: mode('fixed'|'moving') + sections(분반 이름). course_rosters: 분반(section)마다 한 줄. 0013 다음에 실행.
alter table teacher_courses add column if not exists mode text not null default 'fixed' check (mode in ('fixed', 'moving'));
alter table teacher_courses add column if not exists sections text[] not null default '{}';
grant update on teacher_courses to service_role;

alter table course_rosters add column if not exists section text not null default '';
alter table course_rosters drop constraint if exists course_rosters_pkey;
alter table course_rosters add primary key (teacher_id, course_id, section);
