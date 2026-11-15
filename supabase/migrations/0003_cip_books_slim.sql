-- Reduce spațiul ocupat de cip_books: renunțăm la coloanele utile doar la depanare și la indexul pe autor.
-- (Căutarea după autor funcționează în continuare, prin search_cip, doar puțin mai lent.)
alter table cip_books drop column if exists statement;
alter table cip_books drop column if exists cip;
alter table cip_books drop column if exists issue;
drop index if exists cip_books_author_trgm;
