// Edge Function: trimite o poză la Claude (viziune) și întoarce date structurate.
// Moduri: shelf (raft întreg → listă de cărți), cover (copertă → o carte), school_list (lista de lecturi → titluri).
//
// Securitate:
//  - cheia Anthropic e doar aici (secret ANTHROPIC_API_KEY), niciodată în client
//  - acceptă doar utilizatori autentificați (contul familiei)
//  - limită zilnică de apeluri (AI_DAILY_LIMIT, implicit 80) și de mărime a imaginii (~2 MB)
//
// Publicare: npx supabase functions deploy analyze-image  (vezi README)

import { createClient } from 'npm:@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-5-5'
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '80')
const MAX_IMAGE_BYTES = 2_000_000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

type Mode = 'shelf' | 'cover' | 'school_list'

const PROMPTS: Record<Mode, string> = {
  shelf: `Imaginea arată un raft (sau mai multe) cu cărți, fotografiat într-o casă din România.
Identifică fiecare carte al cărei titlu se poate citi de pe cotor sau copertă. Parcurge rafturile de sus în jos și fiecare raft de la stânga la dreapta.
Răspunde DOAR cu JSON valid, fără alt text, în forma:
{"books":[{"title":"...","author":"... sau null","publisher":"... sau null","confidence":0.0-1.0}]}
Reguli: nu inventa titluri; dacă un cotor nu se poate citi, omite-l. Scrie titlul și autorul cu diacritice corecte și cu majuscule normale (nu tot cu majuscule). Dacă același titlu apare în mai multe volume, listează fiecare volum. "confidence" reflectă cât de sigur ești de citire.`,
  cover: `Imaginea arată coperta (sau pagina de titlu) unei cărți. Extrage datele și completează, dacă ești sigur, din ce știi despre această ediție.
Răspunde DOAR cu JSON valid, fără alt text:
{"title":"...","author":"... sau null","publisher":"... sau null","year":număr sau null,"series":"... sau null","series_volume":număr sau null,"language":"ro|en|de|fr|hu|...","audience":"copii|adulti","min_age":număr sau null,"genres":["..."],"pages":număr sau null,"confidence":0.0-1.0}
Pentru "genres" alege dintre: Aventură, Fantasy, SF, Istorie, Biografie, Poezie, Povești, Basme, Benzi desenate, Mister / Polițist, Dragoste, Umor, Știință, Natură, Enciclopedie, Religie, Filosofie, Psihologie, Dezvoltare personală, Economie / Business, Tehnic, Gătit, Călătorii, Artă, Manual / Școală, Clasici, Literatură română, Literatură universală, Altele.
"audience" este "copii" dacă e carte pentru copii sau adolescenți, altfel "adulti". Nu inventa ISBN.`,
  school_list: `Imaginea arată o listă de lecturi (școlară sau recomandată), posibil scrisă de mână sau fotografiată de pe hârtie/ecran.
Extrage fiecare carte din listă. Răspunde DOAR cu JSON valid, fără alt text:
{"items":[{"title":"...","author":"... sau null"}]}
Normalizează titlurile și autorii (diacritice, majuscule normale). Dacă un rând conține mai multe titluri ale aceluiași autor, separă-le.`,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Metodă nepermisă' }, 405)
  if (!ANTHROPIC_API_KEY) return json({ error: 'Lipsește secretul ANTHROPIC_API_KEY în Supabase' }, 500)

  // 1. autentificare: doar contul familiei
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Neautentificat' }, 401)

  // 2. corpul cererii
  let body: { mode?: Mode; image?: string; media_type?: string; member_id?: string }
  try { body = await req.json() } catch { return json({ error: 'JSON invalid' }, 400) }
  const mode = body.mode
  if (!mode || !(mode in PROMPTS)) return json({ error: 'mode trebuie să fie shelf | cover | school_list' }, 400)
  const image = (body.image ?? '').replace(/^data:[^;]+;base64,/, '')
  if (!image) return json({ error: 'Lipsește imaginea' }, 400)
  if (image.length * 0.75 > MAX_IMAGE_BYTES) return json({ error: 'Imaginea e prea mare (max ~2 MB după redimensionare)' }, 413)
  const mediaType = body.media_type ?? 'image/jpeg'

  // 3. limită zilnică (contor în tabelul ai_calls; service role ca să nu depindă de RLS)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const { count } = await admin.from('ai_calls').select('*', { count: 'exact', head: true }).gte('created_at', since.toISOString())
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: `Limita zilnică de ${DAILY_LIMIT} analize a fost atinsă. Încearcă mâine.` }, 429)

  // 4. apel Anthropic (Messages API, viziune)
  const t0 = Date.now()
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: mode === 'shelf' ? 4000 : 1200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: PROMPTS[mode] },
        ],
      }],
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    console.error('Anthropic error', res.status, txt.slice(0, 500))
    const friendly = res.status === 429 ? 'Prea multe cereri către Anthropic; încearcă din nou în câteva secunde.'
      : res.status === 401 ? 'Cheia Anthropic nu e validă.'
      : res.status === 400 && /credit|billing/i.test(txt) ? 'Creditul Anthropic s-a terminat sau plafonul lunar a fost atins.'
      : `Eroare Anthropic (${res.status})`
    return json({ error: friendly }, 502)
  }
  const data = await res.json()
  const text: string = (data.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n')

  // 5. extrage JSON-ul (modelul răspunde doar JSON, dar fim toleranți)
  let parsed: unknown = null
  try {
    const m = text.match(/\{[\s\S]*\}/)
    parsed = m ? JSON.parse(m[0]) : null
  } catch { parsed = null }

  // 6. jurnal pentru limită și costuri
  await admin.from('ai_calls').insert({
    mode, member_id: body.member_id ?? null,
    input_tokens: data.usage?.input_tokens ?? null, output_tokens: data.usage?.output_tokens ?? null,
    model: MODEL, ms: Date.now() - t0, ok: parsed !== null,
  })

  if (parsed === null) return json({ error: 'Nu am putut interpreta răspunsul. Încearcă o poză mai clară.', raw: text.slice(0, 2000) }, 422)
  return json({ result: parsed, usage: data.usage ?? null, model: MODEL })
})
