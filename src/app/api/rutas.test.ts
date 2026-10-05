import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Tests de las rutas de API donde hay plata o permisos en juego.
 *
 * No prueban la base de datos (eso se verifica corriendo los SQL de db/) sino
 * las DECISIONES de cada ruta: a quién deja pasar, qué llama, qué hace cuando
 * algo falla. Ahí estuvieron los bugs de estas semanas — un CAE que cualquiera
 * podía emitir, un webhook que sumaba dos veces la misma cuota, mails que
 * decían "enviado" sin haber salido.
 *
 * La autenticación corre de verdad (requireUser + tienePermiso); lo que se
 * reemplaza es el cliente de Supabase, Resend, Mercado Pago y la firma del
 * webhook.
 */

// --- Base de datos falsa -----------------------------------------------------
// Imita la forma de la API de supabase-js: métodos encadenables y un await que
// resuelve { data, error }. Cada consulta queda registrada, y la respuesta se
// configura por "tabla.operación".

type Resp = { data?: unknown; error?: unknown }

const db = {
  ops: [] as Array<{ tabla: string; op: string; valores?: unknown; filtros: Record<string, unknown> }>,
  resp: new Map<string, Resp>(),
  rpcResp: {} as Resp,
  rpcLlamadas: [] as Array<{ nombre: string; args: Record<string, unknown> }>,
  usuario: { id: 'u1', email: 'dueno@negocio.com' } as { id: string; email?: string } | null,
  /** Lo que devuelve la API de MP para /v1/payments y /authorized_payments */
  pago: {} as Record<string, unknown>,
  ap: {} as Record<string, unknown>,
}

class ConsultaFalsa implements PromiseLike<Resp> {
  private op: string | null = null
  private valores: unknown
  private filtros: Record<string, unknown> = {}
  constructor(private tabla: string) {}

  select() { if (!this.op) this.op = 'select'; return this }
  insert(v: unknown) { this.op = 'insert'; this.valores = v; return this }
  update(v: unknown) { this.op = 'update'; this.valores = v; return this }
  upsert(v: unknown) { this.op = 'upsert'; this.valores = v; return this }
  delete() { this.op = 'delete'; return this }
  eq(columna: string, valor: unknown) { this.filtros[columna] = valor; return this }
  is() { return this }
  gte() { return this }
  lte() { return this }
  lt() { return this }
  gt() { return this }
  in() { return this }
  order() { return this }
  limit() { return this }
  single() { return this }
  maybeSingle() { return this }

  then<R1 = Resp, R2 = never>(
    alResolver?: ((v: Resp) => R1 | PromiseLike<R1>) | null,
    alFallar?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const op = this.op ?? 'select'
    db.ops.push({ tabla: this.tabla, op, valores: this.valores, filtros: this.filtros })
    const r = db.resp.get(`${this.tabla}.${op}`) ?? {}
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(alResolver, alFallar)
  }
}

function clienteFalso() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: db.usuario },
        error: db.usuario ? null : { message: 'Auth session missing!' },
      }),
      admin: { getUserById: async () => ({ data: { user: { email: 'dueno@negocio.com' } } }) },
    },
    from: (tabla: string) => new ConsultaFalsa(tabla),
    rpc: async (nombre: string, args: Record<string, unknown>) => {
      db.rpcLlamadas.push({ nombre, args })
      return { data: db.rpcResp.data ?? null, error: db.rpcResp.error ?? null }
    },
  }
}

// --- Dobles de módulos ---------------------------------------------------------

const enviarMail = vi.fn()
const reportarFalla = vi.fn()
const firma = { ok: true, reason: '' }

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => clienteFalso() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => clienteFalso() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => clienteFalso() }))
vi.mock('resend', () => ({
  Resend: class { emails = { send: (...a: unknown[]) => enviarMail(...a) } },
}))
vi.mock('@react-email/components', () => ({ render: async () => '<html></html>' }))
vi.mock('@/emails/InviteEmployeeEmail', () => ({ default: () => null }))
vi.mock('@/emails/SaleTicketEmail', () => ({ default: () => null }))
vi.mock('@/emails/SubscriptionActivatedEmail', () => ({ default: () => null }))
vi.mock('@/emails/PaymentFailedEmail', () => ({ default: () => null }))
vi.mock('@/lib/mpSignature', () => ({ verifyMpSignature: () => firma }))
vi.mock('@/lib/reportarFalla', () => ({ reportarFalla: (...a: unknown[]) => reportarFalla(...a) }))
vi.mock('@/lib/ticket', () => ({ ticketBase64: async () => 'PDF' }))
vi.mock('@/lib/arca', () => ({ crearARCAServiceCon: vi.fn() }))
vi.mock('@/lib/crypto', () => ({ decryptSecret: (x: string) => x }))

