'use client'
import { useRef } from 'react'
import { useArchivos } from '@/lib/hooks/useArchivos'

export default function ArchivosPage() {
  const { archivos, loading, uploadArchivo, deleteArchivo } = useArchivos()
  const fileRef = useRef<HTMLInputElement>(null)

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    for (const file of files) {
      try { await uploadArchivo(file) } catch (err: any) { alert(err.message) }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const iconStyle = (tipo: string) => ({
    width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
    background: tipo === 'pdf' ? 'rgba(224,85,85,0.12)' : tipo === 'img' ? 'rgba(124,111,224,0.15)' : 'rgba(224,160,48,0.12)',
    color: tipo === 'pdf' ? '#E05555' : tipo === 'img' ? '#7C6FE0' : '#E0A030',
    flexShrink: 0,
  })

  const fmtSize = (b: number | null) => !b ? '' : b > 1024*1024 ? (b/1024/1024).toFixed(1)+' MB' : Math.round(b/1024)+' KB'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Archivos</p>
          <p style={{ margin: 0, fontSize: 13, color: '#7A7A95' }}>{archivos.length} archivos almacenados</p>
        </div>
        <div>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={upload} />
          <button onClick={() => fileRef.current?.click()} style={{ background: '#7C6FE0', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>↑ Subir archivo</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total archivos', value: archivos.length },
          { label: 'PDFs', value: archivos.filter(a => a.tipo === 'pdf').length },
          { label: 'Imágenes', value: archivos.filter(a => a.tipo === 'img').length },
        ].map(m => (
          <div key={m.label} style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '18px 20px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#7A7A95', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '8px 20px' }}>
        {loading ? <p style={{ padding: 40, textAlign: 'center', color: '#7A7A95' }}>Cargando...</p>
          : archivos.length === 0 ? <p style={{ padding: 40, textAlign: 'center', color: '#7A7A95' }}>No hay archivos. Subí uno para comenzar.</p>
          : archivos.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={iconStyle(a.tipo)}>{a.tipo.toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</p>
                <p style={{ margin: '3px 0 0', fontSize: 11, color: '#7A7A95' }}>{fmtSize(a.size_bytes)} · {a.created_at?.split('T')[0]} · <span style={{ color: '#7C6FE0' }}>{a.categoria}</span></p>
              </div>
              {a.url && <a href={a.url} target="_blank" rel="noreferrer" style={{ color: '#7A7A95', fontSize: 12, textDecoration: 'none' }}>↗ Ver</a>}
              <button onClick={() => deleteArchivo(a.id, a.storage_path)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E05555', fontSize: 18, padding: 4 }}>×</button>
            </div>
          ))
        }
      </div>
    </div>
  )
}