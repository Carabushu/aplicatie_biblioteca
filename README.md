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
6. Ia cheile: **Project Settings (rotița) → API Keys**. Notează:
   - **Publishable key** (începe cu `sb_publishable_`). În interfețele mai vechi se numea **anon public** și începea cu `eyJ` — e același rol. E publică prin design: securitatea vine din RLS + faptul că singurul utilizator e contul familiei.
   - **Project URL**: **Project Settings → General** (sau **Data API**), de forma `https://abcdefgh.supabase.co`.

   ⚠️ Cheia **Secret** (`sb_secret_`, fostă *service_role*) nu se folosește nicăieri în acest proiect. N-o pune niciunde.

### 2. GitHub — codul și keep-alive

1. Codul e deja în repo-ul tău (`biblioteca-acasa`).
2. **Settings → Secrets and variables → Actions → New repository secret**, de două ori:
   - `SUPABASE_URL` = Project URL de mai sus
   - `SUPABASE_ANON_KEY` = cheia publishable
3. **Actions** → *Supabase keep-alive* → **Run workflow** o dată, ca test. Trebuie să afișeze `HTTP 200`. De acum rulează singur la 3 zile și ține proiectul Supabase treaz (planul gratuit pune pe pauză proiectele neatinse 7 zile).

### 3. Vercel — găzduirea

1. https://vercel.com → **Add New → Project** → *Import* repo-ul `biblioteca-acasa`.
2. Framework: detectează singur *Vite*. Build command `npm run build`, output `dist` (implicite).
3. **Environment Variables** — adaugă două:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = cheia publishable
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

## V2 — funcțiile cu AI (poză cu coperta, poză cu raftul, lista școlară din poză)

Pozele sunt trimise la Claude printr-o **Edge Function** Supabase (`supabase/functions/analyze-image`), ca cheia Anthropic
să nu ajungă niciodată pe telefon. Costul: ~1–2 cenți pentru un raft, sub 1 cent pentru o copertă. Limită implicită: 80 de analize/zi.

### Publicare (o singură dată)

1. **Tabelele:** SQL Editor → rulează `supabase/migrations/0004_v2_ai.sql`.
2. **Secretul:** Edge Functions → **Secrets** → `ANTHROPIC_API_KEY` = cheia din https://console.anthropic.com (API Keys).
   Opțional: `AI_DAILY_LIMIT` (implicit 80), `ANTHROPIC_MODEL` (implicit `claude-haiku-5-5`).
   În consola Anthropic setează un plafon lunar (Settings → Limits), de ex. 5 $.
3. **Funcția** — una dintre variante:
   - **A. Din browser (fără instalări):** Supabase → Edge Functions → *Deploy a new function* → *Via Editor*.
     Nume: `analyze-image`. Șterge codul de exemplu, lipește conținutul din `supabase/functions/analyze-image/index.ts`, **Deploy**.
     Apoi în pagina funcției → *Details* / *Settings*: dezactivează **Verify JWT** (autentificarea o face funcția însăși).
   - **B. Din PowerShell (Supabase CLI, prin npx):**
     ```powershell
     cd ~\Documents\aplicatie_biblioteca
     npx supabase login                       # deschide browserul, confirmi
     npx supabase link --project-ref <ref>    # ref = Project ID din Project Settings → General
     npx supabase functions deploy analyze-image --no-verify-jwt
     ```
4. **Test:** în aplicație → ➕ Adaugă → *Poză cu coperta*. Dacă apare o eroare, mesajul spune exact ce lipsește (secret, credit, limită).

Consumul se vede în Supabase: SQL Editor → `select * from ai_usage_month;` și, cu prețuri reale, în consola Anthropic → Usage.

### Ce fac funcțiile
- **Poză cu coperta** (➕ Adaugă, sau oferită automat când un ISBN nu e găsit): Claude citește titlul, autorul, editura, anul, seria, publicul, genurile; aplicația caută apoi ediția în CIP/Google/Open Library pentru ISBN și copertă; tu verifici și salvezi.
- **Poză cu raftul**: Claude listează cotoarele; fiecare titlu e căutat în cataloage și verificat la duplicate; bifezi, corectezi, alegi camera, salvezi tot dintr-o dată. Citirile nesigure primesc „De verificat”.
- **Lecturi școlare** (🎒 din lista de cărți sau din Setări): lista de la școală tastată, lipită sau fotografiată → ✅ avem / ❌ lipsește, salvată pe profil; la redeschidere se re-potrivește automat cu cărțile adăugate între timp.

## Cărți românești: catalogul CIP (recomandat)

Cataloagele online au puține cărți românești. Folderul `tools/cip-import/` construiește un catalog local
din Bibliografia CIP a Bibliotecii Naționale (1998–prezent, ~350.000 de titluri): rulează `0002_cip_books.sql`
în Supabase, apoi urmează `tools/cip-import/README.md`. După import, scanarea unui ISBN românesc găsește
cartea instant, iar căutarea după titlu arată și rezultatele „CIP (Biblioteca Națională)”.

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

- **V3:** împrumuturi cu reamintiri, lista de dorințe, serii incomplete, statistici și insigne pe profil, „ce citesc în continuare?”.

## Probleme frecvente

| Simptom | Cauză probabilă |
|---|---|
| „Email sau parolă greșită” deși sunt corecte | Utilizatorul nu e confirmat: Authentication → Users → … → Confirm. |
| Lista e goală după login, „Cine ești?” nu arată profiluri | SQL-ul de la pasul 1.3 nu a rulat complet. Rulează-l din nou (e idempotent). |
| Lipsesc VITE_SUPABASE_URL… | Variabilele de mediu nu sunt setate în Vercel, sau nu ai redeploy-at după ce le-ai adăugat. |
| Camera nu pornește | Permite accesul la cameră pentru site în Chrome; funcționează doar pe HTTPS. |
| Aplicația „a adormit” (eroare la prima deschidere după mult timp) | Workflow-ul keep-alive nu rulează — verifică secret-urile din GitHub. |
