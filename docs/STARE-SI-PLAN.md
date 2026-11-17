# Biblioteca de acasă — stare curentă și plan (predare, 16 nov 2026)

Document de continuitate: tot ce s-a făcut, cum e construit, ce a rămas. Scris ca o sesiune nouă
(alt model, fără istoricul conversației) să poată continua direct.

## 1. Ce este

PWA în limba română pentru evidența cărților din casă. Utilizatori: Ciprian, Otilia, Amelia (~13 ani), Alex (10 ani).
Doar familia are acces. Android (Chrome) + laptop; fără cazuri speciale iOS. Cost de rulare zero, cu excepția
apelurilor Anthropic pentru poze (plafon 5 $/lună setat în consola Anthropic).

- Repo: https://github.com/Carabushu/aplicatie_biblioteca (branch `main`; push pe `main` → Vercel publică automat)
- Bază de date / auth / funcții: Supabase, proiect „Biblioteca” (ref `bifydakcgmwqesbagxlh`, eu-west-1, plan gratuit)
- Găzduire: Vercel (plan gratuit)

## 2. Stare: ce funcționează (confirmat de utilizator pe telefon)

| Versiune | Conținut | Stare |
|---|---|---|
| V1 | login cont de familie, profiluri stil Netflix, listă cu filtre (Copii/Adulți primul), scanare cod de bare, ISBN tastat, căutare în cataloage, adăugare manuală, alertă duplicate, camere editabile + mutare în masă, stare citire/notă/impresie per profil, „Avem cartea?”, export/import CSV, PWA, catalog offline (citire) | live |
| V1.1 | catalog local CIP (Biblioteca Națională): 402.962 ISBN-uri românești în tabelul `cip_books`; scanarea unui ISBN românesc e instantanee | live, importat |
| V2 | poză cu coperta, poză cu raftul întreg, lecturi școlare (tastate/lipite/fotografiate), camera „La serviciu” | live; funcția `analyze-image` publicată; ~39 de cărți adăugate din 2 poze de raft |

Măsurători reale: baza de date 156 MB din 500 MB (aproape tot `cip_books`); o carte în `books` ≈ 2 KB;
2 rafturi + 1 copertă ≈ 10.700 tokeni intrare + 4.200 ieșire.

## 3. Arhitectură

- **Client:** Vite + React + TypeScript strict + Tailwind v4 (`@utility` în `src/index.css`, nu `@apply` pe clase proprii) + `vite-plugin-pwa` + `supabase-js` + `react-router-dom`.
- **Server:** Supabase Postgres cu RLS pe toate tabelele (politica `family_all`: orice utilizator autentificat). Înregistrările sunt dezactivate; există un singur utilizator (contul familiei). Profilurile sunt rânduri în `members`, alese în aplicație; profilul activ stă în `localStorage`.
- **AI:** Edge Function `supabase/functions/analyze-image/index.ts` (Deno). Verifică utilizatorul în cod (`auth.getUser`), `verify_jwt = false`, limită 80 apeluri/zi (tabel `ai_calls`), moduri `shelf` / `cover` / `school_list`, model din secretul `ANTHROPIC_MODEL` (implicit `claude-haiku-5-5`). Imaginile se redimensionează pe telefon (`src/lib/ai.ts`).
- **Keep-alive:** `.github/workflows/keep-alive.yml` — ping la 3 zile pe `/rest/v1/rooms` (planul gratuit Supabase pune proiectul pe pauză după 7 zile).

### Fișiere importante
```
src/state/AppContext.tsx      sesiune, profil activ, cărți (cache localStorage), CRUD
src/lib/catalog.ts            căutare: cip_books → Google Books → Open Library; validare ISBN
src/lib/ai.ts                 redimensionare imagine + apel Edge Function
src/lib/pwa.ts                actualizare automată PWA (T1)
src/lib/loans.ts              calcule termene împrumuturi
src/lib/wishes.ts             dorințe: verificare duplicate, adăugare cu confirmări
src/lib/stats.ts              statistici și insigne pe profil (calcul la citire)
src/lib/suggest.ts            „Ce citesc în continuare?”: filtre + scor
src/lib/types.ts, constants.ts, csv.ts, text.ts
src/components/               BarcodeScanner (BarcodeDetector nativ + ZXing lazy), BookForm, BookCard, Layout, LoanPanel
src/pages/                    Login, ChooseProfile, Library, BookDetail, AddBook, HaveIt, ShelfImport, SchoolLists, Settings, Loans, Wishlist, MyProfile, WhatNext
supabase/migrations/          0001 schema · 0002 cip_books · 0003 slim + indexuri · 0004 ai_calls, school_lists, „La serviciu” · 0005 wishlist (coloane în plus) · 0006 members.birth_date
supabase/functions/analyze-image/
tools/cip-import/             import CIP (Node): index.mjs (descărcare+parsare), parse.mjs, extract.mjs, upload.mjs, README
```

