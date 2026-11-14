// Extrage textul dintr-un PDF CIP, linie cu linie, în ordinea de pe pagină.
// Folosește pdfjs (JavaScript pur) ca să nu fie nevoie de poppler pe Windows.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFile } from 'node:fs/promises'

export async function extractLines(pdfPath) {
  const data = new Uint8Array(await readFile(pdfPath))
  const doc = await getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise
  const lines = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    // grupează fragmentele după coordonata y (rotunjită), apoi le ordonează după x
    const rows = new Map()
    for (const it of content.items) {
      if (!('str' in it)) continue
      const y = Math.round(it.transform[5] / 2) * 2
      const x = it.transform[4]
      if (!rows.has(y)) rows.set(y, [])
      rows.get(y).push({ x, str: it.str, w: it.width })
    }
    const ys = [...rows.keys()].sort((a, b) => b - a) // de sus în jos
    for (const y of ys) {
      const frags = rows.get(y).sort((a, b) => a.x - b.x)
      let line = ''
      let lastEnd = null
      for (const f of frags) {
        if (lastEnd !== null && f.x - lastEnd > 1.5 && !line.endsWith(' ') && !f.str.startsWith(' ')) line += ' '
        line += f.str
        lastEnd = f.x + f.w
      }
      const indent = Math.round(frags[0].x)
      lines.push({ page: p, indent, text: line.replace(/\s+/g, ' ').trimEnd() })
    }
    page.cleanup()
  }
  return lines
}
