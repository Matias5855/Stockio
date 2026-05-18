'use client'
import { useState, useEffect, useMemo } from 'react'
import { getTheme, COLORS } from '@/lib/theme'

interface Props {
  onExcelClick: () => void
  onPDFClick: () => void
  small?: boolean
}

export default function ExportarBtn({ onExcelClick, onPDFClick, small }: Props) {
  const [open, setOpen] = useState(false)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const sync = () => setIsDark(localStorage.getItem('stk_dark_mode') === '1')
    sync()
    const interval = setInterval(sync, 500)
    return () => clearInterval(interval)
  }, [])
  const t = useMemo(() => getTheme(isDark), [isDark])

  const btn: React.CSSProperties = {
    background: '#CCFBF1',
    border: `1px solid ${COLORS.primary}`,
    borderRadius: 8,
    padding: small ? '6px 12px' : '10px 16px',
    color: COLORS.primary,
    fontSize: small ? 12 : 13,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }

  const item: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: t.text,
    fontSize: 13,
    borderRadius: 7,
    textAlign: 'left',
    fontWeight: 500,
  }

  return (
    <div style={{ position: 'relative' }}>
      <button style={btn} onClick={() => setOpen(v => !v)}>
        ↓ Exportar
      </button>

      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute',
            right: 0,
            top: '110%',
            zIndex: 100,
            background: t.card,
            border: `1px solid ${t.borderCard}`,
            borderRadius: 10,
            padding: 6,
            minWidth: 180,
            boxShadow: isDark ? '0 12px 32px rgba(0,0,0,0.5)' : '0 12px 32px rgba(4,47,46,0.12)',
          }}>
            <button
              onClick={() => { onExcelClick(); setOpen(false) }}
              style={item}
              onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(94,234,212,0.06)' : '#F0FDFA')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 16 }}>📊</span> Excel (.xlsx)
            </button>
            <button
              onClick={() => { onPDFClick(); setOpen(false) }}
              style={item}
              onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(94,234,212,0.06)' : '#F0FDFA')}
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
