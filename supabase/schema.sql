-- 냉장고뱅크 공유 DB — Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run.
-- 구조: 집(household) 하나에 구성원 여러 명, 재료·할인 기록은 집 단위로 공유.

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null default '우리집',
  join_code text unique not null default substr(md5(random()::text), 1, 8),
  created_at timestamptz not null default now()
);

create table if not exists members (
  household_id uuid not null references households on delete cascade,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text,
  primary key (household_id, user_id)
);

-- 재료(kind='item')·직접 입력한 할인(kind='deal') 을 한 테이블에 JSON 으로 저장
create table if not exists fb_records (
  id text primary key,
  household_id uuid not null references households on delete cascade,
  kind text not null check (kind in ('item', 'deal')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists fb_records_household on fb_records (household_id);

-- 내가 속한 집인지 (RLS 재귀를 피하려고 security definer)
create or replace function is_member(h uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from members where household_id = h and user_id = auth.uid());
$$;

alter table households enable row level security;
alter table members enable row level security;
alter table fb_records enable row level security;

drop policy if exists "household read" on households;
create policy "household read" on households for select using (is_member(id));

drop policy if exists "members read" on members;
create policy "members read" on members for select using (is_member(household_id));
drop policy if exists "members rename self" on members;
create policy "members rename self" on members for update using (user_id = auth.uid());

drop policy if exists "records all" on fb_records;
create policy "records all" on fb_records for all
  using (is_member(household_id)) with check (is_member(household_id));

-- 새 집 만들기 → 만든 사람이 첫 구성원
create or replace function create_household(p_name text, p_member text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into households (name) values (coalesce(nullif(p_name, ''), '우리집')) returning id into h;
  insert into members (household_id, user_id, name) values (h, auth.uid(), p_member);
  return h;
end $$;

-- 참여 코드로 들어가기
create or replace function join_household(p_code text, p_member text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into h from households where join_code = lower(trim(p_code));
  if h is null then raise exception '참여 코드가 맞지 않습니다'; end if;
  insert into members (household_id, user_id, name) values (h, auth.uid(), p_member)
    on conflict (household_id, user_id) do update set name = excluded.name;
  return h;
end $$;

-- 실시간 동기화
do $$ begin
  alter publication supabase_realtime add table fb_records;
exception when duplicate_object then null; end $$;
