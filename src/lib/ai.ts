/**
 * Analiză de imagini cu Claude, prin Edge Function-ul `analyze-image` (cheia API stă pe server).
 * Imaginile se redimensionează pe telefon înainte de trimitere: cost mic, viteză mare.
 */
import { supabase } from './supabase'
import type { Audience } from './types'

export type AiMode = 'shelf' | 'cover' | 'school_list'

export interface ShelfBook { title: string; author: string | null; publisher: string | null; confidence: number }
export interface CoverData {
  title: string; author: string | null; publisher: string | null; year: number | null
  series: string | null; series_volume: number | null; language: string | null
  audience: Audience | null; min_age: number | null; genres: string[]; pages: number | null; confidence: number
}
export interface SchoolItem { title: string; author: string | null }

export interface AiUsage { input_tokens: number; output_tokens: number }

/** Redimensionează o imagine (File/Blob) la max `maxSide` px pe latura lungă și o întoarce ca base64 JPEG. */
export async function resizeImageToBase64(file: Blob, maxSide = 1600, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  const img = bitmap ?? (await loadImageElement(file))
  const w = 'width' in img ? img.width : 0
  const h = 'height' in img ? img.height : 0
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const cw = Math.round(w * scale), ch = Math.round(h * scale)
  const canvas = document.createElement('canvas')
  canvas.width = cw; canvas.height = ch
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img as CanvasImageSource, 0, 0, cw, ch)
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  if (bitmap) bitmap.close()
  return dataUrl.split(',')[1]
}

function loadImageElement(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Nu pot citi imaginea')) }
    img.src = url
  })
}

async function analyze<T>(mode: AiMode, base64: string, memberId: string | null): Promise<{ result: T; usage: AiUsage | null }> {
  const { data, error } = await supabase.functions.invoke('analyze-image', {
    body: { mode, image: base64, media_type: 'image/jpeg', member_id: memberId },
  })
  if (error) {
    // supabase-js pune mesajul serverului în context (Response); încercăm să-l citim
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') { const j = await ctx.json(); if (j?.error) msg = j.error }
    } catch { /* păstrăm mesajul generic */ }
    throw new Error(msg)
  }
  if (!data?.result) throw new Error(data?.error ?? 'Răspuns gol de la server')
  return { result: data.result as T, usage: data.usage ?? null }
}

export async function analyzeShelf(file: Blob, memberId: string | null) {
  const b64 = await resizeImageToBase64(file, 2000, 0.85) // rafturile au nevoie de mai multă rezoluție
  const { result, usage } = await analyze<{ books: ShelfBook[] }>('shelf', b64, memberId)
  return { books: (result.books ?? []).filter(b => b?.title), usage }
}

export async function analyzeCover(file: Blob, memberId: string | null) {
  const b64 = await resizeImageToBase64(file, 1400, 0.82)
  const { result, usage } = await analyze<CoverData>('cover', b64, memberId)
  return { cover: result, usage }
}

export async function analyzeSchoolList(file: Blob, memberId: string | null) {
  const b64 = await resizeImageToBase64(file, 2000, 0.85)
  const { result, usage } = await analyze<{ items: SchoolItem[] }>('school_list', b64, memberId)
  return { items: (result.items ?? []).filter(i => i?.title), usage }
}

/** Deschide camera/galeria și întoarce fișierul ales (sau null dacă utilizatorul renunță). */
export function pickImage(capture = true): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (capture) input.setAttribute('capture', 'environment')
    input.onchange = () => resolve(input.files?.[0] ?? null)
    // dacă utilizatorul închide dialogul fără să aleagă, onchange nu se declanșează pe toate browserele
    window.addEventListener('focus', () => setTimeout(() => resolve(input.files?.[0] ?? null), 800), { once: true })
    input.click()
  })
}
