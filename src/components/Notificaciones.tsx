'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getTheme, COLORS } from '@/lib/theme'

type Notif = {
  id: string
  tipo: 'stock_bajo' | 'cuota_vencida' | 'pago_recibido' | 'trial' | 'sobreventa'
  titulo: string
  mensaje: string
  leida: boolean
  fecha: string
}

export default function Notificaciones() {
  const supabase = createClient()
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [open, setOpen] = useState(false)
  const [isDark, setIsDark] = useState(false)

  // Sincronizar con el toggle del layout
  useEffect(() => {
    const sync = () => setIsDark(localStorage.getItem('stk_dark_mode') === '1')
    sync()
    const onStorage = () => sync()
    window.addEventListener('storage', onStorage)
    const interval = setInterval(sync, 500)
    return () => { window.removeEventListener('storage', onStorage); clearInterval(interval) }
  }, [])

  const t = useMemo(() => getTheme(isDark), [isDark])

  useEffect(() => {
    generarNotifs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const generarNotifs = async () => {
    const orgId = localStorage.getItem('stk_org_id')
    if (!orgId) return

    const nuevas: Notif[] = []

    const { data: productos } = await supabase
      .from('productos')
      .select('nombre, cantidad, stock_minimo')
      .eq('org_id', orgId)
      .eq('activo', true)

    // Sobreventa: productos en NEGATIVO. Con el bloqueo de stock online, esto
    // solo ocurre cuando una venta offline se sincronizó sin stock disponible.
    // Es lo más urgente -> va primero y en rojo.
    const negativos = (productos ?? []).filter(p => p.cantidad < 0)
    if (negativos.length > 0) {
      nuevas.push({
        id: 'sobreventa',
        tipo: 'sobreventa',
        titulo: `${negativos.length} producto${negativos.length > 1 ? 's' : ''} vendido sin stock`,
        mensaje: `Quedaron en negativo (probablemente por ventas offline). Revisá y reponé: ${negativos.slice(0, 3).map(p => `${p.nombre}: ${p.cantidad}`).join(' · ')}`,
        leida: false,
        fecha: new Date().toISOString(),
      })
    }

    // Stock bajo (pero no negativo — eso ya lo cubre la alerta de sobreventa).
    const bajos = (productos ?? []).filter(p => p.cantidad >= 0 && p.cantidad <= p.stock_minimo)
    if (bajos.length > 0) {
      nuevas.push({
        id: 'stock-bajo',
        tipo: 'stock_bajo',
        titulo: `${bajos.length} producto${bajos.length > 1 ? 's' : ''} con stock bajo`,
        mensaje: bajos.slice(0, 3).map(p => `${p.nombre}: ${p.cantidad} u.`).join(' · '),
        leida: false,
        fecha: new Date().toISOString(),
      })
    }

    const { data: cuotasVencidas } = await supabase
      .from('cuota_pagos')
      .select('id')
      .eq('org_id', orgId)
      .eq('estado', 'vencida')

    if (cuotasVencidas && cuotasVencidas.length > 0) {
      nuevas.push({
        id: 'cuotas-vencidas',
        tipo: 'cuota_vencida',
        titulo: `${cuotasVencidas.length} cuota${cuotasVencidas.length > 1 ? 's' : ''} vencida${cuotasVencidas.length > 1 ? 's' : ''}`,
        mensaje: 'Hay cuotas sin cobrar que superaron su fecha de vencimiento',
        leida: false,
        fecha: new Date().toISOString(),
      })
    }

    const { data: suscripcion } = await supabase
      .from('suscripciones')
      .select('estado, trial_fin')
      .eq('org_id', orgId)
      .single()

    if (suscripcion?.estado === 'trial' && suscripcion?.trial_fin) {
      const diasRestantes = Math.ceil(
        (new Date(suscripcion.trial_fin).getTime() - Date.now()) / (1000 * 3600 * 24)
      )
      if (diasRestantes <= 7 && diasRestantes > 0) {
        nuevas.push({
          id: 'trial-vence',
          tipo: 'trial',
          titulo: `Tu prueba vence en ${diasRestantes} día${diasRestantes > 1 ? 's' : ''}`,
          mensaje: 'Agregá tu método de pago para continuar sin interrupciones',
          leida: false,
          fecha: new Date().toISOString(),
        })
      }
    }

    const { data: ventas } = await supabase
      .from('ventas')
      .select('total')
      .eq('org_id', orgId)
      .eq('estado', 'pendiente')

    if (ventas && ventas.length > 0) {
      const totalPendiente = ventas.reduce((a, v) => a + v.total, 0)
      nuevas.push({
        id: 'ventas-pendientes',
        tipo: 'pago_recibido',
        titulo: `${ventas.length} venta${ventas.length > 1 ? 's' : ''} pendiente${ventas.length > 1 ? 's' : ''} de cobro`,
        mensaje: `Total por cobrar: $${totalPendiente.toLocaleString('es-AR')}`,
        leida: false,
        fecha: new Date().toISOString(),
      })
    }

    setNotifs(nuevas)
  }

  const iconos: Record<string, string> = {
    stock_bajo: '📦',
    cuota_vencida: '⏰',
    pago_recibido: '💰',
    trial: '⚡',
    sobreventa: '⚠️',
  }

  // Tonos del color por tipo
  const tinte: Record<string, string> = {
    stock_bajo:    COLORS.warning,
    cuota_vencida: COLORS.danger,
    pago_recibido: COLORS.secondary,
    trial:         COLORS.primary,
    sobreventa:    COLORS.danger,
  }

  const sinLeer = notifs.filter(n => !n.leida).length

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: t.textMuted,
          padding: 6,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          borderRadius: 8,
        }}
        onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : '#CCFBF1'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        aria-label="Notificaciones"
      >
        <span style={{ fontSize: 20 }}>🔔</span>
        {sinLeer > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: COLORS.danger, color: '#fff',
            borderRadius: '50%', width: 16, height: 16,
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `2px solid ${t.card}`,
          }}>
            {sinLeer}
          </span>
        )}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: '110%', zIndex: 100,
            background: t.card,
            border: `1px solid ${t.borderCard}`,
            borderRadius: 14, width: 340, maxHeight: 420, overflowY: 'auto',
            boxShadow: isDark ? '0 8px 40px rgba(0,0,0,0.5)' : '0 12px 32px rgba(4,47,46,0.12)',
          }}>
            <div style={{
              padding: '14px 16px',
              borderBottom: `1px solid ${t.borderCard}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: t.text }}>Notificaciones</p>
              {sinLeer > 0 && (
                <button
                  onClick={() => setNotifs(n => n.map(x => ({ ...x, leida: true })))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.primary, fontSize: 12, fontWeight: 600 }}
                >
                  Marcar todo leído
                </button>
              )}
            </div>

            {notifs.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 28, margin: '0 0 8px' }}>✅</p>
                <p style={{ margin: 0, color: t.textMuted, fontSize: 13 }}>Todo en orden, sin alertas</p>
              </div>
            ) : (
              notifs.map(n => (
                <div
                  key={n.id}
                  onClick={() => setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, leida: true } : x))}
                  style={{
                    padding: '14px 16px',
                    borderBottom: `1px solid ${t.borderCard}`,
                    cursor: 'pointer',
                    background: n.leida ? 'transparent' : (isDark ? 'rgba(13,148,136,0.08)' : '#F0FDFA'),
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: `${tinte[n.tipo]}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18,
                  }}>
                    {iconos[n.tipo]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: '0 0 3px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: n.leida ? t.textMuted : t.text,
                    }}>
                      {n.titulo}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
                      {n.mensaje}
                    </p>
                  </div>
                  {!n.leida && (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: tinte[n.tipo],
                      flexShrink: 0, marginTop: 6,
                    }} />
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
