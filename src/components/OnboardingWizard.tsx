'use client'

/**
 * Wizard de onboarding para el primer login de un negocio nuevo.
 *
 * Aparece como modal fullscreen no bloqueante (tiene "Saltar todo") cuando
 * el campo `organizations.onboarding_completado` es false. Al completarlo
 * o saltarlo, marcamos el flag en true y nunca mas vuelve a aparecer.
 *
 * Tres pasos, todos opcionales:
 *  1. Datos del negocio — nombre, CUIT, telefono, condicion IVA
 *  2. Primer producto — nombre, precio, stock inicial
 *  3. Mercado Pago — boton para conectar OAuth o saltar
 *
 * Cada paso se guarda al apretar "Continuar" (asi si saltan a la mitad,
 * lo que cargaron queda). El paso de MP no guarda nada — solo redirige
 * al OAuth si elige conectar.
 */

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { COLORS } from '@/lib/theme'

type Props = {
  orgId: string
  initialOrgName?: string
  onDone: () => void  // se llama al completar o saltar -> el layout esconde el modal
}

type Paso = 1 | 2 | 3 | 4  // 4 = pantalla final "¡Listo!"

const CONDICIONES_IVA = [
  'Monotributista',
  'Responsable Inscripto',
  'Exento',
  'Consumidor Final',
] as const

