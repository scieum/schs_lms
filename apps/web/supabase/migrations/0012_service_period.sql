-- 봉사 기간: 시작일(date) + 마감일(end_date). 당일 봉사는 둘이 같다.
-- 기간 봉사는 한 확인서에 24시간이 넘을 수 있어 상한을 200시간으로 올린다.
alter table service_records add column if not exists end_date date;
update service_records set end_date = date where end_date is null;
alter table service_records alter column end_date set not null;
alter table service_records drop constraint if exists service_records_hours_check;
alter table service_records add constraint service_records_hours_check check (hours > 0 and hours <= 200);
alter table service_records drop constraint if exists service_records_period_check;
alter table service_records add constraint service_records_period_check check (end_date >= date);
