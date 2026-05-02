'use client'
import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { NotFoundException } from '@zxing/library'

interface Props {
  onDetected: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)

  useEffect(() => {
  if (!videoRef.current) return
  // Verificar soporte
  if (!navigator.mediaDevices?.getUserMedia) {
    setError('Tu navegador no soporta el acceso a la cámara')
    return
  }
  const reader = new BrowserMultiFormatReader()
   // Pequeño delay para asegurar que el video está montado
  const timer = setTimeout(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(() => {
      reader.decodeFromVideoDevice(undefined, videoRef.current!, (result, err) => { 
        if (result && scanning) {
          setScanning(false)
          onDetected(result.getText())
        }
      }).catch(e => setError('No se pudo iniciar la cámara: ' + e.message))
    })
    .catch(e => {
      if (e.name === 'NotAllowedError') setError('Permiso de cámara denegado. Habilitalo en la configuración del navegador.')
        else if (e.name === 'NotFoundError') setError('No se encontró ninguna cámara en este dispositivo.')
        else setError('Error de cámara: ' + e.message)
    })
  }, 300)
  return () => {
    clearTimeout(timer)
    BrowserMultiFormatReader.releaseAllStreams()
  }
}, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
      <div style={{ position: 'relative', width: 320, borderRadius: 16, overflow: 'hidden', border: '2px solid #7C6FE0' }}>
        <video ref={videoRef} style={{ width: '100%', display: 'block' }} />
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: '#7C6FE0', opacity: 0.8, animation: 'scan 1.5s ease-in-out infinite alternate' }} />
      </div>
      <style>{`@keyframes scan { from { top: 20% } to { top: 80% } }`}</style>
      {error
        ? <p style={{ color: '#E05555', fontSize: 14 }}>{error}</p>
        : <p style={{ color: '#7A7A95', fontSize: 13 }}>Apuntá la cámara al código de barras</p>
      }
      <button onClick={onClose} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '8px 20px', color: '#F0EFF8', cursor: 'pointer', fontSize: 13 }}>
        Cancelar
      </button>
    </div>
  )
}