export default function OnboardingWizard({ orgId, initialOrgName, onDone }: Props) {
  const supabase = createClient()
  const [paso, setPaso] = useState<Paso>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Paso 1 — datos del negocio
  const [negocio, setNegocio] = useState({
    name: initialOrgName ?? '',
    cuit: '',
    telefono: '',
    condicion_iva: 'Monotributista',
  })

  // Paso 2 — primer producto
  const [producto, setProducto] = useState({
    nombre: '',
    precio_venta: '',
    cantidad: '',
  })

  const marcarCompletado = async () => {
    // No bloqueamos al user si esto falla — el wizard ya cumplio.
    await supabase.from('organizations')
      .update({ onboarding_completado: true })
      .eq('id', orgId)
  }

  const skipAll = async () => {
    setSaving(true)
    await marcarCompletado()
    onDone()
  }

  // Avanza al paso siguiente. Cada paso decide si guarda algo en el server
  // antes de avanzar (en saveCurrentStep).
  const next = async () => {
    setError(null)
    setSaving(true)
    try {
      await saveCurrentStep()
      setPaso((p) => (p + 1) as Paso)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setSaving(false)
    }
  }

  const saveCurrentStep = async () => {
    if (paso === 1) {
      // Solo guarda los campos que el user lleno (no pisa con strings vacios)
      const update: Record<string, string> = {}
      if (negocio.name.trim()) update.name = negocio.name.trim()
      if (negocio.cuit.trim()) update.cuit = negocio.cuit.trim()
      if (negocio.telefono.trim()) update.telefono = negocio.telefono.trim()
      if (negocio.condicion_iva) update.condicion_iva = negocio.condicion_iva

      if (Object.keys(update).length > 0) {
        const { error } = await supabase.from('organizations').update(update).eq('id', orgId)
        if (error) throw new Error(`No se pudieron guardar los datos: ${error.message}`)

        // Mantener cache de localStorage sincronizado
        if (update.name) {
          try { localStorage.setItem('stk_org_nombre', update.name) } catch {}
        }
      }
    }

    if (paso === 2) {
      // Solo creamos el producto si llenaron al menos nombre + precio
      if (producto.nombre.trim() && producto.precio_venta) {
        const { error } = await supabase.from('productos').insert({
          org_id: orgId,
          nombre: producto.nombre.trim(),
          sku: `SKU-${Date.now()}`,
          precio_venta: Number(producto.precio_venta) || 0,
          cantidad: Number(producto.cantidad) || 0,
          stock_minimo: 0,
          costo: 0,
          activo: true,
        })
        if (error) throw new Error(`No se pudo crear el producto: ${error.message}`)
      }
    }

    if (paso === 3) {
      // El paso de MP no se guarda — el OAuth callback ya marca la org como conectada.
      // Marcamos onboarding completado aca antes de mostrar pantalla final.
      await marcarCompletado()
    }
  }

  const back = () => {
    setError(null)
    if (paso > 1) setPaso((p) => (p - 1) as Paso)
  }

  // ---------- Estilos compartidos ----------
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(4, 47, 46, 0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20, overflowY: 'auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  }

  const card: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 540,
    padding: 32,
    boxShadow: '0 20px 60px rgba(4, 47, 46, 0.25)',
    position: 'relative',
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#FFFFFF',
    border: '1px solid #CCFBF1',
    borderRadius: 10,
    padding: '11px 13px',
    color: '#042F2E',
    fontSize: 14,
    outline: 'none',
  }

  const label: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: '#115E59', marginBottom: 6, marginTop: 14,
  }

  const btnPrimary: React.CSSProperties = {
    background: COLORS.primary, color: '#FFFFFF',
    border: 'none', borderRadius: 10,
    padding: '11px 22px', fontSize: 14, fontWeight: 700,
    cursor: saving ? 'not-allowed' : 'pointer',
    opacity: saving ? 0.6 : 1,
    boxShadow: '0 4px 14px rgba(13, 148, 136, 0.25)',
  }

  const btnGhost: React.CSSProperties = {
    background: 'transparent', color: '#6B7280',
    border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 500,
    padding: '11px 8px',
  }

  // ---------- Header con stepper ----------
  // JSX inline (no componente) para no recrear un componente en cada render.
  const stepper = paso === 4 ? null : (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2, 3].map((n) => (
          <div key={n} style={{
            width: 32, height: 4, borderRadius: 2,
            background: n <= paso ? COLORS.primary : '#E5E7EB',
            transition: 'background 0.2s ease',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>
        Paso {paso} de 3
      </span>
    </div>
  )

  // ---------- Renderizado por paso ----------
  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div style={card}>
        {stepper}

        {paso === 1 && (
          <>
            <h2 id="onb-title" style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#042F2E', letterSpacing: '-0.02em' }}>
              ¡Bienvenido a Stockio! 👋
            </h2>
            <p style={{ margin: '6px 0 4px', fontSize: 14, color: '#6B7280' }}>
              Empecemos con los datos básicos de tu negocio. Los necesitás para emitir facturas y tickets.
            </p>

            <label style={label}>Nombre del negocio</label>
            <input
              style={inp}
              type="text"
              placeholder="Ej: Boutique Sofía"
              value={negocio.name}
              onChange={(e) => setNegocio((p) => ({ ...p, name: e.target.value }))}
              autoFocus
            />

            <label style={label}>CUIT (opcional)</label>
            <input
              style={inp}
              type="text"
              placeholder="20-12345678-9"
              value={negocio.cuit}
              onChange={(e) => setNegocio((p) => ({ ...p, cuit: e.target.value }))}
            />

            <label style={label}>Teléfono (opcional)</label>
            <input
              style={inp}
              type="tel"
              placeholder="362 4 123456"
              value={negocio.telefono}
              onChange={(e) => setNegocio((p) => ({ ...p, telefono: e.target.value }))}
            />

            <label style={label}>Condición frente al IVA</label>
            <select
              style={inp}
              value={negocio.condicion_iva}
              onChange={(e) => setNegocio((p) => ({ ...p, condicion_iva: e.target.value }))}
            >
              {CONDICIONES_IVA.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </>
        )}

        {paso === 2 && (
          <>
            <h2 id="onb-title" style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#042F2E', letterSpacing: '-0.02em' }}>
              Cargá tu primer producto
            </h2>
            <p style={{ margin: '6px 0 4px', fontSize: 14, color: '#6B7280' }}>
              Probá cómo funciona el inventario. Después podés importar todo tu stock en lote.
            </p>

            <label style={label}>Nombre del producto</label>
            <input
              style={inp}
              type="text"
              placeholder="Ej: Remera oversize negra"
              value={producto.nombre}
              onChange={(e) => setProducto((p) => ({ ...p, nombre: e.target.value }))}
              autoFocus
            />

            <label style={label}>Precio de venta</label>
            <input
              style={inp}
              type="number"
              inputMode="decimal"
              placeholder="9990"
              value={producto.precio_venta}
              onChange={(e) => setProducto((p) => ({ ...p, precio_venta: e.target.value }))}
            />

            <label style={label}>Stock inicial</label>
            <input
              style={inp}
              type="number"
              inputMode="numeric"
              placeholder="10"
              value={producto.cantidad}
              onChange={(e) => setProducto((p) => ({ ...p, cantidad: e.target.value }))}
            />

            <p style={{ marginTop: 16, fontSize: 12, color: '#6B7280' }}>
              💡 Más adelante podés agregar talle, color, SKU, costo, proveedor y código de barras.
            </p>
          </>
        )}

        {paso === 3 && (
          <>
            <h2 id="onb-title" style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#042F2E', letterSpacing: '-0.02em' }}>
              Cobrá con Mercado Pago
            </h2>
            <p style={{ margin: '6px 0 20px', fontSize: 14, color: '#6B7280' }}>
              Conectá tu cuenta para cobrar ventas, generar QR y armar planes de cuotas online.
            </p>

            <div style={{
              background: '#F0FDFA',
              border: '1px solid #CCFBF1',
              borderRadius: 12,
              padding: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: '#009EE3', color: '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 800, flexShrink: 0,
              }}>$</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 700, color: '#042F2E', fontSize: 14 }}>
                  Mercado Pago
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
                  Cobros con tarjeta, QR y débito automático.
                </p>
              </div>
            </div>

            <a
              href="/api/mp/connect"
              onClick={() => { marcarCompletado() }}
              style={{
                display: 'block', textAlign: 'center', marginTop: 16,
                background: '#009EE3', color: '#FFFFFF',
                border: 'none', borderRadius: 10,
                padding: '12px 22px', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', textDecoration: 'none',
              }}
            >
              Conectar Mercado Pago
            </a>

            <p style={{ marginTop: 18, fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
              ¿Solo cobrás en efectivo o transferencia? Podés saltar este paso y conectarlo después desde Configuración.
            </p>
          </>
        )}

        {paso === 4 && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: '#DCFCE7', color: '#166534',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 30, margin: '0 auto 18px',
            }}>✓</div>
            <h2 id="onb-title" style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#042F2E', letterSpacing: '-0.02em' }}>
              ¡Todo listo!
            </h2>
            <p style={{ margin: '8px 0 22px', fontSize: 14, color: '#6B7280' }}>
              Tu cuenta está lista para usar. Cuando quieras podés:
            </p>

            <ul style={{
              listStyle: 'none', padding: 0, margin: '0 0 26px',
              textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {[
                'Importar tu inventario completo desde Excel',
                'Invitar empleados (plan Premium)',
                'Configurar facturación electrónica AFIP',
                'Personalizar el logo en los tickets',
              ].map((txt) => (
                <li key={txt} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 13, color: '#1C4542',
                }}>
                  <span style={{ color: COLORS.primary, fontWeight: 800 }}>○</span>
                  {txt}
                </li>
              ))}
            </ul>

            <button
              onClick={onDone}
              style={{
                ...btnPrimary,
                width: '100%', padding: '13px 22px', fontSize: 15,
              }}
            >
              Ir al dashboard
            </button>
          </div>
        )}

        {/* Error inline */}
        {error && (
          <div style={{
            marginTop: 14,
            background: '#FFF1F2', color: '#9F1239',
            border: '1px solid #FECDD3',
            borderRadius: 8, padding: '10px 12px',
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Footer con botones (no en pantalla final) */}
        {paso !== 4 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 26, paddingTop: 16, borderTop: '1px solid #F1F5F9',
          }}>
            <button onClick={skipAll} disabled={saving} style={btnGhost}>
              Saltar todo
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              {paso > 1 && (
                <button onClick={back} disabled={saving} style={{
                  ...btnGhost, color: '#1C4542',
                }}>
                  ← Atrás
                </button>
              )}
              <button onClick={next} disabled={saving} style={btnPrimary}>
                {saving ? 'Guardando…' : paso === 3 ? 'Finalizar' : 'Continuar →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
