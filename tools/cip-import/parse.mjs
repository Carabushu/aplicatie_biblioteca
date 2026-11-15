// Parsează liniile unui număr CIP în înregistrări bibliografice.
// Formatul unei înregistrări (constant din 2019 până în 2026):
//
//   67. BARKER, VICKY. Puzzle-uri cu dinozauri / de Vicky Barker şi Ste Johnson. - Iaşi : Gama, 2023
//   ISBN 978-606-056-558-1
//   087.5
//   CIP 2023-22808
//
// Variante: fără autor (titlul începe direct), ediție („Ed. a 2-a. -”), note („Conţine bibliografie”, „Index”),
// lucrări în mai multe volume (ISBN general + „Vol. 1 : ... - ISBN ...” pentru fiecare volum).

// Unele fonturi din PDF nu au tabel Unicode; pdfjs le citește ca Mac Roman, deși textul e Windows-1250.
// Corectăm doar caracterele care nu apar în mod normal în text românesc/maghiar corect.
const ENC_FIX = { '‚': 'â', 'Ó': 'î', '·': 'á', 'È': 'é', 'ˆ': 'ö', '˙': 'ú', '¸': 'ü', 'Û': 'ó', '¡': 'Á', 'Ì': 'í', 'Ù': 'ô', 'Ò': 'ń', '˚': 'ű', 'Ê': 'ć', 'ı': 'ő', '¬': 'Â', '√': 'Ă', '…': 'É', 'Œ': 'Î', 'Ô': 'ď', 'Ë': 'č', 'Á': 'ç' }
const ENC_RE = new RegExp('[' + Object.keys(ENC_FIX).join('') + ']', 'g')
export const fixEncoding = s => s.replace(ENC_RE, c => ENC_FIX[c])

const ISBN_RE = /ISBN\s*:?\s*([0-9][0-9\-]{8,20}[0-9Xx])/g
const ENTRY_START = /^\s*(\d{1,5})\.\s*(\S.*)$/
const CIP_CODE = /CIP\s+(\d{4}-\d+)/
const PAGE_HEADER = /^\s*(CIP\s+\d+|\d+\s+BIBLIOGRAFIA CĂRŢILOR ÎN CURS DE APARIŢIE|BIBLIOGRAFIA CĂRŢILOR ÎN CURS DE APARIŢIE\s*\d*)\s*$/i
const UDC_LINE = /^\s*\d{1,3}(?:[.\/]\d+)*(?:[.\/\-][0-9().:=\-\/]*)*\s*$/

export function normalizeIsbn(s) {
  const d = s.replace(/[^0-9Xx]/g, '').toUpperCase()
  return d.length === 10 || d.length === 13 ? d : null
}

export function isValidIsbn(s) {
  if (!s) return false
  if (s.length === 10) {
    let sum = 0
    for (let i = 0; i < 10; i++) { const c = s[i] === 'X' ? 10 : Number(s[i]); if (Number.isNaN(c)) return false; sum += c * (10 - i) }
    return sum % 11 === 0
  }
  if (s.length === 13) {
    if (!/^\d{13}$/.test(s)) return false
    let sum = 0
    for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3)
    return (10 - (sum % 10)) % 10 === Number(s[12])
  }
  return false
}

