-- 프로그램 담당 교사 여러 명: 등록한 교사(owner_id) + 함께 맡는 교사(co_owner_ids)
alter table programs add column if not exists co_owner_ids uuid[] not null default '{}';
create index if not exists programs_co_owners on programs using gin (co_owner_ids);
