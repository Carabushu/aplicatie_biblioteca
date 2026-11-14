import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { isValidIsbn, normalizeIsbn } from '../lib/catalog'

interface Props {
  onDetected: (isbn: string) => void
  onClose: () => void
}

// Tipuri minimale pentru API-ul nativ (Chrome Android)
interface NativeDetector { detect(src: ImageBitmapSource): Promise<{ rawValue: string }[]> }
interface NativeDetectorCtor {
  new (opts?: { formats: string[] }): NativeDetector
  getSupportedFormats(): Promise<string[]>
}

/**
 * Scanner de coduri de bare ISBN (EAN-13).
 * Pe Chrome Android folosește BarcodeDetector nativ (rapid); altfel ZXing.
 */
export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [engine, setEngine] = useState<'nativ' | 'zxing' | null>(null)
  const doneRef = useRef(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let controls: IScannerControls | null = null
    let raf = 0
    let cancelled = false

    const finish = (raw: string) => {
      const isbn = normalizeIsbn(raw)
      if (doneRef.current || !isValidIsbn(isbn)) return
      doneRef.current = true
      if (navigator.vibrate) navigator.vibrate(80)
      onDetected(isbn)
    }

    const start = async () => {
      const video = videoRef.current
      if (!video) return
      const Native = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector
      let useNative = false
      if (Native) {
        try {
          const f = await Native.getSupportedFormats()
          useNative = f.includes('ean_13')
        } catch { useNative = false }
      }

      try {
        if (useNative && Native) {
          setEngine('nativ')
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          })
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
          video.srcObject = stream
          await video.play()
          const det = new Native({ formats: ['ean_13', 'ean_8', 'upc_a'] })
          const tick = async () => {
            if (cancelled || doneRef.current) return
            try {
              if (video.readyState >= 2) {
                const codes = await det.detect(video)
                for (const c of codes) finish(c.rawValue)
              }
            } catch { /* cadru nevalid — încercăm din nou */ }
            raf = window.setTimeout(tick, 150)
          }
          void tick()
        } else {
          setEngine('zxing')
          const hints = new Map()
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A])
          hints.set(DecodeHintType.TRY_HARDER, true)
          const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 })
          controls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' } }, audio: false },
            video,
            result => { if (result) finish(result.getText()) },
          )
        }
      } catch (e) {
        setError(e instanceof Error && e.name === 'NotAllowedError'
          ? 'Nu am voie să folosesc camera. Permite accesul la cameră din setările browserului.'
          : 'Nu pot porni camera. Poți tasta codul ISBN manual.')
      }
    }

    void start()
    return () => {
      cancelled = true
      clearTimeout(raf)
      controls?.stop()
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [onDetected])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-3 text-white">
        <span className="font-semibold">Scanează codul de bare</span>
        <button onClick={onClose} className="rounded-full bg-white/20 px-4 py-2">Închide</button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-32 w-[80%] rounded-xl border-4 border-amber-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
      </div>
      <div className="p-4 text-center text-sm text-white/80">
        {error ?? `Încadrează codul de bare de pe spatele cărții${engine ? ` (${engine})` : ''}`}
      </div>
    </div>
  )
}