/** „POPESCU, ION-MARIA” → „Ion-Maria Popescu” */
function humanizeAuthor(last, first) {
  const tc = s => s.toLowerCase().replace(/(^|[\s\-'’.])(\p{L})/gu, (m, p, c) => p + c.toUpperCase())
  const l = tc(last.trim()), f = first ? tc(first.trim()) : ''
  return (f ? `${f} ${l}` : l).replace(/\s+/g, ' ').trim()
}

/** Împarte textul în blocuri de înregistrare: de la „N. ” până la linia „CIP aaaa-nnnnn”. */
export function splitEntries(lines) {
  const entries = []
  let cur = null
  let expected = 1
  let started = false
  for (const ln of lines) {
    const t = ln.text
    if (/^\s*INDEX DE NUME\s*$/i.test(t) || /^\s*Index de nume\s*$/.test(t) && started && cur === null && entries.length > 50) break
    if (PAGE_HEADER.test(t)) continue
    if (cur === null) {
      const m = t.match(ENTRY_START)
      if (m && Number(m[1]) === expected) {
        cur = { n: expected, page: ln.page, lines: [m[2]] }
        started = true
      }
      continue
    }
    cur.lines.push(t)
    if (CIP_CODE.test(t)) {
      entries.push(cur)
      expected = cur.n + 1
      cur = null
    }
  }
  return entries
}

/** Parsează un bloc într-una sau mai multe înregistrări (câte una per ISBN de volum). */
export function parseEntry(block, issue) {
  const merged = []
  for (const l of block.lines) {
    const prev = merged[merged.length - 1]
    if (prev && /ISBN\s*:?\s*[0-9][0-9\-]*-$/.test(prev) && /^[0-9][0-9\-]*/.test(l)) merged[merged.length - 1] = prev + l
    else merged.push(l)
  }
  const flat = fixEncoding(merged.join(' ').replace(/\s+/g, ' ').trim())

  const cipCodes = [...flat.matchAll(/CIP\s+(\d{4}-\d+)/g)].map(m => m[1])
  // linia UDC = ultima linie „numerică” înainte de codul CIP
  let udc = null
  for (let i = block.lines.length - 1; i >= 0; i--) {
    const l = block.lines[i].trim()
    if (CIP_CODE.test(l)) continue
    if (UDC_LINE.test(l)) { udc = l; break }
    if (/ISBN|Vol\.|vol\./.test(l)) break
  }

  // descrierea principală = până la primul ISBN / notă / „N vol.”
  const cutAt = flat.search(/\s(ISBN\b|Conţine bibliografie|Conține bibliografie|Index\b|Bibliogr\.|\d*\s*vol\.\s|Vol\. \d)/)
  let head = (cutAt > 0 ? flat.slice(0, cutAt) : flat).trim()

  // autor cu majuscule: „POPESCU, ION. ” sau „POPESCU, ION-MARIA. ” (poate conține diacritice, apostrof, cratimă)
  let author = null
  const am = head.match(/^([\p{Lu}][\p{Lu}'’\-\s]+?),\s+([\p{Lu}][\p{Lu}'’\-\s.]*?)\.\s+(?=\S)/u)
  if (am && am[1].length <= 40 && am[2].length <= 40) {
    author = humanizeAuthor(am[1], am[2])
    head = head.slice(am[0].length)
  } else if ((() => { const rm = head.match(/^([\p{Lu}][\p{Lu}'’\-\s]{2,40}?),\s+([a-zăâîșşțţ.\s]{2,30}?)\.\s+(?=\p{Lu})/u); if (rm) { author = humanizeAuthor(rm[1], ''); head = head.slice(rm[0].length); return true } return false })()) {
    // autor urmat de rol („, ieromonah.”, „, pr.”)
  } else {
    const cm = head.match(/^([\p{Lu}][\p{Lu}'’\-\s]{2,40}?)\.\s+(?=\p{Lu})/u) // instituție / un singur nume
    if (cm && !/^(ISBN|CIP)$/.test(cm[1])) { author = humanizeAuthor(cm[1], ''); head = head.slice(cm[0].length) }
  }

  // loc : editură, an  — ultimul segment după „ - ”
  let place = null, publisher = null, year = null, edition = null
  const segs = head.split(/\s\.\s-\s|\.\s-\s/)
  // caută de la final segmentul cu „Loc : Editură, an”
  for (let i = segs.length - 1; i >= 0; i--) {
    const pm = segs[i].match(/^(.*?)\s:\s(.*?),\s\[?(\d{4})\]?(?:-\d{0,4})?\s*\.?$/)
    if (pm) {
      place = pm[1].replace(/^\[|\]$/g, '').trim()
      publisher = pm[2].trim()
      year = Number(pm[3])
      segs.splice(i, 1)
      break
    }
  }
  const edIdx = segs.findIndex(s => /^Ed\.\s/.test(s.trim()))
  if (edIdx >= 0) { edition = segs[edIdx].trim(); segs.splice(edIdx, 1) }
  let titleStmt = segs.join('. - ').trim()
  // titlu / mențiune de responsabilitate
  let title = titleStmt, statement = null
  const slash = titleStmt.indexOf(' / ')
  if (slash > 0) { title = titleStmt.slice(0, slash); statement = titleStmt.slice(slash + 3) }
  title = title.replace(/\s*\.\s*$/, '').replace(/\s*:\s*/g, ': ').trim()
  // „Titlu = Parallel title” → păstrăm doar prima formă
  if (title.includes(' = ')) title = title.split(' = ')[0].trim()
  if (!author && statement) {
    // „/ Ion Popescu ; il. de ...” → primul nume înainte de „;”, dacă nu e rol (trad., coord., il.)
    const first = statement.split(';')[0].trim()
    if (first && !/^(trad|coord|il|ed|pref|postf|text|adapt|red|sel|antol|îngrij|vol)\.?\b/i.test(first) && first.split(' ').length <= 5 && !/\bde\b/i.test(first)) author = first.replace(/^de\s+/i, '')
  }

  // ISBN-uri: generalul + câte unul pe volum
  const isbns = [...flat.matchAll(ISBN_RE)].map(m => normalizeIsbn(m[1])).filter(Boolean)
  const volumes = [...flat.matchAll(/Vol\.\s*(\d+)\s*:\s*(.+?)\.\s-\s(?:\[?(\d{4})\]?)?(?:\.\s-\s)?(?:.*?)(?=ISBN|Vol\.\s*\d+\s*:|$)/g)]
    .map(m => ({ vol: Number(m[1]), title: m[2].trim(), year: m[3] ? Number(m[3]) : null }))

  const isChildren = !!udc && (/^087\.5/.test(udc) || /-93\b/.test(udc))
  const base = {
    issue, entry: block.n, page: block.page,
    author, title, statement, edition, place, publisher, year, udc,
    audience: isChildren ? 'copii' : 'adulti',
    cip: cipCodes.join(' '), needs_review: false,
  }
  const out = []
  if (volumes.length > 0 && isbns.length > 1) {
    // volumele au ISBN propriu, în ordinea apariției după ISBN-ul general
    const volIsbns = [...flat.matchAll(/Vol\.\s*(\d+)\s*:[^]*?ISBN\s*:?\s*([0-9][0-9\-]{8,20}[0-9Xx])/g)]
    for (const m of volIsbns) {
      const v = volumes.find(x => x.vol === Number(m[1]))
      const isbn = normalizeIsbn(m[2])
      if (!isbn) continue
      out.push({ ...base, isbn, title: v ? `${title}. Vol. ${v.vol}: ${v.title}` : title, series: title, series_volume: Number(m[1]), year: v?.year ?? year })
    }
    if (isbns[0] && !out.some(o => o.isbn === isbns[0])) out.push({ ...base, isbn: isbns[0], series: title, series_volume: null, title: `${title} (set)` })
  } else {
    out.push({ ...base, isbn: isbns[0] ?? null, series: null, series_volume: null })
  }
  for (const r of out) {
    if (!r.title || r.title.length < 2) r.needs_review = true
    if (!r.publisher || !r.year) r.needs_review = true
    if (r.isbn && !isValidIsbn(r.isbn)) r.needs_review = true
  }
  return out
}

export function parseIssue(lines, issue) {
  const blocks = splitEntries(lines)
  // diagnostic: dacă după ultima intrare parsată mai există linii care arată a intrări numerotate, parsarea s-a oprit devreme
  const lastN = blocks.length ? blocks[blocks.length - 1].n : 0
  let maxSeen = 0
  for (const ln of lines) {
    const m = ln.text.match(/^\s*(\d{1,5})\.\s*\p{Lu}/u)
    if (m) { const n = Number(m[1]); if (n > lastN && n < lastN + 3000 && n > maxSeen) maxSeen = n }
  }
  const stoppedEarly = maxSeen > lastN + 5 ? { lastParsed: lastN, lastSeen: maxSeen } : null
  const records = []
  const problems = []
  for (const b of blocks) {
    try { records.push(...parseEntry(b, issue)) } catch (e) { problems.push({ entry: b.n, error: String(e) }) }
  }
  return { records, problems, entries: blocks.length, stoppedEarly }
}
