// Test rapid pe PDF-uri locale: node test-local.mjs fisier.pdf [altul.pdf]
import { extractLines } from './extract.mjs'
import { parseIssue } from './parse.mjs'
import { writeFile } from 'node:fs/promises'

for (const f of process.argv.slice(2)) {
  const t0 = Date.now()
  const lines = await extractLines(f)
  const { records, problems, entries } = parseIssue(lines, f)
  const withIsbn = records.filter(r => r.isbn).length
  const review = records.filter(r => r.needs_review).length
  const kids = records.filter(r => r.audience === 'copii').length
  const noAuthor = records.filter(r => !r.author).length
  console.log(`${f}: ${entries} intrări → ${records.length} înregistrări, ${withIsbn} cu ISBN, ${kids} copii, ${noAuthor} fără autor, ${review} de verificat, ${problems.length} erori, ${((Date.now()-t0)/1000).toFixed(1)}s`)
  await writeFile(f.replace(/\.pdf$/i, '.json'), JSON.stringify({ records, problems }, null, 1))
}
