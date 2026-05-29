'use client'
import { useEffect, useRef, useState } from 'react'

// BarcodeDetector es una API del browser que TS no incluye en su lib DOM.
// Definimos el minimo que usamos para no recurrir a `any`.
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

interface Props {
  onDetected: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanningRef = useRef(true)
  const [status, setStatus] = useState<'loading' | 'scanning' | 'detected' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let animFrame: number

    const init = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setErrorMsg('Tu navegador no soporta acceso a la cámara.')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        streamRef.current = stream

        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setStatus('scanning')

        // Intentar BarcodeDetector nativo primero (Chrome Android/Desktop 83+)
        const hasNative = 'BarcodeDetector' in window
        let detector: BarcodeDetectorLike | null = null

        if (hasNative) {
          try {
            const Ctor = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector
            detector = new Ctor({
              formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'itf', 'data_matrix'],
            })
          } catch { detector = null }
        }

        const scan = async () => {
          if (!scanningRef.current || !videoRef.current || !canvasRef.current) return

          const video = videoRef.current
          const canvas = canvasRef.current
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (!ctx || video.readyState < 2) {
            animFrame = requestAnimationFrame(scan)
            return
          }

          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx.drawImage(video, 0, 0)

          // 1. Intentar con BarcodeDetector nativo
          if (detector) {
            try {
              const codes = await detector.detect(canvas)
              if (codes.length > 0) {
                handleDetected(codes[0].rawValue)
                return
              }
            } catch {}
          }

          // 2. Intentar con zbar-wasm (EAN-13, Code128, QR, etc.)
          try {
            const { scanImageData } = await import('@undecaf/zbar-wasm')
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const results = await scanImageData(imageData)
            if (results.length > 0) {
              handleDetected(results[0].decode())
              return
            }
          } catch {}

          // 3. Intentar con jsQR como último fallback (solo QR)
          try {
            const jsQR = (await import('jsqr')).default
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(imageData.data, imageData.width, imageData.height)
            if (code) {
              handleDetected(code.data)
              return
            }
          } catch {}

          animFrame = requestAnimationFrame(scan)
        }

        animFrame = requestAnimationFrame(scan)

      } catch (e: unknown) {
        setStatus('error')
        const name = e instanceof Error ? e.name : ''
        if (name === 'NotAllowedError') {
          setErrorMsg('Permiso denegado. Hacé click en 🔒 en la barra del navegador → Cámara → Permitir → Recargá la página.')
        } else if (name === 'NotFoundError') {
          setErrorMsg('No se encontró ninguna cámara en este dispositivo.')
        } else {
          const msg = e instanceof Error ? (e.message || e.name) : String(e)
          setErrorMsg('No se pudo acceder a la cámara: ' + msg)
        }
      }
    }

    init()

    return () => {
      scanningRef.current = false
      cancelAnimationFrame(animFrame)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
    // El effect inicializa la camara y debe correr SOLO al montar. Agregar
    // handleDetected (que se recrea en cada render) reiniciaria el stream de
    // la camara constantemente. handleDetected lee todo via refs/props, asi
    // que la version capturada al montar sigue siendo valida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDetected = (value: string) => {
    if (!scanningRef.current) return
    scanningRef.current = false
    setStatus('detected')
    streamRef.current?.getTracks().forEach(t => t.stop())
    setTimeout(() => onDetected(value), 400)
  }

  if (status === 'error') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#17171C', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>📷</p>
          <p style={{ fontWeight: 700, color: '#F0EFF8', marginBottom: 12 }}>Sin acceso a la cámara</p>
          <p style={{ color: '#E05555', fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>{errorMsg}</p>
          <div style={{ background: 'rgba(124,111,224,0.1)', border: '1px solid rgba(124,111,224,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, textAlign: 'left' }}>
            <p style={{ fontSize: 12, color: '#B4A8FF', fontWeight: 600, marginBottom: 6 }}>💡 Alternativa: Lector USB</p>
            <p style={{ fontSize: 12, color: '#7A7A95', lineHeight: 1.6, margin: 0 }}>
              Conectá tu lector de código de barras USB, hacé click en el campo de búsqueda del inventario y escaneá — funciona como teclado automáticamente.
            </p>
          </div>
          <button onClick={onClose} style={{ background: '#7C6FE0', border: 'none', borderRadius: 8, padding: '11px', color: '#fff', cursor: 'pointer', fontWeight: 600, width: '100%', fontSize: 14 }}>
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <p style={{ color: '#F0EFF8', fontWeight: 700, fontSize: 16, margin: 0 }}>
        {status === 'loading' ? 'Iniciando cámara...' : status === 'detected' ? '✓ Código detectado' : 'Escaneá el código'}
      </p>

      <div style={{ position: 'relative', width: '90%', maxWidth: 340, aspectRatio: '4/3', borderRadius: 16, overflow: 'hidden', border: `3px solid ${status === 'detected' ? '#22C97A' : '#7C6FE0'}`, background: '#000' }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {status === 'scanning' && (
          <>
            {[
              { top: 12, left: 12, borderTop: '3px solid #7C6FE0', borderLeft: '3px solid #7C6FE0' },
              { top: 12, right: 12, borderTop: '3px solid #7C6FE0', borderRight: '3px solid #7C6FE0' },
              { bottom: 12, left: 12, borderBottom: '3px solid #7C6FE0', borderLeft: '3px solid #7C6FE0' },
              { bottom: 12, right: 12, borderBottom: '3px solid #7C6FE0', borderRight: '3px solid #7C6FE0' },
            ].map((s, i) => (
              <div key={i} style={{ position: 'absolute', width: 24, height: 24, ...s }} />
            ))}
            <div style={{ position: 'absolute', left: '8%', right: '8%', height: 2, background: 'rgba(124,111,224,0.9)', boxShadow: '0 0 10px #7C6FE0', animation: 'scanline 1.8s ease-in-out infinite alternate' }} />
          </>
        )}

        {status === 'detected' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(34,201,122,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#22C97A', borderRadius: '50%', width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>✓</div>
          </div>
        )}
      </div>

      <style>{`@keyframes scanline { from { top: 15% } to { top: 80% } }`}</style>

      <p style={{ color: '#7A7A95', fontSize: 13, margin: 0, textAlign: 'center', maxWidth: 280 }}>
        {status === 'scanning' ? 'Apuntá al código de barras o QR del producto' : ''}
      </p>

      <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '9px 28px', color: '#F0EFF8', cursor: 'pointer', fontSize: 13 }}>
        Cancelar
      </button>
    </div>
  )
}