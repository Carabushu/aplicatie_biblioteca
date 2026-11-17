-- V3-D: data nașterii pe profil, ca „Ce citesc în continuare?” să respecte vârsta minimă a cărților.
-- Idempotent. Se completează din aplicație: Setări → „Vârsta copiilor”.
alter table members add column if not exists birth_date date;
