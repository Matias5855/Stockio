'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { getTheme, COLORS } from '@/lib/theme'

type Organization = {
  id: string
  name?: string
  cuit?: string
  direccion?: string
  telefono?: string
  email_negocio?: string
  iibb?: string
  inicio_actividades?: string
  condicion_iva?: string
  punto_venta?: string
  mp_connected?: boolean
  mp_user_id?: string
}

export default function ConfiguracionPage() {
  const supabase = createClient()

  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [formNegocio, setFormNegocio] = useState({
    name: '', cuit: '', direccion: '', telefono: '',
    email_negocio: '', iibb: '', inicio_actividades: '',
    condicion_iva: 'Monotributista', punto_venta: '0001',
  })

  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const sync = () => setIsDark(localStorage.getItem('stk_dark_mode') === '1')
    sync()
    const interval = setInterval(sync, 500)
    return () => clearInterval(interval)
  }, [])
  const t = useMemo(() => getTheme(isDark), [isDark])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles').select('org_id').eq('id', user.id).single()
      if (!profile?.org_id) return
      const { data: orgData } = await supabase
        .from('organizations').select('*').eq('id', profile.org_id).single()
      setOrg(orgData as Organization)
      setLoading(false)
    }

    const params = new URLSearchParams(window.location.search)
    if (params.get('mp') === 'ok') setMsg({ text: '✓ Mercado Pago conectado correctamente', ok: true })
    if (params.get('mp') === 'error') setMsg({ text: '✗ Error al conectar Mercado Pago', ok: false })

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!org) return
    setFormNegocio({
      name: org.name ?? '',
      cuit: org.cuit ?? '',
      direccion: org.direccion ?? '',
      telefono: org.telefono ?? '',
      email_negocio: org.email_negocio ?? '',
      iibb: org.iibb ?? '',
      inicio_actividades: org.inicio_actividades ?? '',
      condicion_iva: org.condicion_iva ?? 'Monotributista',
      punto_venta: org.punto_venta ?? '0001',
    })
  }, [org])

  const guardarNegocio = async () => {
    setGuardando(true)
    const { error } = await supabase
      .from('organizations').update(formNegocio).eq('id', org?.id ?? '')
    if (error) alert(error.message)
    else setMsg({ text: '✓ Datos del negocio actualizados', ok: true })
    setGuardando(false)
    setTimeout(() => setMsg(null), 4000)
  }

  const card: React.CSSProperties = {
    background: t.card,
    border: `1px solid ${t.borderCard}`,
    borderRadius: 12,
    padding: 24,
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: t.card, border: `1px solid ${t.border}`, borderRadius: 8,
    padding: '10px 12px', color: t.text, fontSize: 13, outline: 'none',
  }

  if (loading) return <p style={{ color: t.textMuted }}>Cargando…</p>

  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>Configuración</p>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: t.textMuted }}>Ajustes de tu negocio</p>

      {msg && (
        <div style={{
          background: msg.ok ? COLORS.badge.ok.bg : COLORS.badge.error.bg,
          border: `1px solid ${msg.ok ? '#86EFAC' : '#FECDD3'}`,
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          fontSize: 13, fontWeight: 600,
          color: msg.ok ? COLORS.badge.ok.text : COLORS.badge.error.text,
        }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* DATOS DEL NEGOCIO */}
        <div style={card}>
          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: t.text }}>
            Datos del negocio
          </p>
          <p style={{ margin: '0 0 18px', fontSize: 12, color: t.textMuted }}>
            Aparecen en todas las facturas y comprobantes.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {([
              { key: 'name',               label: 'Nombre del negocio',     placeholder: 'Mi Comercio S.A.' },
              { key: 'cuit',               label: 'CUIT',                    placeholder: '20-12345678-9' },
              { key: 'direccion',          label: 'Dirección',               placeholder: 'Av. San Martín 123' },
              { key: 'telefono',           label: 'Teléfono',                placeholder: '0362-4xxxxxx' },
              { key: 'email_negocio',      label: 'Email del negocio',       placeholder: 'contacto@minegocio.com' },
              { key: 'iibb',               label: 'Ingresos Brutos (IIBB)',  placeholder: '000-123456-0' },
              { key: 'inicio_actividades', label: 'Inicio de actividades',   placeholder: '01/01/2024' },
              { key: 'punto_venta',        label: 'Punto de venta',          placeholder: '0001' },
            ] as const).map(f => (
              <div key={f.key}>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>{f.label}</p>
                <input
                  value={formNegocio[f.key]}
                  onChange={e => setFormNegocio(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={inp}
                />
              </div>
            ))}

            <div>
              <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Condición IVA</p>
              <select
                value={formNegocio.condicion_iva}
                onChange={e => setFormNegocio(p => ({ ...p, condicion_iva: e.target.value }))}
                style={inp}
              >
                <option>Monotributista</option>
                <option>Responsable Inscripto</option>
                <option>Exento</option>
                <option>No Responsable</option>
              </select>
            </div>
          </div>

          <button onClick={guardarNegocio} disabled={guardando} style={{
            marginTop: 22, background: COLORS.primary, border: 'none', borderRadius: 8,
            padding: '11px 24px', color: '#fff', fontWeight: 700, fontSize: 14,
            cursor: 'pointer', opacity: guardando ? 0.7 : 1,
            boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
          }}>
            {guardando ? 'Guardando…' : '💾 Guardar datos'}
          </button>
        </div>

        {/* MERCADO PAGO */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: t.text }}>Mercado Pago</p>
              <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>Conectá tu cuenta para recibir pagos directamente</p>
            </div>
            <span style={{
              background: org?.mp_connected ? COLORS.badge.ok.bg : COLORS.badge.error.bg,
              color: org?.mp_connected ? COLORS.badge.ok.text : COLORS.badge.error.text,
              padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700,
            }}>
              {org?.mp_connected ? '● Conectado' : '● Sin conectar'}
            </span>
          </div>

          {org?.mp_connected ? (
            <div>
              <div style={{
                background: COLORS.badge.ok.bg, border: '1px solid #86EFAC',
                borderRadius: 10, padding: '12px 16px', marginBottom: 16,
              }}>
                <p style={{ margin: '0 0 4px', fontSize: 13, color: COLORS.badge.ok.text, fontWeight: 700 }}>
                  ✓ Conectado — ya podés cobrar a tus clientes
                </p>
                <p style={{ margin: 0, fontSize: 12, color: COLORS.badge.ok.text, lineHeight: 1.5 }}>
                  Los pagos por link, QR y cuotas online van directo a tu cuenta de Mercado Pago. Stockio no toca ese dinero.
                </p>
                {org?.mp_user_id && (
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: t.textMuted }}>ID MP: {org.mp_user_id}</p>
                )}
              </div>
              <a href="/api/mp/connect" style={{
                background: '#CCFBF1', border: `1px solid ${COLORS.primary}`,
                borderRadius: 8, padding: '10px 18px',
                color: COLORS.primary, fontSize: 13, fontWeight: 700,
                textDecoration: 'none', display: 'inline-block',
              }}>
                🔄 Reconectar cuenta
              </a>
            </div>
          ) : (
            <div>
              <div style={{
                background: COLORS.badge.bajo.bg, border: '1px solid #FCD34D',
                borderRadius: 10, padding: '14px 18px', marginBottom: 16,
              }}>
                <p style={{ margin: '0 0 6px', fontSize: 14, color: COLORS.badge.bajo.text, fontWeight: 800 }}>
                  🔌 Conectá Mercado Pago para cobrar a tus clientes
                </p>
                <p style={{ margin: 0, fontSize: 13, color: COLORS.badge.bajo.text, lineHeight: 1.55 }}>
                  Para que tus clientes puedan pagarte por <strong>link de pago, QR o cuotas online</strong>,
                  necesitás conectar tu cuenta de Mercado Pago. El dinero va directo a vos,
                  Stockio no toca ese dinero.
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.badge.bajo.text }}>
                  Es gratis y tarda 30 segundos.
                </p>
              </div>
              <a href="/api/mp/connect" style={{
                display: 'inline-block', background: '#009EE3', border: 'none', borderRadius: 8,
                padding: '12px 22px', color: '#fff', fontSize: 14, fontWeight: 700,
                textDecoration: 'none', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,158,227,0.25)',
              }}>
                Conectar con Mercado Pago →
              </a>
            </div>
          )}
        </div>

        {/* QR COBRO RÁPIDO */}
        {org?.mp_connected && (
          <div style={card}>
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: t.text }}>QR de cobro rápido</p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: t.textMuted }}>Generá un QR para cobros instantáneos sin registrar una venta</p>
            <QuickQR isDark={isDark} />
          </div>
        )}

        {/* FACTURACIÓN ELECTRÓNICA */}
        <ArcaConfigSection isDark={isDark} />

        {/* TU SUSCRIPCIÓN — siempre al final */}
        <SuscripcionSection isDark={isDark} />

      </div>
    </div>
  )
}

