# 📚 Biblioteca de acasă

Aplicație web progresivă (PWA) pentru evidența cărților din casă. Un cont de familie, profiluri pentru fiecare membru, funcționează pe Android (Chrome) și pe laptop, se instalează ca aplicație de pe link.

**Stack:** Vite + React + TypeScript + Tailwind · Supabase (Postgres + Auth) · Vercel · GitHub Actions (keep-alive)
**Cost de rulare:** 0 lei (planuri gratuite). Singurul cost viitor: apelurile Anthropic pentru poze (V2).

---

## Ce face V1

- Login cu contul familiei → alegi profilul (Ciprian / Otilia / Amelia / Alex)
- Lista cărților cu filtrul principal **Copii / Adulți**, apoi gen, cameră, autor, vârstă, citită de cine, împrumutată; căutare text (ignoră diacriticele)
- Adăugare: **scanare cod de bare**, ISBN tastat, căutare titlu/autor (Google Books + Open Library), manual
- Copertă automată, alertă duplicate (ISBN exact + titluri asemănătoare)
- Camere editabile, sub-locație, mutare în masă (ex. în pod)
- Stare citire per profil (necitită / în curs cu pagina / citită), note cu stele, impresie
- **„Avem cartea?”** — scanezi în librărie, afli pe loc
- Export CSV / JSON, import CSV; catalogul se vede și offline
- Profilurile copiilor nu pot șterge/edita și nu văd cărțile marcate „ascunsă pe profilurile copiilor”

---

## Instalare pas cu pas

Ai nevoie de: cont GitHub, cont Supabase (gratuit, cu GitHub), cont Vercel (gratuit, cu GitHub). Node.js e necesar doar dacă vrei să rulezi local.

### 1. Supabase — baza de date și autentificarea

1. Intră pe https://supabase.com → **New project**. Nume: `biblioteca`, regiune: *Frankfurt (eu-central-1)*. Salvează parola bazei de date undeva (nu o folosim în aplicație, dar o cere).
2. Așteaptă ~2 minute să pornească proiectul.
3. În meniul din stânga: **SQL Editor** → **New query**. Deschide fișierul `supabase/migrations/0001_schema.sql` din acest repo, copiază tot conținutul, lipește-l și apasă **Run**. Trebuie să apară „Success”. Asta creează tabelele, regulile de securitate, cele 5 camere și cele 4 profiluri.
4. **Dezactivează înregistrarea** (ca nimeni să nu-și poată face cont): **Authentication → Sign In / Providers → Email**: lasă *Enable Email provider* pornit, dar oprește **Allow new users to sign up**. Oprește și **Confirm email** (nu avem nevoie). Save.
5. **Creează contul familiei**: **Authentication → Users → Add user → Create new user**. Email: unul al vostru; parolă: una bună, pe care o știți toți patru. Bifează *Auto Confirm User*. Acesta e singurul cont care poate intra în aplicație.
6. Ia cheile: **Project Settings (rotița) → API**. Notează:
   - **Project URL** (ex. `https://abcdefgh.supabase.co`)
   - **anon public** key (lung, începe cu `eyJ`). Aceasta e publică prin design — securitatea vine din RLS + faptul că singurul utilizator ești tu.

   ⚠️ Cheia **service_role** nu se folosește nicăieri în acest proiect. N-o pune niciunde.

### 2. GitHub — codul și keep-alive

1. Codul e deja în repo-ul tău (`biblioteca-acasa`).
2. **Settings → Secrets and variables → Actions → New repository secret**, de două ori:
   - `SUPABASE_URL` = Project URL de mai sus
   - `SUPABASE_ANON_KEY` = cheia anon
3. **Actions** → *Supabase keep-alive* → **Run workflow** o dată, ca test. Trebuie să afișeze `HTTP 200`. De acum rulează singur la 3 zile și ține proiectul Supabase treaz (planul gratuit pune pe pauză proiectele neatinse 7 zile).

### 3. Vercel — găzduirea

