-- V3-B: lista de dorințe — câmpuri în plus ca „Am cumpărat-o” să pre-completeze cartea.
-- Idempotent: se poate rula de mai multe ori.
-- `added_by` = profilul a cărui dorință este (un părinte poate adăuga și pentru un copil).

alter table wishlist add column if not exists publisher text;
alter table wishlist add column if not exists year      int;
alter table wishlist add column if not exists cover_url text;
alter table wishlist add column if not exists source    text default 'manual';  -- manual | catalog | scan | have_it | school_list

create index if not exists wishlist_added_by_idx on wishlist (added_by);

-- politica family_all există deja pe wishlist (0001); o reafirmăm pentru siguranță
alter table wishlist enable row level security;
drop policy if exists family_all on wishlist;
create policy family_all on wishlist for all to authenticated using (true) with check (true);