// ── FACTURACIÓN ELECTRÓNICA (ARCA/AFIP) ────────────────────────
type ArcaStatus = {
  activado: boolean
  cuit: string | null
  punto_venta: string | null
  ambiente: 'testing' | 'produccion' | null
  tiene_certificado: boolean
  encryption_ready: boolean
}

function ArcaConfigSection({ isDark }: { isDark: boolean }) {
  const t = useMemo(() => getTheme(isDark), [isDark])
  const [status, setStatus] = useState<ArcaStatus | null>(null)
  const [modal, setModal] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [form, setForm] = useState({
    cuit: '', punto_venta: '0001',
    ambiente: 'testing' as 'testing' | 'produccion',
    cert_pem: '', private_key_pem: '',
    activado: true,
  })

  const cargarStatus = async () => {
    try {
      const res = await fetch('/api/arca/configurar')
      if (res.ok) setStatus(await res.json())
    } catch {}
  }
  useEffect(() => { cargarStatus() }, [])

  const guardar = async () => {
    setGuardando(true)
    setMsg(null)
    try {
      const res = await fetch('/api/arca/configurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.ok) {
        setMsg({ text: '✓ Facturación electrónica configurada', ok: true })
        setModal(false)
        cargarStatus()
        setForm(f => ({ ...f, cert_pem: '', private_key_pem: '' }))
      } else {
        setMsg({ text: data.error ?? 'Error', ok: false })
      }
    } catch {
      setMsg({ text: 'Error de conexión', ok: false })
    }
    setGuardando(false)
    setTimeout(() => setMsg(null), 5000)
  }

  const card: React.CSSProperties = {
    background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 12, padding: 24,
  }
  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: t.card, border: `1px solid ${t.border}`, borderRadius: 8,
    padding: '10px 12px', color: t.text, fontSize: 13, outline: 'none',
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: t.text }}>
            Facturación Electrónica (ARCA / AFIP)
          </p>
          <p style={{ margin: 0, fontSize: 13, color: t.textMuted, maxWidth: 520, lineHeight: 1.5 }}>
            Conectá tus credenciales fiscales para que Stockio pida el CAE automáticamente a ARCA y emita Facturas C oficiales con validez legal.
          </p>
        </div>
        {status && (
          <span style={{
            background: status.activado && status.tiene_certificado ? COLORS.badge.ok.bg : COLORS.badge.bajo.bg,
            color: status.activado && status.tiene_certificado ? COLORS.badge.ok.text : COLORS.badge.bajo.text,
            padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
            {status.activado && status.tiene_certificado ? '● Activado' : '● No configurado'}
          </span>
        )}
      </div>

      {msg && (
        <div style={{
          background: msg.ok ? COLORS.badge.ok.bg : COLORS.badge.error.bg,
          color: msg.ok ? COLORS.badge.ok.text : COLORS.badge.error.text,
          border: `1px solid ${msg.ok ? '#86EFAC' : '#FECDD3'}`,
          borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, fontWeight: 600,
        }}>{msg.text}</div>
      )}

      {status && !status.encryption_ready && (
        <div style={{
          background: COLORS.badge.error.bg, color: COLORS.badge.error.text,
          border: `1px solid #FECDD3`, borderRadius: 10, padding: '12px 16px', marginBottom: 14,
        }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700 }}>⚠ Encriptación no configurada en el servidor</p>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
            Falta la variable de entorno <code>STOCKIO_ENCRYPTION_KEY</code>. Sin esto no podemos guardar
            las credenciales de forma segura. Contactá al administrador del sistema.
          </p>
        </div>
      )}

      {status?.activado && status?.tiene_certificado ? (
        <div>
          <div style={{
            background: COLORS.badge.ok.bg, border: '1px solid #86EFAC',
            borderRadius: 10, padding: '12px 16px', marginBottom: 14,
          }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: COLORS.badge.ok.text, fontWeight: 700 }}>
              ✓ Listo para emitir facturas con CAE
            </p>
            <div style={{ fontSize: 12, color: COLORS.badge.ok.text, lineHeight: 1.6 }}>
              CUIT: <strong>{status.cuit}</strong> · Punto de venta: <strong>{status.punto_venta}</strong> · Ambiente: <strong style={{ textTransform: 'capitalize' }}>{status.ambiente}</strong>
            </div>
          </div>
          <button onClick={() => setModal(true)} style={{
            background: '#CCFBF1', border: `1px solid ${COLORS.primary}`, borderRadius: 8,
            padding: '10px 18px', color: COLORS.primary, fontSize: 13, fontWeight: 700,
            cursor: 'pointer',
          }}>
            🔄 Cambiar credenciales
          </button>
        </div>
      ) : (
        <div>
          <details style={{ marginBottom: 14 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: t.textMuted, fontWeight: 600, padding: '6px 0' }}>
              ¿Cómo obtengo mi certificado AFIP? (instrucciones)
            </summary>
            <div style={{
              marginTop: 8, padding: '12px 14px',
              background: isDark ? 'rgba(94,234,212,0.06)' : '#F0FDFA',
              border: `1px solid ${t.borderCard}`, borderRadius: 8,
              fontSize: 12, color: t.text, lineHeight: 1.6,
            }}>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li>Entrá a <strong>auth.afip.gob.ar</strong> con tu CUIT y clave fiscal.</li>
                <li>Buscá el servicio <strong>“Administrador de Relaciones de Clave Fiscal”</strong>.</li>
                <li>En <strong>“Nuevo Certificado Digital”</strong>, generá un certificado con alias <code>stockflow</code>.</li>
                <li>Vinculá el certificado al servicio <strong>“Facturación Electrónica” (wsfe)</strong>.</li>
                <li>Descargá el archivo <strong>.crt</strong> (certificado) y guardá tu <strong>.key</strong> (clave privada).</li>
                <li>Pegá ambos abajo. Stockio los guarda <strong>encriptados</strong> en la base de datos.</li>
              </ol>
              <p style={{ margin: '8px 0 0', color: t.textMuted }}>
                Si nunca lo hiciste, podés empezar con <strong>ambiente Testing</strong> para probar sin emitir facturas reales.
              </p>
            </div>
          </details>
          <button onClick={() => setModal(true)} disabled={!status?.encryption_ready} style={{
            background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
            padding: '12px 22px', cursor: status?.encryption_ready ? 'pointer' : 'not-allowed',
            fontWeight: 700, fontSize: 14, opacity: status?.encryption_ready ? 1 : 0.5,
            boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
          }}>
            Configurar AFIP →
          </button>
        </div>
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,47,46,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{
            background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 16,
            padding: 28, width: '100%', maxWidth: 600, maxHeight: '92vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(4,47,46,0.25)',
          }}>
            <p style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>
              Configurar AFIP / ARCA
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: t.textMuted }}>
              Los datos se guardan encriptados con AES-256-GCM. Nadie en Stockio puede ver tu clave privada.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>CUIT</p>
                <input value={form.cuit} onChange={e => setForm(p => ({ ...p, cuit: e.target.value }))} placeholder="20-12345678-9" style={inp} />
              </div>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Punto de venta</p>
                <input value={form.punto_venta} onChange={e => setForm(p => ({ ...p, punto_venta: e.target.value }))} style={inp} />
              </div>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Ambiente</p>
                <select value={form.ambiente} onChange={e => setForm(p => ({ ...p, ambiente: e.target.value as 'testing' | 'produccion' }))} style={inp}>
                  <option value="testing">Testing (homologación)</option>
                  <option value="produccion">Producción (facturas reales)</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>
                Certificado (.crt o .pem) — pegá el contenido completo
              </p>
              <textarea
                value={form.cert_pem}
                onChange={e => setForm(p => ({ ...p, cert_pem: e.target.value }))}
                placeholder={`-----BEGIN CERTIFICATE-----\nMIIDXTCCAk...\n-----END CERTIFICATE-----`}
                style={{ ...inp, minHeight: 100, fontFamily: 'monospace', fontSize: 11 }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>
                Clave privada (.key o .pem) — pegá el contenido completo
              </p>
              <textarea
                value={form.private_key_pem}
                onChange={e => setForm(p => ({ ...p, private_key_pem: e.target.value }))}
                placeholder={`-----BEGIN PRIVATE KEY-----\nMIIEvQIBA...\n-----END PRIVATE KEY-----`}
                style={{ ...inp, minHeight: 100, fontFamily: 'monospace', fontSize: 11 }}
              />
            </div>

            <label style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', background: isDark ? 'rgba(94,234,212,0.06)' : '#F0FDFA',
              border: `1px solid ${t.borderCard}`, borderRadius: 8,
              cursor: 'pointer', marginBottom: 16,
            }}>
              <input
                type="checkbox"
                checked={form.activado}
                onChange={e => setForm(p => ({ ...p, activado: e.target.checked }))}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>
                Activar facturación electrónica
              </span>
              <span style={{ fontSize: 12, color: t.textMuted }}>
                (si la desactivás, los PDFs salen sin CAE)
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setModal(false)} style={{
                background: 'none', border: `1px solid ${t.border}`, borderRadius: 8,
                padding: '10px 18px', cursor: 'pointer', color: t.textMuted, fontSize: 13, fontWeight: 600,
              }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{
                background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 22px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                opacity: guardando ? 0.7 : 1,
                boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
              }}>
                {guardando ? 'Guardando…' : 'Guardar y activar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function QuickQR({ isDark }: { isDark: boolean }) {
  const t = useMemo(() => getTheme(isDark), [isDark])
  const [monto, setMonto] = useState('')
  const [desc, setDesc] = useState('')
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const generar = async () => {
    if (!monto) return
    setLoading(true)
    try {
      const res = await fetch('/api/mp/qr-rapido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto: +monto, descripcion: desc || 'Cobro rápido' }),
      })
      const data = await res.json()
      if (data.link) setQrUrl(data.link)
      else alert(data.error ?? 'Error al generar QR')
    } catch { alert('Error generando QR') }
    setLoading(false)
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: t.card, border: `1px solid ${t.border}`, borderRadius: 8,
    padding: '10px 12px', color: t.text, fontSize: 13, outline: 'none',
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
        <div>
          <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Monto ($)</p>
          <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="15000" style={inp} />
        </div>
        <div>
          <p style={{ margin: '0 0 5px', fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Descripción</p>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ej: Seña remera" style={inp} />
        </div>
      </div>

      <button onClick={generar} disabled={loading || !monto} style={{
        background: '#009EE3', border: 'none', borderRadius: 8,
        padding: '11px 22px', color: '#fff', fontWeight: 700,
        cursor: 'pointer', fontSize: 14, opacity: loading ? 0.7 : 1,
        boxShadow: '0 4px 12px rgba(0,158,227,0.25)',
      }}>
        {loading ? 'Generando…' : '📱 Generar QR de cobro'}
      </button>

      {qrUrl && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: t.textMuted }}>
            Mostrá este QR al cliente para que pague con Mercado Pago
          </p>
          <Image
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}&margin=16`}
            alt="QR de pago"
            width={200}
            height={200}
            unoptimized
            style={{ borderRadius: 12, border: `4px solid ${COLORS.primary}` }}
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={qrUrl} target="_blank" rel="noreferrer" style={{
              background: '#DBEAFE', border: '1px solid #93C5FD', borderRadius: 8,
              padding: '8px 16px', color: '#1E40AF', fontSize: 12, fontWeight: 700, textDecoration: 'none',
            }}>
              🔗 Abrir link
            </a>
            <button onClick={() => navigator.clipboard.writeText(qrUrl).then(() => alert('¡Link copiado!'))} style={{
              background: '#CCFBF1', border: `1px solid ${COLORS.primary}`, borderRadius: 8,
              padding: '8px 16px', color: COLORS.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              📋 Copiar link
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TU SUSCRIPCIÓN ────────────────────────────────────────────
type SuscripcionInfo = {
  estado: 'trial' | 'activa' | 'vencida' | 'cancelada' | 'pausada'
  plan_id: 'normal' | 'premium' | string
  trial_fin: string | null
  mp_suscripcion_id?: string | null
}

const PLAN_LABEL: Record<string, { nombre: string; precio: number }> = {
  normal:  { nombre: 'Stockio Normal',  precio: 14990 },
  premium: { nombre: 'Stockio Premium', precio: 24990 },
}

function SuscripcionSection({ isDark }: { isDark: boolean }) {
  const t = useMemo(() => getTheme(isDark), [isDark])
  const [susc, setSusc] = useState<SuscripcionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmandoCancel, setConfirmandoCancel] = useState(false)
  const [cambiandoPlan, setCambiandoPlan] = useState(false)
  const [accionLoading, setAccionLoading] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/suscripcion')
      if (res.ok) setSusc(await res.json())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const planIdNorm = (susc?.plan_id ?? '').toLowerCase()
  const esPremium = planIdNorm === 'premium'
  const planActual = PLAN_LABEL[planIdNorm] ?? PLAN_LABEL.normal
  const otroPlanId: 'normal' | 'premium' = esPremium ? 'normal' : 'premium'
  const otroPlan = PLAN_LABEL[otroPlanId]
  const cambiando = esPremium ? 'a Normal' : 'a Premium'

  const cancelar = async () => {
    setAccionLoading(true)
    setMsg(null)
    try {
      const res = await fetch('/api/suscripcion/cancelar', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setMsg({ text: '✓ Suscripción cancelada. No te vamos a cobrar más.', ok: true })
        setConfirmandoCancel(false)
        cargar()
      } else {
        setMsg({ text: data.error ?? 'Error al cancelar', ok: false })
      }
    } catch {
      setMsg({ text: 'Error de conexión', ok: false })
    }
    setAccionLoading(false)
    setTimeout(() => setMsg(null), 6000)
  }

  const cambiarPlan = async () => {
    setAccionLoading(true)
    setMsg(null)
    try {
      const res = await fetch('/api/suscripcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: otroPlanId }),
      })
      const data = await res.json()
      if (data.init_point) {
        window.location.href = data.init_point
      } else {
        setMsg({ text: data.error ?? 'Error al generar link de pago', ok: false })
      }
    } catch {
      setMsg({ text: 'Error de conexión', ok: false })
    }
    setAccionLoading(false)
  }

  const card: React.CSSProperties = {
    background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 12, padding: 24,
  }

  if (loading) {
    return (
      <div style={card}>
        <p style={{ margin: 0, color: t.textMuted, fontSize: 13 }}>Cargando tu suscripción…</p>
      </div>
    )
  }

  if (!susc) return null

  const estadoBadge =
    susc.estado === 'activa'    ? { bg: COLORS.badge.ok.bg,        text: COLORS.badge.ok.text,        label: 'Activa' } :
    susc.estado === 'trial'     ? { bg: COLORS.badge.bajo.bg,      text: COLORS.badge.bajo.text,      label: 'Período de prueba' } :
    susc.estado === 'vencida'   ? { bg: COLORS.badge.error.bg,     text: COLORS.badge.error.text,     label: 'Vencida' } :
    susc.estado === 'cancelada' ? { bg: '#F3F4F6',                 text: '#6B7280',                   label: 'Cancelada' } :
    susc.estado === 'pausada'   ? { bg: COLORS.badge.pendiente.bg, text: COLORS.badge.pendiente.text, label: 'Pausada' } :
    { bg: '#F3F4F6', text: '#6B7280', label: susc.estado }

  const diasTrialRestantes = susc.estado === 'trial' && susc.trial_fin
    ? Math.max(0, Math.ceil((new Date(susc.trial_fin).getTime() - Date.now()) / (1000 * 3600 * 24)))
    : null

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: t.text }}>
            Tu suscripción
          </p>
          <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>
            Gestioná tu plan y método de pago
          </p>
        </div>
        <span style={{
          background: estadoBadge.bg, color: estadoBadge.text,
          padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700,
        }}>
          {estadoBadge.label}
        </span>
      </div>

      {msg && (
        <div style={{
          background: msg.ok ? COLORS.badge.ok.bg : COLORS.badge.error.bg,
          color: msg.ok ? COLORS.badge.ok.text : COLORS.badge.error.text,
          border: `1px solid ${msg.ok ? '#86EFAC' : '#FECDD3'}`,
          borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, fontWeight: 600,
        }}>
          {msg.text}
        </div>
      )}

      {/* Detalle del plan actual */}
      <div style={{
        background: isDark ? 'rgba(94,234,212,0.06)' : '#F0FDFA',
        border: `1px solid ${t.borderCard}`,
        borderRadius: 10, padding: '14px 18px', marginBottom: 18,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: t.text }}>
            {planActual.nombre}
          </p>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: COLORS.primary }}>
            ${planActual.precio.toLocaleString('es-AR')}
            <span style={{ fontSize: 12, fontWeight: 500, color: t.textMuted }}>/mes</span>
          </p>
        </div>
        {diasTrialRestantes !== null && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: t.textMuted }}>
            Te quedan <strong>{diasTrialRestantes} {diasTrialRestantes === 1 ? 'día' : 'días'}</strong> de prueba gratuita.
            El primer cobro es el día 31.
          </p>
        )}
        {susc.estado === 'cancelada' && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: t.textMuted }}>
            Tu suscripción fue cancelada. No te vamos a cobrar más.
            Si querés volver, podés reactivar el plan en cualquier momento.
          </p>
        )}
      </div>

      {/* Botones de accion */}
      {susc.estado !== 'cancelada' ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => setCambiandoPlan(true)}
            disabled={accionLoading}
            style={{
              background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
              padding: '10px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
              opacity: accionLoading ? 0.7 : 1,
            }}
          >
            🔄 Cambiar plan
          </button>
          <button
            onClick={() => setConfirmandoCancel(true)}
            disabled={accionLoading}
            style={{
              background: 'none',
              border: `1px solid ${COLORS.danger}`,
              borderRadius: 8, padding: '10px 18px',
              color: COLORS.danger, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              opacity: accionLoading ? 0.7 : 1,
            }}
          >
            Cancelar suscripción
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCambiandoPlan(true)}
          disabled={accionLoading}
          style={{
            background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
            boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
            opacity: accionLoading ? 0.7 : 1,
          }}
        >
          Reactivar suscripción
        </button>
      )}

      <p style={{ margin: '14px 0 0', fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>
        Al cancelar, no se generan más cobros. Mantenés acceso hasta que termine el ciclo
        que ya pagaste. Podés reactivar cuando quieras sin perder tus datos.
      </p>

      {/* Modal confirmar cancelacion */}
      {confirmandoCancel && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(4,47,46,0.55)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 16,
            padding: 28, width: '100%', maxWidth: 440,
            boxShadow: '0 20px 60px rgba(4,47,46,0.25)',
          }}>
            <p style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>
              ¿Cancelar tu suscripción?
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              No te vamos a cobrar el próximo mes. Vas a poder seguir usando Stockio
              hasta que termine el período ya pagado.
              Tus datos quedan guardados y podés reactivar cuando quieras.
            </p>
            <div style={{
              background: COLORS.badge.bajo.bg, color: COLORS.badge.bajo.text,
              border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 14px',
              fontSize: 12, marginBottom: 18,
            }}>
              <strong>Importante:</strong> esta acción cancela el débito automático en Mercado Pago.
              Si tenés facturas pendientes, podés seguir generándolas hasta el último día.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setConfirmandoCancel(false)}
                disabled={accionLoading}
                style={{
                  background: 'none', border: `1px solid ${t.border}`, borderRadius: 8,
                  padding: '10px 18px', cursor: 'pointer', color: t.textMuted, fontSize: 13, fontWeight: 600,
                }}
              >
                Mantener mi plan
              </button>
              <button
                onClick={cancelar}
                disabled={accionLoading}
                style={{
                  background: COLORS.danger, color: '#fff', border: 'none', borderRadius: 8,
                  padding: '10px 22px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                  opacity: accionLoading ? 0.7 : 1,
                }}
              >
                {accionLoading ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cambio de plan */}
      {cambiandoPlan && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(4,47,46,0.55)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: t.card, border: `1px solid ${t.borderCard}`, borderRadius: 16,
            padding: 28, width: '100%', maxWidth: 460,
            boxShadow: '0 20px 60px rgba(4,47,46,0.25)',
          }}>
            <p style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800, color: t.text, letterSpacing: '-0.01em' }}>
              {susc.estado === 'cancelada' ? 'Reactivar suscripción' : `Cambiar ${cambiando}`}
            </p>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
              Te vamos a redirigir a Mercado Pago para confirmar el cambio. El cobro
              del nuevo plan empieza recién en el próximo ciclo de facturación.
            </p>
            <div style={{
              background: isDark ? 'rgba(94,234,212,0.06)' : '#F0FDFA',
              border: `1px solid ${t.borderCard}`,
              borderRadius: 10, padding: '14px 18px', marginBottom: 18,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: t.textMuted, fontWeight: 600 }}>
                  Nuevo plan:
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: t.text }}>
                  {otroPlan.nombre}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                <span style={{ fontSize: 13, color: t.textMuted, fontWeight: 600 }}>
                  Precio:
                </span>
                <span style={{ fontSize: 16, fontWeight: 800, color: COLORS.primary }}>
                  ${otroPlan.precio.toLocaleString('es-AR')}/mes
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setCambiandoPlan(false)}
                disabled={accionLoading}
                style={{
                  background: 'none', border: `1px solid ${t.border}`, borderRadius: 8,
                  padding: '10px 18px', cursor: 'pointer', color: t.textMuted, fontSize: 13, fontWeight: 600,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={cambiarPlan}
                disabled={accionLoading}
                style={{
                  background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8,
                  padding: '10px 22px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                  opacity: accionLoading ? 0.7 : 1,
                  boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
                }}
              >
                {accionLoading ? 'Generando link…' : 'Continuar a Mercado Pago →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