### Model de date
`members`, `rooms`, `books` (public `audience[]`, genuri, etichete, serie, cameră, sub-locație, exemplare, `adults_only`, `needs_review`, `source`),
`reading_status` (carte × membru), `loans` (interfață din V3-A), `wishlist` (interfață din V3-B; `added_by` = al cui e),
`cip_books`, `ai_calls` (+ view `ai_usage_month`), `school_lists`, `school_list_items`.
Funcții SQL: `f_unaccent` (înveliș imutabil), `find_similar_books(p_title, p_author, p_limit)`, `search_cip(p_q, p_limit)`.

## 4. Lucruri învățate (de nu repetat)

- `unaccent()` nu e IMMUTABLE → în indexuri se folosește `f_unaccent`.
- `search_cip` are `OR` pe titlu și autor: **ambele** indexuri trigram trebuie să existe, altfel Seq Scan de ~10 s. Cu ambele: ~0,2 s. Nu se șterg pentru spațiu.
- Supabase folosește chei noi: *Publishable* (`sb_publishable_…`) în loc de `anon`. Variabilele se numesc tot `VITE_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY`.
- `GET /rest/v1/` (rădăcina) cere cheie secretă; ping-ul se face pe un tabel.
- WorldCat API: doar pentru biblioteci. Aleph X-Server / Z39.50 la BCU și BNaR: indisponibile public. Nu se face scraping.
- Arhiva CIP veche (`oldsite.bibnat.ro`) e moartă → scriptul ia PDF-urile din Internet Archive, verifică `%%EOF` (multe capturi sunt trunchiate). 2005, 2006, 2008 sunt scanate fără text; 2018-06 și 2018-12 lipsesc.
- Parser CIP: pagini rotite și duble (2009–2018), numerotare cu salturi, linii UDC care seamănă cu numere de intrare (`087.5`), coduri CIP greșite (`CIP 201-02332`), diacritice Mac Roman.
- PowerShell pe laptopul utilizatorului: `npm` blocat de execution policy → `npm.cmd` sau `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- PWA: fără `registerSW` explicit, telefonul arăta versiunea nouă abia la a doua deschidere; rezolvat în T1. Pe Android, o PWA redeschisă din „recente” nu navighează, deci verificarea trebuie declanșată manual (`reg.update()` pe `visibilitychange`).
- Mediul de lucru al asistentului nu ajunge la Supabase, bibnat.ro sau Deno: SQL-ul îl rulează utilizatorul în SQL Editor, iar Edge Function-ul nu a putut fi testat local (a fost confirmat de utilizator în producție).

## 5. Cum se lucrează cu utilizatorul

- Ciprian: inginer cu experiență embedded, puțină experiență web. Vrea pași numerotați, în română, cu numele exacte ale butoanelor; trimite capturi de ecran.
- Nu i se cer niciodată chei sau parole în chat. Cheile se pun de el în Vercel / GitHub Secrets / Supabase Secrets.
- Migrările SQL sunt fișiere în `supabase/migrations/`; el copiază conținutul în Supabase → SQL Editor → Run. Se scriu idempotent (`if not exists`, `on conflict do nothing`).
- Înainte de push: `npm run build` (include typecheck). După push, Vercel publică singur.
- Interfața: română, simplă, prietenoasă pentru copii; profilurile copiilor (`is_child`) nu pot edita/șterge și nu văd cărțile `adults_only`.

## 6. De făcut de către utilizator (securitate)

- [ ] Schimbă parola contului familiei (Supabase → Authentication → Users) — a apărut într-o captură pe 15 nov.
- [ ] Înlocuiește cheia Anthropic (creează una nouă în console.anthropic.com → API Keys, șterge-o pe cea veche, actualizează secretul `ANTHROPIC_API_KEY`) — a apărut într-o captură pe 16 nov.

## 7. Plan V3

Ordinea recomandată: T1 → A → B → restul. (T1, A, B, C și D livrate pe 17 nov 2026; urmează E.)

### T1. Actualizare automată a PWA — FĂCUT (17 nov 2026, de confirmat pe telefon)
`src/lib/pwa.ts`, apelat din `main.tsx`: `registerSW` din `virtual:pwa-register` (tipuri: `vite-plugin-pwa/client` în `tsconfig.app.json`).
Verifică versiune nouă la fiecare revenire în aplicație (`visibilitychange`) și din oră în oră. Când noul SW e activ:
pe `/` (lista) sau cu aplicația în fundal reîncarcă imediat; pe alte ecrane arată banner „Versiune nouă — Actualizează”
și reîncarcă singură la următoarea revenire (ca să nu piardă un formular început). `vercel.json`: `sw.js` și `index.html` fără cache.

### A. Împrumuturi — FĂCUT (17 nov 2026, de confirmat pe telefon)
Fără migrare nouă (tabelul `loans` și politica RLS existau).
- `src/lib/loans.ts`: termen (`loaned_at + remind_after_days`), zile peste termen, sortare, texte în română; data de azi în fus local.
- `AppContext`: `addLoan`, `returnLoan` (actualizează starea locală); cache-ul offline se scrie acum la orice schimbare a `books`.
- `components/LoanPanel.tsx` în `BookDetail`: „🤝 Împrumută” / „📥 Am împrumutat-o de la…” (cui, data, reamintire 14/30/60 sau oricâte zile; sugestii din numele folosite), „✅ A fost returnată” / „↩️ Am dat-o înapoi” (la cele luate de la alții întreabă dacă ștergem cartea din bibliotecă), istoric. Se pot împrumuta atâtea exemplare câte are cartea.
- `pages/Loans.tsx` (`/imprumuturi`, link din antetul listei): date altora / luate de la alții, întârziatele primele, istoric.
- `Layout`: banner roșu cu împrumuturile peste termen la deschidere (se ascunde cu ×). `BookCard`: etichete „La X” / „De la X”, roșii când sunt întârziate.
- Profilurile copiilor văd împrumuturile (fără cărțile `adults_only`), dar nu pot crea/returna. Offline: butoanele sunt dezactivate.

### B. Lista de dorințe — FĂCUT (17 nov 2026, de confirmat pe telefon; necesită migrarea 0005)
- `supabase/migrations/0005_wishlist.sql`: coloane `publisher`, `year`, `cover_url`, `source` + index pe `added_by`. **De rulat de utilizator în SQL Editor.**
- Semantică: `added_by` = profilul a cărui dorință este. Fiecare profil are lista lui („Ale mele”); fila „Toată familia” le grupează pe persoane (idei de cadouri). Părinții pot adăuga și pentru alt profil („Pentru cine?”); copiii doar pentru ei și pot șterge doar dorințele proprii.
- `pages/Wishlist.tsx` (`/dorinte`, filă nouă ⭐ în meniul de jos): adăugare cu titlu/autor/notă, „🔎 Caută ediția” în cataloage, „📷 Scanează codul”, sau „Adaugă așa”. Pe fiecare dorință: „✅ O avem deja” (verificare locală ISBN/titlu), „🛒 Am cumpărat-o”, 🗑️.
- `lib/wishes.ts` → `addWishChecked`: refuză dublura pe lista aceluiași profil; întreabă dacă o avem deja (ISBN exact + `find_similar_books` > 0,55); anunță dacă altcineva o vrea deja.
- „🛒 Am cumpărat-o” → `/adauga?dorinta=<id>`: formular pre-completat (+ completare din cataloage după ISBN), dorința se șterge la salvare.
- `HaveIt`: la NU → „⭐ La dorințe” (cu datele găsite după ISBN) și „➕ Am cumpărat-o”; la căutare text fără rezultat → „⭐ Pune „…” la dorințe”.
- `SchoolLists`: la cărțile lipsă „⭐ la dorințe” (pentru profilul listei, notă „Lectură școlară: …”), plus „Pune toate cele N lipsă la dorințe”.
- `AppContext`: `wishes`, `refreshWishes`, `addWish`, `deleteWish`; cache offline în `localStorage` (lista se vede și fără rețea, în librărie).

### C. Statistici și insigne pe profil — FĂCUT (17 nov 2026, de confirmat pe telefon)
Fără tabele noi; totul se calculează din `reading_status` + `books` (`src/lib/stats.ts`).
- `pages/MyProfile.tsx` (`/eu`): fila cu avatarul din meniul de jos duce acum aici (nu direct la schimbarea profilului); schimbarea se face cu „🔄 Schimbă” (→ `/profil`). Se pot vedea și ceilalți membri (`/eu?m=<id>`, din „În familie”).
- Conținut: cifre (citite anul acesta / total / pagini), „În curs” cu bară de progres, insigne, grafic „Cărți citite pe ani” (ultimii 6 ani, o singură culoare, atingerea unei coloane arată cărți + pagini), genuri preferate, autori frecvenți, nota medie, cea mai lungă carte, cărțile de 5 stele, citite recent, comparație pe familie în anul curent.
- Insigne (16): 1/5/10/25/50/100 cărți; 300+ și 500+ pagini; 1.000/5.000/10.000 pagini cumulate; Explorator (5 genuri); Critic (5 impresii); Serie terminată (toate cărțile unei serii, min. 2, din bibliotecă); Maraton (3 într-o lună); O carte pe lună (12 într-un an). Data câștigării = `finished_at` al cărții care a declanșat-o (cărțile fără dată se ordonează la final). Cele necâștigate arată progresul.
- `BookDetail`: la „Citită” apare „Terminată pe” (dată editabilă), ca lecturile vechi să cadă în anul corect; re-marcarea ca citită păstrează data existentă.
- Verificat: logica pe date de test (script) și pagina randată în Chrome headless cu date simulate.

### D. „Ce citesc în continuare?” — FĂCUT (17 nov 2026, de confirmat pe telefon; necesită migrarea 0006)
- `supabase/migrations/0006_member_birth_date.sql`: `members.birth_date`. Se completează în Setări → „Vârsta copiilor” (câmp de dată; vârsta = ani împliniți). Datele de naștere nu se pun în repo.
- `src/lib/suggest.ts`: filtre stricte — necitită și neîncepută de profil, nu e dată cu împrumut, public potrivit (copii → `copii`, adulți → `adulti`), fără `adults_only` la copii, `min_age` ≤ vârsta. Scor: următorul volum dintr-o serie începută (+5; volumele care sar peste unul necitit ×0,2), lectură școlară a profilului (+3), genuri/autori citiți (notele 4–5 contează dublu), note 4–5 date de familie, adăugată în ultimele 60 de zile; la copii, cărți cu `min_age` mult sub vârstă ×0,4. Alegere aleatoare ponderată (scor²) dintre primele 12; „🎲 Alta” nu repetă până nu le trece pe toate.
- `pages/WhatNext.tsx` (`/ce-citesc`; link „🎲 Ce citesc?” în antetul listei și buton în „Profilul meu”): filtre opționale gen + lungime, cartea propusă cu motivele și camera/raftul, „📖 Încep s-o citesc” (marchează „În curs” și deschide cartea), „Alte idei”.
- Verificat randat în Chrome headless cu date simulate (excluderile pentru împrumut și vârstă funcționează).

### E. Serii incomplete
Grupare după `series`; arată volumele lipsă între 1 și max(`series_volume`); buton „la dorințe”.

### F. Adăugare offline
Coadă locală (IndexedDB) pentru adăugări/modificări fără rețea, sincronizată la revenire. Cel mai mare ca efort; doar dacă se simte nevoia.

### Întreținere
- **T2. Chei Supabase noi în Edge Function** (termen: început de 2027): `SUPABASE_ANON_KEY` și `SUPABASE_SERVICE_ROLE_KEY` sunt marcate Deprecated; de trecut pe `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS` (dicționare JSON) sau pe `withSupabase` din `jsr:@supabase/server` (șablonul actual din dashboard). De verificat formatul în documentația Supabase înainte de schimbare.
- **T3. Actualizare CIP lunară:** manual, `node index.mjs --from <anul curent>` + `node upload.mjs` (vezi `tools/cip-import/README.md`). Opțional: GitHub Action lunar cu secretele `FAMILY_EMAIL` / `FAMILY_PASSWORD`.
- **T4.** Reîncercare 2018-06 și 2018-12 din Internet Archive (`--only 2018-06`).
- **T5.** Opțional: selector de avatar în Setări (acum avatarul e un emoji în `members.avatar`, schimbat prin SQL).
