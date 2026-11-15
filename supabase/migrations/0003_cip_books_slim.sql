-- Reduce spațiul ocupat de cip_books: renunțăm la coloanele utile doar la depanare și la indexul pe autor.
-- (Căutarea după autor funcționează în continuare, prin search_cip, doar puțin mai lent.)
alter table cip_books drop column if exists statement;
alter table cip_books drop column if exists cip;
alter table cip_books drop column if exists issue;
drop index if exists cip_books_author_trgm;

-- Decizie (15 nov 2026, măsurat pe date reale): indexul trigram pe titlu RĂMÂNE.
-- Fără el, search_cip durează ~10 s (f_unaccent evaluat pe 400k rânduri); cu el, sub 50 ms. Costă ~50 MB.
-- Dacă a fost șters, se recreează cu:
-- create index cip_books_title_trgm on cip_books using gin (lower(f_unaccent(title)) gin_trgm_ops);
