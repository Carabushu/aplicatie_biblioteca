// Extrage textul dintr-un PDF CIP, linie cu linie, în ordinea de citire.
// Folosește pdfjs (JavaScript pur) ca să nu fie nevoie de poppler pe Windows.
// Tratează: pagini rotite (numerele vechi sunt scanate ca „landscape”) și
// pagini duble (două pagini tipărite pe o foaie PDF → două coloane).
import { getDocument, Util } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFile } from 'node:fs/promises'

export async function extractLines(pdfPath) {
  const data = new Uint8Array(await readFile(pdfPath))
  const doc = await getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise
  const lines = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const vp = page.getViewport({ scale: 1 }) // include rotația paginii
    const content = await page.getTextContent()
    const items = []
    for (const it of content.items) {
      if (!('str' in it) || it.str === '') continue
      const t = Util.transform(vp.transform, it.transform) // coordonate „ecran”: x spre dreapta, y în jos
      items.push({ x: t[4], y: t[5], w: it.width, str: it.str })
    }
    // pagină dublă? (lată și cu text pe ambele jumătăți)
    const spread = vp.width > vp.height * 1.15
    const columns = spread ? [items.filter(i => i.x < vp.width / 2), items.filter(i => i.x >= vp.width / 2)] : [items]
    for (const col of columns) {
      const rows = new Map()
      for (const it of col) {
        const y = Math.round(it.y / 2) * 2
        if (!rows.has(y)) rows.set(y, [])
        rows.get(y).push(it)
      }
      const ys = [...rows.keys()].sort((a, b) => a - b) // de sus în jos
      for (const y of ys) {
        const frags = rows.get(y).sort((a, b) => a.x - b.x)
        let line = ''
        let lastEnd = null
        for (const f of frags) {
          if (lastEnd !== null && f.x - lastEnd > 1.5 && !line.endsWith(' ') && !f.str.startsWith(' ')) line += ' '
          line += f.str
          lastEnd = f.x + f.w
        }
        const text = line.replace(/\s+/g, ' ').trimEnd()
        if (text) lines.push({ page: p, indent: Math.round(frags[0].x), text })
      }
    }
    page.cleanup()
  }
  return lines
}
