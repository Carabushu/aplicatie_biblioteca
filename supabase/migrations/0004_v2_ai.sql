-- V2: jurnal apeluri AI (limită zilnică + costuri) și lecturi școlare

create table if not exists ai_calls (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  mode          text not null,                 -- shelf | cover | school_list
  member_id     uuid references members(id) on delete set null,
  model         text,
  input_tokens  int,
  output_tokens int,
  ms            int,
  ok            boolean
);
create index if not exists ai_calls_created_idx on ai_calls (created_at);

create table if not exists school_lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                   -- ex. „Lecturi clasa a VII-a, 2026–2027”
  member_id   uuid references members(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists school_list_items (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references school_lists(id) on delete cascade,
  title       text not null,
  author      text,
  book_id     uuid references books(id) on delete set null,   -- potrivirea găsită în bibliotecă
  sort_order  int not null default 0
);

alter table ai_calls          enable row level security;
alter table school_lists      enable row level security;
alter table school_list_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ai_calls','school_lists','school_list_items'] loop
    execute format('drop policy if exists family_all on %I', t);
    execute format('create policy family_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Cât am consumat luna aceasta (orientativ; prețurile reale sunt în consola Anthropic)
create or replace view ai_usage_month as
  select date_trunc('month', created_at) as luna, mode, count(*) as apeluri,
         sum(input_tokens) as tokens_in, sum(output_tokens) as tokens_out
  from ai_calls group by 1, 2 order by 1 desc, 2;

-- Locație nouă: cărți luate la birou
insert into rooms (name, sort_order) values ('La serviciu', 6) on conflict (name) do nothing;
