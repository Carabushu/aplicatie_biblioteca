-- Catalog local de ISBN-uri românești, construit din Bibliografia CIP (BNaR).
-- Se umple cu tools/cip-import (vezi README-ul de acolo).

create table if not exists cip_books (
  isbn           text primary key,
  title          text not null,
  author         text,
  statement      text,            -- mențiunea de responsabilitate (autori, traducători, ilustratori)
  publisher      text,
  place          text,
  year           int,
  edition        text,
  udc            text,            -- clasificarea zecimală universală (087.5 = carte pentru copii)
  audience       text,            -- 'copii' | 'adulti' (dedus din UDC)
  series         text,
  series_volume  int,
  cip            text,            -- numărul descrierii CIP
  issue          text,            -- numărul bibliografiei (aaaa-ll)
  needs_review   boolean not null default false
);

create index if not exists cip_books_title_trgm on cip_books using gin (lower(f_unaccent(title)) gin_trgm_ops);
create index if not exists cip_books_author_trgm on cip_books using gin (lower(f_unaccent(coalesce(author,''))) gin_trgm_ops);

alter table cip_books enable row level security;
drop policy if exists family_all on cip_books;
create policy family_all on cip_books for all to authenticated using (true) with check (true);

-- Căutare după titlu/autor în catalogul CIP (ignoră diacriticele).
create or replace function search_cip(p_q text, p_limit int default 15)
returns setof cip_books language sql stable as $$
  select c.*
  from cip_books c
  where lower(f_unaccent(c.title)) like '%' || lower(f_unaccent(p_q)) || '%'
     or lower(f_unaccent(coalesce(c.author,''))) like '%' || lower(f_unaccent(p_q)) || '%'
  order by (lower(f_unaccent(c.title)) like lower(f_unaccent(p_q)) || '%') desc, c.year desc nulls last
  limit p_limit;
$$;
