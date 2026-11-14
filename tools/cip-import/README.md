# Import CIP → catalog local de ISBN-uri românești

Google Books și Open Library au puține cărți românești. Biblioteca Națională publică lunar, ca PDF,
**Bibliografia cărților în curs de apariție (CIP)**: fiecare carte tipărită legal în România, cu autor,
titlu, editură, an, ISBN și clasificare. Acest script descarcă toate numerele (1998–prezent),
le parsează și produce un CSV pe care îl încarci în tabelul `cip_books` din Supabase.
După aceea, scanarea unui ISBN românesc găsește cartea instant, fără internet extern.

## Pași (o singură dată, pe laptop)

1. În Supabase → SQL Editor rulează `supabase/migrations/0002_cip_books.sql`.
2. În acest folder:
   ```bash
   npm install
   node index.mjs --from 2005        # ~250 PDF-uri, ~15–30 min (descărcare + parsare); cache în ./cache
   ```
   Poți începe cu `--only 2023-12` ca test, sau `--from 2015` dacă vrei mai repede.
   La final: `out/cip_books.csv` și `out/report.json` (statistici per număr; un număr cu puține intrări e semnalat).
3. Încărcare în Supabase (loturi de 1000, upsert pe ISBN — se poate rula de câte ori vrei):
   ```powershell
   $env:SUPABASE_URL="https://xxx.supabase.co"
   $env:SUPABASE_ANON_KEY="sb_publishable_..."
   $env:FAMILY_EMAIL="emailul contului familiei"
   $env:FAMILY_PASSWORD="parola"
   node upload.mjs
   ```
   (`npm install @supabase/supabase-js` în acest folder dacă lipsește.)

## Actualizare lunară

Rulezi din nou `node index.mjs --from <anul curent>` și `node upload.mjs`. PDF-urile deja descărcate nu se refac.

## Ce știe și ce nu știe CIP

- Descrierea e făcută **înainte de tipărire**, din datele editurii: titlul final poate diferi ușor, numărul de pagini lipsește.
- Copertă nu există; aplicația o caută în continuare în Open Library/Google după ISBN.
- `audience` e dedus din clasificare (`087.5`, `821.x-93` → copii) — corect în marea majoritate a cazurilor, dar nu perfect.
- Câteva înregistrări pe mie au `needs_review = true` (format neobișnuit); în aplicație apar cu „De verificat”.
