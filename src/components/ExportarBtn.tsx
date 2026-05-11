'use client'
import { useState } from 'react'

interface Props {
  onExcelClick: () => void
  onPDFClick: () => void
  small?: boolean
}

export default function ExportarBtn({ onExcelClick, onPDFClick, small }: Props) {
  const [open, setOpen] = useState(false)

  const btn: React.CSSProperties = {
    background: 'rgba(124,111,224,0.12)',
    border: '1px solid rgba(124,111,224,0.3)',
    borderRadius: 8,
    padding: small ? '6px 12px' : '9px 16px',
    color: '#7C6FE0',
    fontSize: small ? 12 : 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }

  return (
    <div style={{ position: 'relative' }}>
      <button style={btn} onClick={() => setOpen(v => !v)}>
        ↓ Exportar
      </button>

      {open && (
        <>
          {/* Overlay para cerrar */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute', right: 0, top: '110%', zIndex: 100,
            background: '#17171C', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: 6, minWidth: 160,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <button
              onClick={() => { onExcelClick(); setOpen(false) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', color: '#F0EFF8', fontSize: 13, borderRadius: 7, textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 16 }}>📊</span> Excel (.xlsx)
            </button>
            <button
              onClick={() => { onPDFClick(); setOpen(false) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', color: '#F0EFF8', fontSize: 13, borderRadius: 7, textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 16 }}>📄</span> PDF
            </button>
          </div>
        </>
      )}
    </div>
  )
}