1. https://vercel.com → **Add New → Project** → *Import* repo-ul `biblioteca-acasa`.
2. Framework: detectează singur *Vite*. Build command `npm run build`, output `dist` (implicite).
3. **Environment Variables** — adaugă două:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = cheia anon
4. **Deploy**. În ~1 minut primești un link de forma `https://biblioteca-acasa-xxxx.vercel.app`.
5. (Opțional) **Settings → Domains** dacă vrei un nume mai scurt.

La fiecare `git push` pe `main`, Vercel republică automat.

### 4. Supabase — spune-i de unde vin cererile

**Authentication → URL Configuration → Site URL**: pune linkul de la Vercel. (Nu e strict necesar pentru login cu parolă, dar evită surprize.)

### 5. Instalare pe telefoane (Android)

1. Deschide linkul în **Chrome** pe telefon.
2. Intră cu emailul și parola familiei (o singură dată — rămâne logat).
3. Meniul Chrome (⋮) → **Adaugă pe ecranul principal** / **Instalează aplicația**.
4. Deschide iconița nou apărută — se deschide ca aplicație, fără bara browserului. Fiecare telefon își alege profilul.

Pe laptop: aceeași adresă în Chrome/Edge → iconița „Instalează” din bara de adrese.

---

## Rulare locală (opțional)

```bash
npm install
cp .env.example .env.local      # completează URL-ul și cheia anon
npm run dev                     # http://localhost:5173
```

Camera (scanarea) merge local doar pe `localhost` sau pe HTTPS. Pentru test pe telefon în rețeaua locală: `npm run dev -- --host` și acceptă avertismentul; sau testează direct pe Vercel.

## Structura proiectului

```
supabase/migrations/0001_schema.sql   schema, RLS, funcția de duplicate, date inițiale
.github/workflows/keep-alive.yml      ping la 3 zile
src/
  lib/supabase.ts                     clientul Supabase (din env)
  lib/types.ts                        tipurile de date (oglindesc tabelele)
  lib/catalog.ts                      Google Books + Open Library, validare ISBN
  lib/csv.ts                          export/import
  state/AppContext.tsx                sesiune, profil activ, cărți (cu cache offline), operații CRUD
  components/BarcodeScanner.tsx       BarcodeDetector nativ (Chrome Android) → fallback ZXing
  components/BookForm.tsx             formularul comun (adăugare/editare) cu alertă de duplicate
  pages/                              Login, ChooseProfile, Library, BookDetail, AddBook, HaveIt, Settings
```

## Modelul de securitate, pe scurt

- Toate tabelele au Row Level Security; politica permite acces doar utilizatorilor **autentificați**.
- Înregistrarea e oprită în Supabase → singurul utilizator e contul familiei creat manual.
- Cheia `anon` din client, chiar dacă ajunge la altcineva, nu dă acces la date fără login.
- Nu există cheie Anthropic în V1. În V2 va sta ca secret într-o Edge Function Supabase, cu limită de apeluri/zi.

## Ce urmează

- **V2 (AI):** poză cu raftul → listă de titluri (Claude vision) → confirmare; poză cu coperta; completare metadate când cataloagele nu au cartea; lista de lecturi școlare (tastată sau fotografiată) vs. ce avem.
- **V3:** împrumuturi cu reamintiri, lista de dorințe, serii incomplete, statistici și insigne pe profil, „ce citesc în continuare?”.

## Probleme frecvente

| Simptom | Cauză probabilă |
|---|---|
| „Email sau parolă greșită” deși sunt corecte | Utilizatorul nu e confirmat: Authentication → Users → … → Confirm. |
| Lista e goală după login, „Cine ești?” nu arată profiluri | SQL-ul de la pasul 1.3 nu a rulat complet. Rulează-l din nou (e idempotent). |
| Lipsesc VITE_SUPABASE_URL… | Variabilele de mediu nu sunt setate în Vercel, sau nu ai redeploy-at după ce le-ai adăugat. |
| Camera nu pornește | Permite accesul la cameră pentru site în Chrome; funcționează doar pe HTTPS. |
| Aplicația „a adormit” (eroare la prima deschidere după mult timp) | Workflow-ul keep-alive nu rulează — verifică secret-urile din GitHub. |
