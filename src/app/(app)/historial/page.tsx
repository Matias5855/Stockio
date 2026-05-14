'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getTheme, COLORS } from '@/lib/theme'
import type { AccionHistorial, EntidadHistorial } from '@/lib/historial'

type Entry = {
  id: string
  user_name: string | null
  accion: AccionHistorial
  entidad: EntidadHistorial
  entidad_id: string | null
  descripcion: string
  metadata: Record<string, unknown> | null
  created_at: string
}

const ICONO: Record<EntidadHistorial, string> = {
  producto: '📦',
  venta: '🧾',
  cuota_plan: '⊟',
  cuota_pago: '💰',
  movimiento: '💸',
  empleado: '👤',
  organizacion: '🏢',
}

const ACCION_LABEL: Record<AccionHistorial, string> = {
  crear: 'Creó',
  editar: 'Editó',
  eliminar: 'Eliminó',
  cobrar: 'Cobró',
  cambiar_estado: 'Cambió estado de',
  login: 'Inició sesión en',
}

const ACCION_COLOR: Record<AccionHistorial, { bg: string; text: string }> = {
  crear:          COLORS.badge.ok,
  editar:         { bg: '#DBEAFE', text: '#1E40AF' },
  eliminar:       COLORS.badge.error,
  cobrar:         COLORS.badge.ok,
  cambiar_estado: COLORS.badge.bajo,
  login:          { bg: '#F3F4F6', text: '#6B7280' },
}

export default function HistorialPage() {
  const supabase = useMemo(() => createClient(), [])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEntidad, setFiltroEntidad] = useState<string>('todos')
  const [filtroAccion, setFiltroAccion] = useState<string>('todos')

  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const sync = () => setIsDark(localStorage.getItem('sf_dark_mode') === '1')
    sync()
    const interval = setInterval(sync, 500)
    return () => clearInterval(interval)
  }, [])
  const t = useMemo(() => getTheme(isDark), [isDark])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const orgId = localStorage.getItem('sf_org_id')
    if (!orgId) { setLoading(false); return }
    const { data } = await supabase
      .from('historial')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200)
    setEntries((data ?? []) as Entry[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const filtered = entries.filter(e =>
    (filtroEntidad === 'todos' || e.entidad === filtroEntidad) &&
    (filtroAccion === 'todos' || e.accion === filtroAccion)
  )

  const fmtFecha = (iso: string) => {
    const d = new Date(iso)
    const hoy = new Date()
    const ayer = new Date(); ayer.setDate(hoy.getDate() - 1)
    const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
    const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    if (sameDay(d, hoy)) return `Hoy ${hora}`
    if (sameDay(d, ayer)) return `Ayer ${hora}`
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' + hora
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>
            Historial de cambios
          </p>
          <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>
            Últimas {entries.length} acciones registradas
          </p>
        </div>
        <button
          onClick={fetchEntries}
          style={{
            background: '#CCFBF1', border: `1px solid ${COLORS.primary}`, borderRadius: 8,
            padding: '8px 16px', cursor: 'pointer', color: COLORS.primary,
            fontSize: 13, fontWeight: 700,
          }}
        >
          🔄 Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div style={{
        background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 12,
        padding: 14, marginBottom: 14, display: 'flex', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Categoría:</span>
          <select
            value={filtroEntidad}
            onChange={e => setFiltroEntidad(e.target.value)}
            style={{
              background: t.card, border: `1px solid ${t.border}`, borderRadius: 7,
              padding: '7px 12px', color: t.text, fontSize: 13, outline: 'none',
            }}
          >
            <option value="todos">Todas</option>
            <option value="producto">Productos</option>
            <option value="venta">Ventas</option>
            <option value="cuota_plan">Planes de cuotas</option>
            <option value="cuota_pago">Cobros de cuotas</option>
            <option value="movimiento">Movimientos</option>
            <option value="empleado">Empleados</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Acción:</span>
          <select
            value={filtroAccion}
            onChange={e => setFiltroAccion(e.target.value)}
            style={{
              background: t.card, border: `1px solid ${t.border}`, borderRadius: 7,
              padding: '7px 12px', color: t.text, fontSize: 13, outline: 'none',
            }}
          >
            <option value="todos">Todas</option>
            <option value="crear">Crear</option>
            <option value="editar">Editar</option>
            <option value="eliminar">Eliminar</option>
            <option value="cobrar">Cobrar</option>
            <option value="cambiar_estado">Cambiar estado</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      <div style={{ background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <p style={{ padding: 40, textAlign: 'center', color: t.textMuted }}>Cargando…</p>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ fontSize: 36, marginBottom: 12 }}>📋</p>
            <p style={{ margin: 0, color: t.text, fontSize: 15, fontWeight: 600 }}>
              {entries.length === 0 ? 'Sin actividad registrada todavía' : 'Sin resultados para estos filtros'}
            </p>
            <p style={{ margin: '4px 0 0', color: t.textMuted, fontSize: 13 }}>
              {entries.length === 0 ? 'Las acciones de tu equipo aparecerán acá.' : 'Probá cambiando los filtros.'}
            </p>
          </div>
        ) : (
          filtered.map((e, i) => {
            const color = ACCION_COLOR[e.accion]
            const esUltimo = i === filtered.length - 1
            return (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                padding: '14px 20px',
                borderBottom: esUltimo ? 'none' : `1px solid ${t.borderCard}`,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: color.bg, color: color.text,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>
                  {ICONO[e.entidad] ?? '•'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                    <span style={{ color: t.text, fontWeight: 700, fontSize: 14 }}>
                      {e.user_name ?? 'Usuario'}
                    </span>
                    <span style={{
                      background: color.bg, color: color.text,
                      padding: '2px 8px', borderRadius: 5,
                      fontSize: 11, fontWeight: 700,
                    }}>
                      {ACCION_LABEL[e.accion]}
                    </span>
                    <span style={{
                      fontSize: 11, color: t.textMuted, textTransform: 'capitalize',
                      background: isDark ? 'rgba(94,234,212,0.06)' : '#F0FDFA',
                      padding: '2px 8px', borderRadius: 5, fontWeight: 600,
                    }}>
                      {e.entidad.replace('_', ' ')}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: t.text, fontSize: 13, lineHeight: 1.5 }}>
                    {e.descripcion}
                  </p>
                </div>
                <div style={{
                  fontSize: 11, color: t.textMuted, whiteSpace: 'nowrap',
                  flexShrink: 0, paddingTop: 4,
                }}>
                  {fmtFecha(e.created_at)}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
