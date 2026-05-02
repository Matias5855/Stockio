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
  const animRef = useRef<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [detected, setDetected] = useState(false)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    // Verificar si BarcodeDetector está disponible (Chrome 83+, Edge, Android)
    const hasBarcodeDetector = 'BarcodeDetector' in window
    const hasGetUserMedia = !!navigator.mediaDevices?.getUserMedia

    if (!hasGetUserMedia) {
      setError('Tu navegador no soporta acceso a la cámara.')
      return
    }

    let barcodeDetector: any = null

    if (hasBarcodeDetector) {
      try {
        barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'],
        })
      } catch {}
    }

    // Iniciar cámara
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      }
    })
    .then(stream => {
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }

      if (barcodeDetector) {
        // Usar BarcodeDetector nativo
        const scan = async () => {
          if (!videoRef.current || detected) return
          try {
            const codes = await barcodeDetector.detect(videoRef.current)
            if (codes.length > 0) {
              setDetected(true)
              onDetected(codes[0].rawValue)
              return
            }
          } catch {}
          animRef.current = requestAnimationFrame(scan)
        }
        videoRef.current?.addEventListener('playing', () => {
          animRef.current = requestAnimationFrame(scan)
        })
      } else {
        // Fallback: mostrar mensaje para lector USB
        setSupported(false)
      }
    })
    .catch(e => {
      if (e.name === 'NotAllowedError') {
        setError('Permiso de cámara denegado. Habilitá la cámara en Configuración del navegador → Privacidad → Cámara.')
      } else if (e.name === 'NotFoundError') {
        setError('No se encontró ninguna cámara en este dispositivo.')
      } else {
        setError('No se pudo acceder a la cámara: ' + e.message)
      }
    })

    return () => {
      cancelAnimationFrame(animRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // Si el navegador no soporta BarcodeDetector, mostrar input para lector USB
  if (!supported && !error) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20, padding: 24 }}>
        <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>🔌</p>
          <p style={{ fontWeight: 700, fontSize: 16, color: '#F0EFF8', marginBottom: 8 }}>Usá tu lector USB</p>
          <p style={{ fontSize: 13, color: '#7A7A95', marginBottom: 20, lineHeight: 1.6 }}>
            Tu navegador no soporta escaneo por cámara. Conectá tu lector de código de barras USB y escaneá el producto — se cargará automáticamente.
          </p>
          <p style={{ fontSize: 12, color: '#7C6FE0', marginBottom: 20 }}>
            💡 Para escaneo por cámara usá Chrome en Android o Edge en Windows.
          </p>
          <button onClick={onClose} style={{ background: '#7C6FE0', border: 'none', borderRadius: 8, padding: '10px 24px', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            Entendido
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20, padding: 24 }}>
        <div style={{ background: '#17171C', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📷</p>
          <p style={{ color: '#E05555', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>{error}</p>
          <p style={{ fontSize: 12, color: '#7A7A95', marginBottom: 20 }}>
            También podés usar un <strong style={{ color: '#F0EFF8' }}>lector USB</strong> — conectalo y escaneá directamente en el campo de búsqueda.
          </p>
          <button onClick={onClose} style={{ background: '#7C6FE0', border: 'none', borderRadius: 8, padding: '10px 24px', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
      <div style={{ position: 'relative', width: 320, borderRadius: 16, overflow: 'hidden', border: `2px solid ${detected ? '#22C97A' : '#7C6FE0'}` }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', display: 'block' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {/* Línea de escaneo */}
        {!detected && (
          <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: '#7C6FE0', opacity: 0.8, animation: 'scan 1.5s ease-in-out infinite alternate' }} />
        )}
        {detected && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(34,201,122,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: '#22C97A', fontWeight: 700, fontSize: 18 }}>✓ Detectado</p>
          </div>
        )}
      </div>

      <style>{`@keyframes scan { from { top: 20% } to { top: 80% } }`}</style>
      <p style={{ color: '#7A7A95', fontSize: 13 }}>
        {detected ? 'Procesando...' : 'Apuntá la cámara al código de barras'}
      </p>
      <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '8px 20px', color: '#F0EFF8', cursor: 'pointer', fontSize: 13 }}>
        Cancelar
      </button>
    </div>
  )
}