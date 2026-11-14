-- Biblioteca de acasă — schema V1
-- Rulează acest fișier în Supabase: SQL Editor → New query → Run

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- unaccent() nu e IMMUTABLE, deci nu poate intra într-un index; îl învelim.
create or replace function f_unaccent(text) returns text
language sql immutable parallel safe strict as $$
  select public.unaccent('public.unaccent', $1)
$$;

-- ---------- Profiluri (membrii familiei) ----------
create table if not exists members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  avatar      text not null default '🙂',
  color       text not null default '#6366f1',
  is_child    boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- Camere ----------
create table if not exists rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- Cărți ----------
create table if not exists books (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  author          text,
  publisher       text,
  year            int,
  pages           int,
  language        text default 'ro',
  isbn            text,
  cover_url       text,
  audience        text[] not null default '{copii}',   -- 'adulti' | 'copii' (poate avea ambele)
  genres          text[] not null default '{}',
  tags            text[] not null default '{}',
  min_age         int,                                   -- vârstă recomandată (de la)
  series          text,
  series_volume   int,
  room_id         uuid references rooms(id) on delete set null,
  sub_location    text,                                  -- „raftul de sus”, „cutia 3”
  copies          int not null default 1,
  adults_only     boolean not null default false,        -- ascunsă pe profilurile copiilor
  notes           text,
  source          text default 'manual',                 -- manual | isbn | search | shelf_photo | cover_photo
  needs_review    boolean not null default false,        -- date completate automat, de verificat
  created_by      uuid references members(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists books_isbn_idx on books (isbn);
create index if not exists books_title_trgm on books using gin (lower(f_unaccent(title)) gin_trgm_ops);
create index if not exists books_author_trgm on books using gin (lower(f_unaccent(coalesce(author,''))) gin_trgm_ops);
create index if not exists books_room_idx on books (room_id);

-- ---------- Stare citire per membru ----------
create table if not exists reading_status (
  book_id       uuid not null references books(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  status        text not null default 'unread',   -- unread | reading | read
  current_page  int,
  rating        int check (rating between 1 and 5),
  impression    text,
  finished_at   date,
  updated_at    timestamptz not null default now(),
  primary key (book_id, member_id)
);

-- ---------- Împrumuturi (structura pregătită, UI în V3) ----------
create table if not exists loans (
  id            uuid primary key default gen_random_uuid(),
  book_id       uuid not null references books(id) on delete cascade,
  direction     text not null default 'out',      -- out = dată cuiva | in = luată de la cineva
  person        text not null,
  loaned_at     date not null default current_date,
  remind_after_days int not null default 30,
  returned_at   date,
  created_at    timestamptz not null default now()
);
create index if not exists loans_open_idx on loans (book_id) where returned_at is null;

-- ---------- Lista de dorințe (V3) ----------
create table if not exists wishlist (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  author      text,
  isbn        text,
  note        text,
  added_by    uuid references members(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- updated_at automat ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists books_updated_at on books;
create trigger books_updated_at before update on books
  for each row execute function set_updated_at();

drop trigger if exists reading_status_updated_at on reading_status;
create trigger reading_status_updated_at before update on reading_status
  for each row execute function set_updated_at();

-- ---------- Căutare de duplicate / potrivire fuzzy ----------
-- Întoarce cărțile asemănătoare după titlu (+ autor), ignorând diacritice și majuscule.
create or replace function find_similar_books(p_title text, p_author text default null, p_limit int default 5)
returns table (id uuid, title text, author text, isbn text, cover_url text, score real)
language sql stable as $$
  select b.id, b.title, b.author, b.isbn, b.cover_url,
         (similarity(lower(f_unaccent(b.title)), lower(f_unaccent(p_title)))
          + case when p_author is null or p_author = '' then 0
                 else 0.5 * similarity(lower(f_unaccent(coalesce(b.author,''))), lower(f_unaccent(p_author))) end)::real as score
  from books b
  where similarity(lower(f_unaccent(b.title)), lower(f_unaccent(p_title))) > 0.35
  order by score desc
  limit p_limit;
$$;

-- ---------- Securitate: doar contul de familie (orice utilizator autentificat) ----------
alter table members        enable row level security;
alter table rooms          enable row level security;
alter table books          enable row level security;
alter table reading_status enable row level security;
alter table loans          enable row level security;
alter table wishlist       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['members','rooms','books','reading_status','loans','wishlist'] loop
    execute format('drop policy if exists family_all on %I', t);
    execute format('create policy family_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- Date inițiale ----------
insert into rooms (name, sort_order) values
  ('Camera Ameliei', 1), ('Camera lui Alex', 2), ('Sufragerie', 3), ('Birou', 4), ('Pod', 5)
on conflict (name) do nothing;

insert into members (name, avatar, color, is_child, sort_order)
select * from (values
  ('Ciprian', '👨', '#2563eb', false, 1),
  ('Otilia',  '👩', '#db2777', false, 2),
  ('Amelia',  '👧', '#9333ea', true,  3),
  ('Alex',    '👦', '#16a34a', true,  4)
) as v(name, avatar, color, is_child, sort_order)
where not exists (select 1 from members);
