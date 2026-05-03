'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ConfiguracionPage() {
  const supabase = createClient()
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles').select('org_id').eq('id', user.id).single()
      if (!profile?.org_id) return
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, name, mp_connected, mp_user_id, plan')
        .eq('id', profile.org_id).single()
      setOrg(orgData)
      setLoading(false)
    }

    // Detectar si viene de OAuth de MP
    const params = new URLSearchParams(window.location.search)
    if (params.get('mp') === 'ok') setMsg({ text: '✓ Mercado Pago conectado correctamente', ok: true })
    if (params.get('mp') === 'error') setMsg({ text: '✗ Error al conectar Mercado Pago', ok: false })

    load()
  }, [])

  const card = { background: '#17171C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '24px' }

  if (loading) return <p style={{ color: '#7A7A95' }}>Cargando...</p>

  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>Configuración</p>
      <p style={{ margin: '0 0 28px', fontSize: 13, color: '#7A7A95' }}>Ajustes de tu negocio</p>

      {msg && (
        <div style={{ background: msg.ok ? 'rgba(34,201,122,0.12)' : 'rgba(224,85,85,0.12)', border: `1px solid ${msg.ok ? 'rgba(34,201,122,0.3)' : 'rgba(224,85,85,0.3)'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, fontWeight: 600, color: msg.ok ? '#22C97A' : '#E05555' }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Info del negocio */}
        <div style={card}>
          <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#F0EFF8' }}>Tu negocio</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{org?.name}</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#7A7A95' }}>Plan: <span style={{ color: '#7C6FE0', fontWeight: 600 }}>{org?.plan === 'pro' ? 'StockFlow Normal' : 'StockFlow Premium'}</span></p>
            </div>
          </div>
        </div>

        {/* Mercado Pago */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#F0EFF8' }}>Mercado Pago</p>
              <p style={{ margin: 0, fontSize: 13, color: '#7A7A95' }}>Conectá tu cuenta para recibir pagos directamente</p>
            </div>
            <span style={{ background: org?.mp_connected ? 'rgba(34,201,122,0.12)' : 'rgba(224,85,85,0.12)', color: org?.mp_connected ? '#22C97A' : '#E05555', padding: '4px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600 }}>
              {org?.mp_connected ? '● Conectado' : '● Sin conectar'}
            </span>
          </div>

          {org?.mp_connected ? (
            <div>
              <div style={{ background: 'rgba(34,201,122,0.08)', border: '1px solid rgba(34,201,122,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#22C97A' }}>
                  ✓ Los pagos de cuotas van directo a tu cuenta de Mercado Pago
                </p>
                {org?.mp_user_id && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#7A7A95' }}>ID de usuario MP: {org.mp_user_id}</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <a href="/api/mp/connect" style={{ background: 'rgba(124,111,224,0.15)', border: '1px solid rgba(124,111,224,0.3)', borderRadius: 8, padding: '9px 18px', color: '#7C6FE0', fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
                  🔄 Reconectar cuenta
                </a>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ background: 'rgba(224,160,48,0.08)', border: '1px solid rgba(224,160,48,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                <p style={{ margin: '0 0 4px', fontSize: 13, color: '#E0A030', fontWeight: 600 }}>⚠ Cuenta no conectada</p>
                <p style={{ margin: 0, fontSize: 12, color: '#7A7A95', lineHeight: 1.6 }}>
                  Sin conectar, los links de pago usarán la cuenta de StockFlow. Conectá tu cuenta para que los pagos vayan directo a vos.
                </p>
              </div>
              <a href="/api/mp/connect" style={{ display: 'inline-block', background: '#009EE3', border: 'none', borderRadius: 8, padding: '11px 20px', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', cursor: 'pointer' }}>
                Conectar con Mercado Pago
              </a>
            </div>
          )}
        </div>

        {/* QR de cobro rápido */}
        {org?.mp_connected && (
          <div style={card}>
            <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#F0EFF8' }}>QR de cobro rápido</p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#7A7A95' }}>Generá un QR para cobros instantáneos sin necesidad de registrar una venta</p>
            <QuickQR orgId={org?.id} />
          </div>
        )}

      </div>
    </div>
  )
}

function QuickQR({ orgId }: { orgId: string }) {
  const [monto, setMonto] = useState('')
  const [desc, setDesc] = useState('')
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const generar = async () => {
    if (!monto) return
    setLoading(true)
    try {
      const res = await window.fetch('/api/mp/qr-rapido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto: +monto, descripcion: desc || 'Cobro rápido' }),
      })
      const data = await res.json()
      if (data.link) setQrUrl(data.link)
      else alert(data.error)
    } catch { alert('Error generando QR') }
    setLoading(false)
  }

  const inp: React.CSSProperties = {
    background: '#1E1E26', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, padding: '9px 12px', color: '#F0EFF8',
    fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
        <div>
          <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Monto ($)</p>
          <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="15000" style={inp} />
        </div>
        <div>
          <p style={{ margin: '0 0 5px', fontSize: 12, color: '#7A7A95' }}>Descripción</p>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ej: Seña remera" style={inp} />
        </div>
      </div>
      <button onClick={generar} disabled={loading || !monto} style={{ background: '#009EE3', border: 'none', borderRadius: 8, padding: '10px 20px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14, opacity: loading ? 0.7 : 1 }}>
        {loading ? 'Generando...' : '📱 Generar QR de cobro'}
      </button>

      {qrUrl && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#7A7A95' }}>Mostrá este QR al cliente para que pague con Mercado Pago</p>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
            alt="QR de pago"
            style={{ borderRadius: 12, border: '4px solid #7C6FE0' }}
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'center' }}>
            <a href={qrUrl} target="_blank" rel="noreferrer" style={{ background: 'rgba(0,158,227,0.15)', border: '1px solid rgba(0,158,227,0.3)', borderRadius: 8, padding: '8px 16px', color: '#009EE3', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
              Abrir link de pago
            </a>
            <button onClick={() => navigator.clipboard.writeText(qrUrl)} style={{ background: 'rgba(124,111,224,0.15)', border: '1px solid rgba(124,111,224,0.3)', borderRadius: 8, padding: '8px 16px', color: '#7C6FE0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              📋 Copiar link
            </button>
          </div>
        </div>
      )}
    </div>
  )
}