const fetchMP = vi.fn(async (url: string) => ({
  json: async () => (String(url).includes('authorized_payments') ? db.ap : db.pago),
}))
vi.stubGlobal('fetch', fetchMP)

const webhook = await import('./webhook/mp/route')
const factura = await import('./factura/route')
const invitar = await import('./empleados/invitar/route')
const cobroVenta = await import('./mp/cobro-venta/route')
const linkPago = await import('./cuotas/link-pago/route')
const qrRapido = await import('./mp/qr-rapido/route')

// --- Helpers ---------------------------------------------------------------------

const UUID = '11111111-2222-4333-8444-555555555555'

function pedido(cuerpo: unknown) {
  return new NextRequest('http://localhost/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
}

function comoUsuario(role: string, permisos: Record<string, boolean> = {}, orgId = 'org1') {
  db.resp.set('profiles.select', { data: { id: 'u1', org_id: orgId, role, permisos } })
}

const opsDe = (tabla: string, op?: string) =>
  db.ops.filter(o => o.tabla === tabla && (!op || o.op === op))

beforeEach(() => {
  vi.clearAllMocks()
  db.ops = []
  db.resp.clear()
  db.rpcResp = {}
  db.rpcLlamadas = []
  db.usuario = { id: 'u1', email: 'dueno@negocio.com' }
  db.pago = {}
  db.ap = {}
  firma.ok = true
  enviarMail.mockResolvedValue({ data: { id: 'mail1' }, error: null })
})

// =============================================================================
describe('webhook de Mercado Pago', () => {
  it('rechaza una firma inválida sin consultar nada', async () => {
    firma.ok = false
    const res = await webhook.POST(pedido({ type: 'payment', data: { id: '1' } }))
    expect(res.status).toBe(401)
    expect(fetchMP).not.toHaveBeenCalled()
    expect(db.rpcLlamadas).toHaveLength(0)
  })

  describe('pago de cuota por link', () => {
    beforeEach(() => {
      db.pago = { id: 999, status: 'approved', metadata: { tipo: 'cuota_cliente', cuota_pago_id: 'cp1' } }
    })

    it('registra el cobro por la RPC transaccional, con método mp', async () => {
      const res = await webhook.POST(pedido({ type: 'payment', data: { id: '999' } }))
      expect(res.status).toBe(200)
      expect(db.rpcLlamadas).toEqual([{
        nombre: 'registrar_pago_cuota',
        args: { p_cuota_pago_id: 'cp1', p_metodo: 'mp', p_mp_payment_id: '999' },
      }])
      // Nada de escribir el plan a mano: eso era la carrera que perdía cobros.
      expect(opsDe('cuotas_ventas', 'update')).toHaveLength(0)
      expect(opsDe('cuota_pagos', 'update')).toHaveLength(0)
    })

    it('si el pago no está aprobado no cobra nada', async () => {
      db.pago = { ...db.pago, status: 'pending' }
      await webhook.POST(pedido({ type: 'payment', data: { id: '999' } }))
      expect(db.rpcLlamadas).toHaveLength(0)
    })

    /** Que MP reintente es seguro porque la RPC es idempotente. */
    it('ante un error pasajero devuelve 500 para que MP reintente', async () => {
      db.rpcResp = { error: { message: 'deadlock detected' } }
      const res = await webhook.POST(pedido({ type: 'payment', data: { id: '999' } }))
      expect(res.status).toBe(500)
      expect(reportarFalla).toHaveBeenCalledWith('webhook-mp/cuota-pagada', expect.anything(), expect.anything())
    })

    it('si la cuota no existe no pide reintento: no se arregla reintentando', async () => {
      db.rpcResp = { error: { message: 'CUOTA_INEXISTENTE: no existe esa cuota' } }
      const res = await webhook.POST(pedido({ type: 'payment', data: { id: '999' } }))
      expect(res.status).toBe(200)
    })

    it('una entrega repetida de MP no es un error', async () => {
      db.rpcResp = { data: { ya_estaba: true } }
      const res = await webhook.POST(pedido({ type: 'payment', data: { id: '999' } }))
      expect(res.status).toBe(200)
      expect(reportarFalla).not.toHaveBeenCalled()
    })
  })

  it('cobro de venta por QR: solo pasa a cobrada si seguía pendiente', async () => {
    db.pago = { id: 5, status: 'approved', metadata: { tipo: 'venta_mostrador', venta_id: 'v1' } }
    await webhook.POST(pedido({ type: 'payment', data: { id: '5' } }))

    const [upd] = opsDe('ventas', 'update')
    expect(upd.valores).toMatchObject({ estado: 'cobrada', metodo_pago: 'mercadopago' })
    // El filtro por 'pendiente' es lo que impide revivir una venta anulada.
    expect(upd.filtros).toMatchObject({ id: 'v1', estado: 'pendiente' })
    // Y no se crea otro ingreso: crear_venta_segura ya lo creó al vender.
    expect(opsDe('movimientos', 'insert')).toHaveLength(0)
  })

  describe('aviso de cobro de suscripción rechazado', () => {
    beforeEach(() => {
      db.ap = { preapproval_id: 'pre1', status: 'rejected' }
      db.resp.set('suscripciones.select', { data: { org_id: 'org1', pago_fallido_aviso_at: null } })
      db.resp.set('organizations.select', { data: { name: 'Mi Negocio' } })
      db.resp.set('profiles.select', { data: { id: 'owner1', full_name: 'Ana Pérez' } })
    })

    const marcoElAviso = () =>
      opsDe('suscripciones', 'update').some(o =>
        Object.keys(o.valores as object).includes('pago_fallido_aviso_at'))

    it('si el mail salió, marca el aviso para no repetirlo en 24 h', async () => {
      await webhook.POST(pedido({ type: 'subscription_authorized_payment', data: { id: 'ap1' } }))
      expect(enviarMail).toHaveBeenCalledOnce()
      expect(marcoElAviso()).toBe(true)
    })

    /**
     * Es el aviso de "actualizá tu tarjeta". Si se marca sin haber salido, el
     * cliente pierde el acceso cuando MP agota los reintentos sin enterarse.
     */
    it('si el mail falló, NO lo marca: el próximo rechazo lo vuelve a mandar', async () => {
      enviarMail.mockResolvedValue({ data: null, error: { message: 'domain not verified' } })
      await webhook.POST(pedido({ type: 'subscription_authorized_payment', data: { id: 'ap1' } }))
      expect(marcoElAviso()).toBe(false)
      expect(reportarFalla).toHaveBeenCalledWith('webhook-mp/mail-pago-fallido', expect.anything(), expect.anything())
    })
  })
})

// =============================================================================
describe('factura: CAE y ticket por email', () => {
  beforeEach(() => {
    db.resp.set('ventas.select', {
      data: { id: UUID, org_id: 'org1', nro_factura: 'FC-0001', total: 1000, venta_items: [] },
    })
    db.resp.set('organizations.select', { data: { name: 'Mi Negocio', arca_activado: false } })
  })

  /** Emitir CAE es un acto fiscal ante AFIP. Antes bastaba con ser de la org. */
  it('emitir CAE sin editar_ventas da 403, antes de tocar la venta', async () => {
    comoUsuario('vendedor', { ver_ventas: true, editar_ventas: false })
    const res = await factura.POST(pedido({ venta_id: UUID, usar_arca: true }))
    expect(res.status).toBe(403)
    expect(opsDe('ventas')).toHaveLength(0)
  })

  /** El botón de email no pide permiso: gatear la ruta entera lo habría roto. */
  it('mandar el ticket por mail NO exige editar_ventas', async () => {
    comoUsuario('vendedor', { ver_ventas: true, editar_ventas: false })
    const res = await factura.POST(pedido({ venta_id: UUID, email_cliente: 'cliente@mail.com' }))
    expect(res.status).toBe(200)
    expect(enviarMail).toHaveBeenCalledOnce()
  })

  it('una venta de otro negocio se responde como inexistente', async () => {
    comoUsuario('owner')
    db.resp.set('ventas.select', { data: { id: UUID, org_id: 'OTRA-ORG' } })
    const res = await factura.POST(pedido({ venta_id: UUID }))
    expect(res.status).toBe(404)
  })

  it('si el mail falla lo dice, en vez de confirmar el envío', async () => {
    comoUsuario('owner')
    enviarMail.mockResolvedValue({ data: null, error: { message: 'invalid to' } })
    const res = await factura.POST(pedido({ venta_id: UUID, email_cliente: 'cliente@mail.com' }))
    const cuerpo = await res.json()
    // ok sigue en true a propósito: la ruta pudo haber emitido un CAE, y eso
    // no se esconde detrás de una falla del mail.
    expect(cuerpo.ok).toBe(true)
    expect(cuerpo.email_error).toBeTruthy()
    expect(reportarFalla).toHaveBeenCalled()
  })

  it('si el mail sale, email_error viene vacío', async () => {
    comoUsuario('owner')
    const res = await factura.POST(pedido({ venta_id: UUID, email_cliente: 'cliente@mail.com' }))
    expect((await res.json()).email_error).toBeNull()
  })
})

// =============================================================================
describe('invitar empleados', () => {
  beforeEach(() => {
    db.resp.set('invitaciones.insert', { data: { token: 'tok123' } })
    db.resp.set('organizations.select', { data: { name: 'Mi Negocio' } })
  })

  it('un admin no puede invitar aunque tenga gestionar_usuarios', async () => {
    comoUsuario('admin', { gestionar_usuarios: true })
    const res = await invitar.POST(pedido({ email: 'nuevo@mail.com', role: 'vendedor' }))
    expect(res.status).toBe(403)
    expect(opsDe('invitaciones')).toHaveLength(0)
    expect(enviarMail).not.toHaveBeenCalled()
  })

  it('el dueño invita, y la org sale de su perfil, nunca del pedido', async () => {
    comoUsuario('owner', {}, 'org-invita')
    const res = await invitar.POST(pedido({ email: 'nuevo@mail.com', role: 'vendedor', org_id: 'OTRA' }))
    expect(res.status).toBe(200)
    const [ins] = opsDe('invitaciones', 'insert')
    expect(ins.valores).toMatchObject({ org_id: 'org-invita', email: 'nuevo@mail.com', role: 'vendedor' })
  })

  it('si el mail no sale, borra la invitación y lo dice', async () => {
    comoUsuario('owner', {}, 'org-mail')
    enviarMail.mockResolvedValue({ data: null, error: { message: 'domain not verified' } })
    const res = await invitar.POST(pedido({ email: 'nuevo@mail.com', role: 'vendedor' }))
    expect(res.status).toBe(502)
    const [del] = opsDe('invitaciones', 'delete')
    expect(del.filtros).toMatchObject({ token: 'tok123' })
  })

  it('corta a partir de la invitación 11 en una hora', async () => {
    comoUsuario('owner', {}, 'org-rate-limit')
    for (let i = 0; i < 10; i++) {
      const ok = await invitar.POST(pedido({ email: `p${i}@mail.com`, role: 'vendedor' }))
      expect(ok.status).toBe(200)
    }
    const res = await invitar.POST(pedido({ email: 'once@mail.com', role: 'vendedor' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })
})

// =============================================================================
describe('rutas de cobro: exigen el mismo permiso que el botón', () => {
  it('cobrar una venta por QR sin editar_ventas da 403', async () => {
    comoUsuario('repositor', { editar_ventas: false })
    const res = await cobroVenta.POST(pedido({ venta_id: UUID }))
    expect(res.status).toBe(403)
  })

  it('generar el link de una cuota sin gestionar_cuotas da 403', async () => {
    comoUsuario('vendedor', { gestionar_cuotas: false })
    const res = await linkPago.POST(pedido({
      cuota_venta_id: UUID, cliente_email: 'c@mail.com', monto: 100, descripcion: 'Cuota',
    }))
    expect(res.status).toBe(403)
  })

  it('el QR rápido sin ver_configuracion da 403', async () => {
    comoUsuario('admin', { ver_configuracion: false })
    const res = await qrRapido.POST(pedido({ monto: 100, descripcion: 'x' }))
    expect(res.status).toBe(403)
  })

  /**
   * El dueño pasa el permiso aunque no tenga claves cargadas. Sin MP
   * conectado la ruta responde 400 — lo que importa es que NO sea 403.
   */
  it('el dueño pasa siempre el chequeo de permiso', async () => {
    comoUsuario('owner', {})
    const res = await qrRapido.POST(pedido({ monto: 100, descripcion: 'x' }))
    expect(res.status).not.toBe(403)
  })

  it('sin sesión da 401', async () => {
    db.usuario = null
    const res = await cobroVenta.POST(pedido({ venta_id: UUID }))
    expect(res.status).toBe(401)
  })
})
