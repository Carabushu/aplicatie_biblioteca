/** Normalizare pentru căutare: fără diacritice, litere mici. */
export const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export const matches = (hay: string | null | undefined, needle: string) => norm(hay).includes(norm(needle))
