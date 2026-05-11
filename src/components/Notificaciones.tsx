'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Notif = {
  id: string
  tipo: 'stock_bajo' | 'cuota_vencida' | 'pago_recibido' | 'trial'
  titulo: string
  mensaje: string
  leida: boolean
  fecha: string
}

export default function Notificaciones() {
  const supabase = createClient()
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    generarNotifs()
  }, [])

  const generarNotifs = async () => {
    const orgId = localStorage.getItem('sf_org_id')
    if (!orgId) return

    const nuevas: Notif[] = []

    // 1. Stock bajo
    const { data: stockBajo } = await supabase
      .from('productos')
      .select('nombre, cantidad, stock_minimo')
      .eq('org_id', orgId)
      .eq('activo', true)
      .lte('cantidad', supabase.rpc as any)

    const { data: productos } = await supabase
      .from('productos')
      .select('nombre, cantidad, stock_minimo')
      .eq('org_id', orgId)
      .eq('activo', true)

    const bajos = (productos ?? []).filter(p => p.cantidad <= p.stock_minimo)
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

    // 2. Cuotas vencidas
    const { data: cuotasVencidas } = await supabase
      .from('cuota_pagos')
      .select('id, cuotas_ventas(cliente_nombre)')
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

    // 3. Trial por vencer
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
          titulo: `Tu prueba gratuita vence en ${diasRestantes} día${diasRestantes > 1 ? 's' : ''}`,
          mensaje: 'Agregá tu método de pago para continuar usando StockFlow sin interrupciones',
          leida: false,
          fecha: new Date().toISOString(),
        })
      }
    }

    // 4. Ventas pendientes de cobro
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
  }

  const colores: Record<string, string> = {
    stock_bajo: '#E0A030',
    cuota_vencida: '#E05555',
    pago_recibido: '#3B8EEA',
    trial: '#7C6FE0',
  }

  const sinLeer = notifs.filter(n => !n.leida).length

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A7A95', padding: 4, position: 'relative', display: 'flex', alignItems: 'center' }}
      >
        <span style={{ fontSize: 20 }}>🔔</span>
        {sinLeer > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            background: '#E05555', color: '#fff',
            borderRadius: '50%', width: 16, height: 16,
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
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
            background: '#17171C', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14, width: 320, maxHeight: 420, overflowY: 'auto',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#F0EFF8' }}>Notificaciones</p>
              {sinLeer > 0 && (
                <button
                  onClick={() => setNotifs(n => n.map(x => ({ ...x, leida: true })))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7C6FE0', fontSize: 12, fontWeight: 600 }}
                >
                  Marcar todo como leído
                </button>
              )}
            </div>

            {notifs.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 28, margin: '0 0 8px' }}>✅</p>
                <p style={{ margin: 0, color: '#7A7A95', fontSize: 13 }}>Todo en orden, sin alertas</p>
              </div>
            ) : (
              notifs.map(n => (
                <div
                  key={n.id}
                  onClick={() => setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, leida: true } : x))}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    cursor: 'pointer',
                    background: n.leida ? 'transparent' : 'rgba(124,111,224,0.05)',
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: `${colores[n.tipo]}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18,
                  }}>
                    {iconos[n.tipo]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 600, color: n.leida ? '#7A7A95' : '#F0EFF8' }}>
                      {n.titulo}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: '#7A7A95', lineHeight: 1.5 }}>
                      {n.mensaje}
                    </p>
                  </div>
                  {!n.leida && (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: colores[n.tipo], flexShrink: 0, marginTop: 4 }} />
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