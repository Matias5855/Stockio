'use client'
import { useEffect, useRef, useState } from 'react'

interface Props {
  onDetected: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanningRef = useRef(true)
  const [error, setError] = useState<string | null>(null)
  const [detected, setDetected] = useState(false)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Tu navegador no soporta acceso a la cámara.')
      return
    }

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      }
    })
    .then(stream => {
      streamRef.current = stream
      if (!videoRef.current) return
      videoRef.current.srcObject = stream
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play()
        setScanning(true)
        startScanning()
      }
    })
    .catch(e => {
      if (e.name === 'NotAllowedError') {
        setError('Permiso denegado. En Chrome: hacé click en el candado (🔒) de la barra de direcciones → Permisos del sitio → Cámara → Permitir.')
      } else if (e.name === 'NotFoundError') {
        setError('No se encontró ninguna cámara.')
      } else {
        setError('Error al acceder a la cámara: ' + e.message)
      }
    })

    return () => {
      scanningRef.current = false
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const startScanning = () => {
    const tick = async () => {
      if (!scanningRef.current) return
      if (!videoRef.current || !canvasRef.current) {
        requestAnimationFrame(tick)
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
        requestAnimationFrame(tick)
        return
      }

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Intentar con BarcodeDetector nativo primero (Chrome Android, Edge)
      if ('BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'itf'],
          })
          const codes = await detector.detect(canvas)
          if (codes.length > 0 && scanningRef.current) {
            handleDetected(codes[0].rawValue)
            return
          }
        } catch {}
      }

      // Fallback con jsQR para QR codes
      try {
        const jsQR = (await import('jsqr')).default
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height)
        if (code && scanningRef.current) {
          handleDetected(code.data)
          return
        }
      } catch {}

      requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  }

  const handleDetected = (value: string) => {
    if (!scanningRef.current) return
    scanningRef.current = false
    setDetected(true)
    streamRef.current?.getTracks().forEach(t => t.stop())
    setTimeout(() => onDetected(value), 300)
  }

  if (error) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#17171C', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>📷</p>
          <p style={{ color: '#E05555', fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>{error}</p>
          <p style={{ fontSize: 12, color: '#7A7A95', lineHeight: 1.6, marginBottom: 20 }}>
            <strong style={{ color: '#F0EFF8' }}>Alternativa:</strong> conectá un lector USB de código de barras y escaneá directamente en el campo de búsqueda de inventario.
          </p>
          <button onClick={onClose} style={{ background: '#7C6FE0', border: 'none', borderRadius: 8, padding: '10px 24px', color: '#fff', cursor: 'pointer', fontWeight: 600, width: '100%' }}>
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <p style={{ color: '#F0EFF8', fontWeight: 700, fontSize: 16, margin: 0 }}>Escanear código</p>

      <div style={{ position: 'relative', width: '90%', maxWidth: 340, borderRadius: 16, overflow: 'hidden', border: `3px solid ${detected ? '#22C97A' : '#7C6FE0'}`, background: '#000' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: '100%', display: 'block', minHeight: 240 }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Marco de escaneo */}
        {scanning && !detected && (
          <>
            <div style={{ position: 'absolute', inset: 0, border: '2px solid transparent' }}>
              {/* Esquinas */}
              {[
                { top: 12, left: 12, borderTop: '3px solid #7C6FE0', borderLeft: '3px solid #7C6FE0' },
                { top: 12, right: 12, borderTop: '3px solid #7C6FE0', borderRight: '3px solid #7C6FE0' },
                { bottom: 12, left: 12, borderBottom: '3px solid #7C6FE0', borderLeft: '3px solid #7C6FE0' },
                { bottom: 12, right: 12, borderBottom: '3px solid #7C6FE0', borderRight: '3px solid #7C6FE0' },
              ].map((style, i) => (
                <div key={i} style={{ position: 'absolute', width: 24, height: 24, ...style }} />
              ))}
            </div>
            {/* Línea animada */}
            <div style={{ position: 'absolute', left: '10%', right: '10%', height: 2, background: 'rgba(124,111,224,0.8)', boxShadow: '0 0 8px #7C6FE0', animation: 'scanline 1.5s ease-in-out infinite alternate' }} />
          </>
        )}

        {detected && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(34,201,122,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#22C97A', borderRadius: 50, width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>✓</div>
          </div>
        )}
      </div>

      <style>{`@keyframes scanline { from { top: 20% } to { top: 78% } }`}</style>

      <p style={{ color: '#7A7A95', fontSize: 13, margin: 0, textAlign: 'center' }}>
        {!scanning && !detected ? 'Iniciando cámara...' : detected ? 'Código detectado ✓' : 'Apuntá al código de barras o QR'}
      </p>

      <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '9px 24px', color: '#F0EFF8', cursor: 'pointer', fontSize: 13 }}>
        Cancelar
      </button>
    </div>
  )
}