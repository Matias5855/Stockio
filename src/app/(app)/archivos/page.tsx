'use client'
import { useRef, useState, useEffect, useMemo } from 'react'
import { useArchivos } from '@/lib/hooks/useArchivos'
import { getTheme, COLORS } from '@/lib/theme'

export default function ArchivosPage() {
  const { archivos, loading, uploadArchivo, deleteArchivo } = useArchivos()
  const fileRef = useRef<HTMLInputElement>(null)

  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const sync = () => setIsDark(localStorage.getItem('sf_dark_mode') === '1')
    sync()
    const interval = setInterval(sync, 500)
    return () => clearInterval(interval)
  }, [])
  const t = useMemo(() => getTheme(isDark), [isDark])

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    for (const file of files) {
      try { await uploadArchivo(file) } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Error subiendo')
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const iconBadge = (tipo: string): React.CSSProperties => {
    const palette =
      tipo === 'pdf' ? { bg: COLORS.badge.error.bg, color: COLORS.badge.error.text } :
      tipo === 'img' ? { bg: '#DBEAFE', color: '#1E40AF' } :
      { bg: COLORS.badge.bajo.bg, color: COLORS.badge.bajo.text }
    return {
      width: 44, height: 44, borderRadius: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 800,
      background: palette.bg, color: palette.color,
      flexShrink: 0,
    }
  }

  const fmtSize = (b: number | null) => !b ? '' :
    b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>Archivos</p>
          <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>{archivos.length} archivos almacenados</p>
        </div>
        <div>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={upload} />
          <button onClick={() => fileRef.current?.click()} style={{
            background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
            boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
          }}>↑ Subir archivo</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total archivos', value: archivos.length,                          palette: COLORS.metric.ventas },
          { label: 'PDFs',           value: archivos.filter(a => a.tipo === 'pdf').length, palette: COLORS.metric.pendiente },
          { label: 'Imágenes',       value: archivos.filter(a => a.tipo === 'img').length, palette: COLORS.metric.saldo },
        ].map(m => (
          <div key={m.label} style={{
            background: m.palette.bg, border: `1px solid ${m.palette.border}`,
            borderRadius: 12, padding: '16px 18px',
          }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: m.palette.label, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {m.label}
            </p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: m.palette.value }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 12, padding: '8px 20px' }}>
        {loading ? (
          <p style={{ padding: 40, textAlign: 'center', color: t.textMuted }}>Cargando…</p>
        ) : archivos.length === 0 ? (
          <p style={{ padding: 40, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
            No hay archivos. Subí uno para comenzar.
          </p>
        ) : (
          archivos.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 0', borderBottom: `1px solid ${t.borderCard}`,
            }}>
              <div style={iconBadge(a.tipo)}>{a.tipo.toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.nombre}
                </p>
                <p style={{ margin: '3px 0 0', fontSize: 11, color: t.textMuted }}>
                  {fmtSize(a.size_bytes)} · {a.created_at?.split('T')[0]} ·{' '}
                  <span style={{ color: COLORS.primary, fontWeight: 600 }}>{a.categoria}</span>
                </p>
              </div>
              {a.url && (
                <a href={a.url} target="_blank" rel="noreferrer" style={{
                  color: COLORS.primary, fontSize: 12, textDecoration: 'none',
                  fontWeight: 600, padding: '6px 12px', borderRadius: 6,
                  background: '#CCFBF1',
                }}>
                  ↗ Ver
                </a>
              )}
              <button onClick={() => { if (confirm('¿Eliminar este archivo?')) deleteArchivo(a.id, a.storage_path) }} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: t.textMuted, fontSize: 20, padding: 6, borderRadius: 6, lineHeight: 1,
              }}
                onMouseEnter={e => { e.currentTarget.style.color = COLORS.danger; e.currentTarget.style.background = '#FFF1F2' }}
                onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; e.currentTarget.style.background = 'none' }}
              >×</button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
