-- Reduce spațiul ocupat de cip_books: renunțăm la coloanele utile doar la depanare.
alter table cip_books drop column if exists statement;
alter table cip_books drop column if exists cip;
alter table cip_books drop column if exists issue;

-- Indexurile trigram pe titlu ȘI pe autor RĂMÂN (măsurat pe 403k rânduri, instanță gratuită):
--   fără indexul pe titlu: search_cip ~10 s; cu indexul pe titlu dar fără cel pe autor: tot ~12 s
--   (OR-ul din search_cip forțează Seq Scan dacă oricare parte nu are index); cu ambele: ~0,2 s (BitmapOr).
-- Cost total: tabel 69 MB + titlu 50 MB + autor ~15 MB + ISBN 18 MB ≈ 150 MB din 500 MB.
create index if not exists cip_books_title_trgm  on cip_books using gin (lower(f_unaccent(title)) gin_trgm_ops);
create index if not exists cip_books_author_trgm on cip_books using gin (lower(f_unaccent(coalesce(author,''))) gin_trgm_ops);
analyze cip_books;
