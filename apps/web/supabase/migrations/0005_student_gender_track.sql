-- 학생 등록: 생년월일 대신 성별·계열 (2026-10-16). 계열은 속초고 기준 1로 통일, 비우면 1.

alter table students add column gender text check (gender in ('남', '여'));
alter table students add column track int not null default 1 check (track between 1 and 9);
alter table students alter column birth_date drop not null;

create or replace function register_students(rows jsonb)
returns setof students
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  new_id uuid;
begin
  for r in select * from jsonb_array_elements(rows) loop
    insert into accounts (kind, login_id, password_hash, must_change_password)
    values ('student', r->>'student_no', r->>'password_hash', true)
    returning id into new_id;

    return query
    insert into students (id, pseudonym_id, student_no, grade, class_no, number, name, gender, track)
    values (new_id, r->>'pseudonym_id', r->>'student_no', (r->>'grade')::int, (r->>'class_no')::int,
            (r->>'number')::int, r->>'name', r->>'gender', coalesce((r->>'track')::int, 1))
    returning *;
  end loop;
end;
$$;

revoke all on function register_students(jsonb) from public, anon, authenticated;
grant execute on function register_students(jsonb) to service_role;
