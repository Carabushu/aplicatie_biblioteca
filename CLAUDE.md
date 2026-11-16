# Biblioteca de acasă — instrucțiuni pentru asistent

Citește întâi `docs/STARE-SI-PLAN.md`: conține starea completă a proiectului, arhitectura, capcanele deja întâlnite
și planul V3 cu sarcinile rămase (T1, A, B, …).

Reguli de lucru:
- Răspunde în română. Utilizatorul (Ciprian) are experiență embedded, puțină în web: dă pași numerotați, cu numele exacte ale butoanelor.
- Nu cere și nu repeta chei sau parole. Dacă apar într-o captură, spune-i să le înlocuiască.
- Nu ai acces la Supabase-ul lui: schimbările de schemă se livrează ca fișier nou în `supabase/migrations/` (idempotent), pe care îl rulează el în SQL Editor.
- Înainte de push rulează `npm run build`. Push pe `main` publică automat pe Vercel.
- Interfața rămâne în română, simplă, potrivită și pentru copii; respectă restricțiile profilurilor `is_child`.
- Nu șterge indexurile trigram de pe `cip_books` (vezi „Lucruri învățate”).
- După fiecare etapă livrată, actualizează `docs/STARE-SI-PLAN.md`.
