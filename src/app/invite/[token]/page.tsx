// Pagina publica de aceptacion de invitacion.
// El empleado llega aca desde el link que recibio por email.
// Server-side valida el token con service role (RLS no aplica aca).

import { createClient } from '@supabase/supabase-js'
import { COLORS } from '@/lib/theme'
import InviteForm from './InviteForm'

export const dynamic = 'force-dynamic'

type Invitacion = {
  id: string
  email: string
  role: string
  org_id: string
  accepted: boolean
  expires_at: string
  organizations: { name: string } | null
}

async function fetchInvitacion(token: string): Promise<Invitacion | null> {
  if (!token || token.length < 16) return null
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await supabase
      .from('invitaciones')
      .select('id, email, role, org_id, accepted, expires_at, organizations(name)')
      .eq('token', token)
      .single()
    return data as unknown as Invitacion | null
  } catch {
    return null
  }
}

const ROLES_DESC: Record<string, string> = {
  admin: 'Administrador — acceso completo excepto gestión de usuarios',
  vendedor: 'Vendedor — registra ventas y consulta inventario',
  repositor: 'Repositor — edita el inventario',
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const inv = await fetchInvitacion(token)

  const layoutBg: React.CSSProperties = {
    minHeight: '100vh',
    background: '#F0FDFA',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 20px',
  }

  const card: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #CCFBF1',
    borderRadius: 16,
    padding: 36,
    width: '100%',
    maxWidth: 460,
    boxShadow: '0 8px 32px rgba(4,47,46,0.08)',
  }

  // ── Errores ──────────────────────────────────────────────
  if (!inv) {
    return (
      <div style={layoutBg}>
        <div style={card}>
          <Brand />
          <h1 style={{ color: '#9F1239', fontSize: 22, fontWeight: 800, margin: '20px 0 8px' }}>
            Invitación no válida
          </h1>
          <p style={{ color: '#1C4542', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Este link de invitación no existe o ya fue usado. Pedile a quien te invitó que te
            envíe uno nuevo.
          </p>
        </div>
      </div>
    )
  }

  if (inv.accepted) {
    return (
      <div style={layoutBg}>
        <div style={card}>
          <Brand />
          <h1 style={{ color: '#115E59', fontSize: 22, fontWeight: 800, margin: '20px 0 8px' }}>
            Esta invitación ya fue aceptada
          </h1>
          <p style={{ color: '#1C4542', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
            Tu cuenta ya está activa. Podés ingresar con tu email y la contraseña que creaste.
          </p>
          <a href="/login" style={{
            display: 'inline-block', background: COLORS.primary, color: '#fff',
            padding: '11px 22px', borderRadius: 10, textDecoration: 'none',
            fontSize: 14, fontWeight: 700,
            boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
          }}>
            Iniciar sesión →
          </a>
        </div>
      </div>
    )
  }

  const expirada = new Date(inv.expires_at) < new Date()
  if (expirada) {
    return (
      <div style={layoutBg}>
        <div style={card}>
          <Brand />
          <h1 style={{ color: '#9F1239', fontSize: 22, fontWeight: 800, margin: '20px 0 8px' }}>
            Invitación expirada
          </h1>
          <p style={{ color: '#1C4542', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Esta invitación venció el <strong>{new Date(inv.expires_at).toLocaleDateString('es-AR')}</strong>.
            Pedile a quien te invitó que te envíe una nueva.
          </p>
        </div>
      </div>
    )
  }

  // ── Form de aceptación ───────────────────────────────────
  const orgName = inv.organizations?.name ?? 'StockFlow'
  return (
    <div style={layoutBg}>
      <div style={card}>
        <Brand />
        <p style={{
          margin: '20px 0 4px', fontSize: 12, color: '#6B7280',
          textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em',
        }}>
          Invitación
        </p>
        <h1 style={{ color: '#042F2E', fontSize: 22, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.01em' }}>
          Te invitaron a <span style={{ color: COLORS.primary }}>{orgName}</span>
        </h1>
        <p style={{ color: '#1C4542', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
          Vas a entrar como <strong style={{ textTransform: 'capitalize' }}>{inv.role}</strong>.
          {ROLES_DESC[inv.role] ? <><br /><span style={{ color: '#6B7280', fontSize: 13 }}>{ROLES_DESC[inv.role]}</span></> : null}
        </p>

        <div style={{
          background: '#F0FDFA',
          border: '1px solid #CCFBF1',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 20,
          fontSize: 13,
          color: '#115E59',
        }}>
          <strong>Tu email:</strong> {inv.email}
        </div>

        <InviteForm token={token} email={inv.email} />
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 36, height: 36, background: COLORS.primary, color: '#fff',
        borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 18,
      }}>S</div>
      <span style={{ color: '#042F2E', fontWeight: 800, fontSize: 20 }}>StockFlow</span>
    </div>
  )
}
