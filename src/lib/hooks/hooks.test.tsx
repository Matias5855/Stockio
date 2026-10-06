// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

/**
 * Tests de los hooks de datos.
 *
 * Lo que se fija acá es la decisión que toma cada hook entre ir al servidor o
 * guardar local, porque ahí estuvieron los bugs que costaban plata:
 *
 *  · La cola fantasma: useTableSync cacheaba con saveLocal (que SIEMPRE
 *    encola), y cada apertura de una pantalla agendaba devolverle al servidor
 *    lo que el servidor acababa de mandar. En producción llegó a haber ~100.
 *  · Errores de Supabase que nadie miraba: supabase-js devuelve { error } en
 *    vez de lanzar, y la pantalla mostraba como guardado algo que no se guardó.
 *  · El cobro de cuotas: con wifi conectado y sin internet, `navigator.onLine`
 *    da true y el cobro fallaba en vez de caer a la cola.
 *
 * Corren en jsdom con renderHook. Supabase, IndexedDB y el syncManager están
 * reemplazados por dobles: se prueba qué llama cada hook, no la base.
 */

// --- Dobles ------------------------------------------------------------------

type Resp = { data?: unknown; error?: unknown }

const sb = {
  filas: {} as Record<string, unknown[]>,
  errorPorTabla: {} as Record<string, unknown>,
  rpcResp: {} as Resp,
  /** Si está, la rpc RECHAZA la promesa (fetch que revienta) en vez de devolver { error }. */
  rpcLanza: null as Error | null,
  ops: [] as Array<{ tabla: string; op: string; valores?: unknown }>,
  rpcs: [] as Array<{ nombre: string; args: Record<string, unknown> }>,
}

class Consulta implements PromiseLike<Resp> {
  private op = 'select'
  private valores: unknown
  constructor(private tabla: string) {}
  select() { return this }
  eq() { return this }
  order() { return this }
  limit() { return this }
  insert(v: unknown) { this.op = 'insert'; this.valores = v; return this }
  update(v: unknown) { this.op = 'update'; this.valores = v; return this }
  delete() { this.op = 'delete'; return this }
  then<R1 = Resp, R2 = never>(
    ok?: ((v: Resp) => R1 | PromiseLike<R1>) | null,
    mal?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    sb.ops.push({ tabla: this.tabla, op: this.op, valores: this.valores })
    const error = sb.errorPorTabla[this.tabla] ?? null
    const data = this.op === 'select' && !error ? (sb.filas[this.tabla] ?? []) : null
    return Promise.resolve({ data, error }).then(ok, mal)
  }
}

const clienteFalso = {
  from: (t: string) => new Consulta(t),
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    sb.rpcs.push({ nombre, args })
    if (sb.rpcLanza) throw sb.rpcLanza
    return { data: sb.rpcResp.data ?? null, error: sb.rpcResp.error ?? null }
  },
  channel: () => ({ on() { return this }, subscribe() { return this } }),
  removeChannel: () => {},
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => clienteFalso,
  getOrgId: async () => 'org1',
}))

const idb = {
  saveLocal: vi.fn(async () => {}),
  cacheLocal: vi.fn(async () => {}),
  encolarAccion: vi.fn(async () => {}),
  getLocal: vi.fn(async () => [] as unknown[]),
}
vi.mock('@/lib/db/indexeddb', () => ({
  saveLocal: (...a: unknown[]) => idb.saveLocal(...(a as [])),
  cacheLocal: (...a: unknown[]) => idb.cacheLocal(...(a as [])),
  encolarAccion: (...a: unknown[]) => idb.encolarAccion(...(a as [])),
  getLocal: (...a: unknown[]) => idb.getLocal(...(a as [])),
}))
vi.mock('@/lib/sync/syncManager', () => ({ syncManager: { sync: async () => {} } }))
vi.mock('@/lib/historial', () => ({ logHistorial: () => {} }))

const { useCuotas, vencimientoCuota } = await import('./useCuotas')
const { useVentas } = await import('./useVentas')
const { useStock } = await import('./useStock')

let enLinea = true
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => enLinea })

// --- Datos ---------------------------------------------------------------------

function plan(over: Record<string, unknown> = {}) {
  return {
    id: 'plan1', org_id: 'org1', cliente_nombre: 'Juana', cliente_email: null, cliente_tel: null,
    monto_total: 3000, monto_pagado: 1000, cantidad_cuotas: 3, cuotas_pagadas: 1,
    monto_cuota: 1000, interes_pct: 0, frecuencia: 'mensual', estado: 'activa',
    proximo_venc: null, mp_link_pago: null, created_at: '2026-10-01T10:00:00Z',
    cuota_pagos: [
      { id: 'cp1', nro_cuota: 1, monto: 1000, fecha_venc: '2026-11-01', fecha_pago: '2026-10-02', estado: 'pagada', metodo_pago: 'efectivo', mp_payment_id: null },
      { id: 'cp2', nro_cuota: 2, monto: 1000, fecha_venc: '2026-12-01', fecha_pago: null, estado: 'pendiente', metodo_pago: '', mp_payment_id: null },
      { id: 'cp3', nro_cuota: 3, monto: 1000, fecha_venc: '2027-01-01', fecha_pago: null, estado: 'pendiente', metodo_pago: '', mp_payment_id: null },
    ],
    ...over,
  }
}

/** Última escritura local en esa tabla. La primera suele ser el cache del montaje. */
function ultimoCache(tabla: string) {
  const llamadas = idb.cacheLocal.mock.calls
    .map(c => c as unknown as [string, Record<string, unknown>])
    .filter(([t]) => t === tabla)
  return llamadas[llamadas.length - 1]?.[1]
}

async function montar<T>(hook: () => T & { loading: boolean }) {
  const r = renderHook(hook)
  await waitFor(() => expect(r.result.current.loading).toBe(false))
  return r
}

beforeEach(() => {
  vi.clearAllMocks()
  enLinea = true
  sb.filas = { cuotas_ventas: [plan()], ventas: [], productos: [] }
  sb.errorPorTabla = {}
  sb.rpcResp = {}
  sb.rpcLanza = null
  sb.ops = []
  sb.rpcs = []
  idb.getLocal.mockResolvedValue([])
  localStorage.clear()
})

// =============================================================================
describe('useTableSync (a través de los hooks)', () => {
  /** La cola fantasma: cachear lo que vino del servidor NO tiene que encolar. */
  it('lo que llega del servidor se cachea con cacheLocal, nunca con saveLocal', async () => {
    sb.filas.productos = [
      { id: 'p1', nombre: 'Remera', activo: true },
      { id: 'p2', nombre: 'Buzo', activo: true },
    ]
    await montar(() => useStock())
    expect(idb.cacheLocal).toHaveBeenCalledTimes(2)
    expect(idb.saveLocal).not.toHaveBeenCalled()
  })

  it('sin conexión lee de IndexedDB y descarta los productos dados de baja', async () => {
    enLinea = false
    idb.getLocal.mockResolvedValue([
      { id: 'p1', nombre: 'Remera', activo: true },
      { id: 'p2', nombre: 'Viejo', activo: false },
    ])
    const { result } = await montar(() => useStock())
    expect(result.current.productos.map(p => p.id)).toEqual(['p1'])
    expect(sb.ops).toHaveLength(0)
  })
})

// =============================================================================
describe('useCuotas: cobrar una cuota', () => {
  it('con conexión cobra por la RPC y no encola nada', async () => {
    sb.rpcResp = { data: { ya_estaba: false, cuotas_pagadas: 2, completada: false } }
    const { result } = await montar(() => useCuotas())

    let res!: Awaited<ReturnType<typeof result.current.cobrarCuota>>
    await act(async () => { res = await result.current.cobrarCuota('cp2', 'plan1', 1000) })

    expect(res).toMatchObject({ offline: false, yaEstaba: false, cuotasPagadas: 2 })
    expect(sb.rpcs).toHaveLength(1)
    expect(sb.rpcs[0].nombre).toBe('registrar_pago_cuota')
    expect(sb.rpcs[0].args).toMatchObject({ p_cuota_pago_id: 'cp2', p_metodo: 'efectivo' })
    expect(idb.encolarAccion).not.toHaveBeenCalled()
  })

  it('si la cuota ya estaba pagada lo informa', async () => {
    sb.rpcResp = { data: { ya_estaba: true } }
    const { result } = await montar(() => useCuotas())
    let res!: Awaited<ReturnType<typeof result.current.cobrarCuota>>
    await act(async () => { res = await result.current.cobrarCuota('cp2', 'plan1', 1000) })
    expect(res.yaEstaba).toBe(true)
  })

  /** Una respuesta real del servidor se muestra; encolarla sería reintentar algo que va a fallar siempre. */
  it('un error del servidor que no es de red se muestra y NO se encola', async () => {
    sb.rpcResp = { error: { message: 'SIN_PERMISO: no tenés permiso para cobrar cuotas' } }
    const { result } = await montar(() => useCuotas())
    await act(async () => {
      await expect(result.current.cobrarCuota('cp2', 'plan1', 1000)).rejects.toThrow(/SIN_PERMISO/)
    })
    expect(idb.encolarAccion).not.toHaveBeenCalled()
  })

  /**
   * Wifi conectado sin internet: navigator.onLine da true y la llamada muere.
   * Antes el cobro fallaba; ahora cae a la cola. Es seguro porque la RPC es
   * idempotente, y por eso el reintento tiene que llevar EXACTAMENTE los mismos
   * argumentos — sobre todo el mismo id de movimiento.
   */
  it('si la red se cae a mitad de camino, encola el MISMO pedido', async () => {
    sb.rpcResp = { error: { message: 'TypeError: Failed to fetch' } }
    const { result } = await montar(() => useCuotas())
    let res!: Awaited<ReturnType<typeof result.current.cobrarCuota>>
    await act(async () => { res = await result.current.cobrarCuota('cp2', 'plan1', 1000) })

    expect(res.offline).toBe(true)
    expect(idb.encolarAccion).toHaveBeenCalledOnce()
    const [rpc, args] = idb.encolarAccion.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(rpc).toBe('registrar_pago_cuota')
    expect(args).toEqual(sb.rpcs[0].args)
  })

  it('también cae a la cola si el fetch revienta en vez de devolver error', async () => {
    sb.rpcLanza = new TypeError('Failed to fetch')
    const { result } = await montar(() => useCuotas())
    let res!: Awaited<ReturnType<typeof result.current.cobrarCuota>>
    await act(async () => { res = await result.current.cobrarCuota('cp2', 'plan1', 1000) })
    expect(res.offline).toBe(true)
    expect(idb.encolarAccion).toHaveBeenCalledOnce()
  })

  describe('sin conexión', () => {
    it('no llama al servidor: encola y refleja el cobro en la base local', async () => {
      const { result } = await montar(() => useCuotas())
      enLinea = false
      await act(async () => { await result.current.cobrarCuota('cp2', 'plan1', 1000) })

      expect(sb.rpcs).toHaveLength(0)
      expect(idb.encolarAccion).toHaveBeenCalledOnce()

      const planLocal = ultimoCache('cuotas_ventas') as unknown as ReturnType<typeof plan>
      expect(planLocal.cuotas_pagadas).toBe(2)
      expect(planLocal.monto_pagado).toBe(2000)
      expect(planLocal.cuota_pagos.find(c => c.id === 'cp2')!.estado).toBe('pagada')
      // Y no toca las otras cuotas.
      expect(planLocal.cuota_pagos.find(c => c.id === 'cp3')!.estado).toBe('pendiente')
    })

    /**
     * El ingreso que se muestra local y el que va a crear el servidor tienen
     * que ser la misma fila. Si no, Finanzas cuenta la plata dos veces.
     */
    it('el movimiento local lleva el mismo id que viaja a la RPC', async () => {
      const { result } = await montar(() => useCuotas())
      enLinea = false
      await act(async () => { await result.current.cobrarCuota('cp2', 'plan1', 1000) })

      const [, args] = idb.encolarAccion.mock.calls[0] as unknown as [string, Record<string, unknown>]
      const mov = ultimoCache('movimientos')!
      expect(mov.id).toBe(args.p_movimiento_id)
      expect(mov).toMatchObject({ tipo: 'ingreso', categoria_nombre: 'Cuotas', monto: 1000 })
    })

    it('la última cuota marca el plan como completado', async () => {
      sb.filas.cuotas_ventas = [plan({ cuotas_pagadas: 2, monto_pagado: 2000 })]
      const { result } = await montar(() => useCuotas())
      enLinea = false
      let res!: Awaited<ReturnType<typeof result.current.cobrarCuota>>
      await act(async () => { res = await result.current.cobrarCuota('cp3', 'plan1', 1000) })
      expect(res.completada).toBe(true)
      const planLocal = ultimoCache('cuotas_ventas')!
      expect(planLocal.estado).toBe('completada')
    })
  })
})

// =============================================================================
/**
 * Las fechas de un plan creado sin conexión son una simulación del trigger
 * generar_cuotas() (db/referencia_generar_cuotas.sql). Si no coinciden con las
 * que después genera el servidor, el vendedor le dice una fecha al cliente y el
 * sistema muestra otra.
 */
describe('vencimientoCuota replica al trigger', () => {
  it('la primera cuota vence un intervalo después del inicio, no el mismo día', () => {
    expect(vencimientoCuota('2026-10-05', 'mensual', 1)).toBe('2026-11-05')
  })

  it('el mes se recorta al último día, como Postgres', () => {
    expect(vencimientoCuota('2026-01-31', 'mensual', 1)).toBe('2026-02-28')
    expect(vencimientoCuota('2028-01-31', 'mensual', 1)).toBe('2028-02-29')
  })

  /** Cada cuota sale de fecha_inicio, no de la anterior: si no, el recorte se arrastra. */
  it('cada cuota se calcula desde el inicio, así el recorte no se arrastra', () => {
    expect(vencimientoCuota('2026-01-31', 'mensual', 2)).toBe('2026-03-31')
    expect(vencimientoCuota('2026-01-31', 'mensual', 13)).toBe('2027-02-28')
  })

  it('cruza de año', () => {
    expect(vencimientoCuota('2026-11-15', 'mensual', 3)).toBe('2027-02-15')
  })

  it('semanal y quincenal son días corridos', () => {
    expect(vencimientoCuota('2026-10-05', 'semanal', 2)).toBe('2026-10-19')
    expect(vencimientoCuota('2026-10-05', 'quincenal', 1)).toBe('2026-10-20')
    expect(vencimientoCuota('2026-12-25', 'quincenal', 1)).toBe('2027-01-09')
  })
})

describe('useCuotas: crear un plan', () => {
  const datos = {
    cliente_nombre: 'Rosa', cliente_email: '', cliente_tel: '',
    monto_total: 3000, monto_cuota: 1000, cantidad_cuotas: 3, interes_pct: 0,
    frecuencia: 'mensual', fecha_inicio: '2026-01-31', notas_venta: 'Plan de cuotas: 3 pagos',
  }

  it('con conexión va por la RPC con un id generado en el cliente', async () => {
    sb.rpcResp = { data: { id: 'x', ya_existia: false } }
    const { result } = await montar(() => useCuotas())
    let res!: Awaited<ReturnType<typeof result.current.crearPlan>>
    await act(async () => { res = await result.current.crearPlan(datos) })

    expect(res.offline).toBe(false)
    expect(sb.rpcs[0].nombre).toBe('crear_plan_cuotas')
    // El id viaja a la RPC: es lo que la hace idempotente.
    expect(sb.rpcs[0].args.p_plan_id).toBe(res.id)
    expect(sb.rpcs[0].args.p_plan).toEqual(datos)
    expect(idb.encolarAccion).not.toHaveBeenCalled()
  })

  it('un error real del servidor se muestra y no se encola', async () => {
    sb.rpcResp = { error: { message: 'SIN_PERMISO: no tenés permiso para crear planes de cuotas' } }
    const { result } = await montar(() => useCuotas())
    await act(async () => {
      await expect(result.current.crearPlan(datos)).rejects.toThrow(/SIN_PERMISO/)
    })
    expect(idb.encolarAccion).not.toHaveBeenCalled()
  })

  it('si la red se cae a mitad de camino, encola el mismo pedido con el mismo id', async () => {
    sb.rpcResp = { error: { message: 'TypeError: Failed to fetch' } }
    const { result } = await montar(() => useCuotas())
    await act(async () => { await result.current.crearPlan(datos) })
    const [rpc, args] = idb.encolarAccion.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(rpc).toBe('crear_plan_cuotas')
    expect(args).toEqual(sb.rpcs[0].args)
  })

  it('sin conexión lo muestra con cuotas simuladas y marcado como pendiente de subir', async () => {
    const { result } = await montar(() => useCuotas())
    enLinea = false
    let res!: Awaited<ReturnType<typeof result.current.crearPlan>>
    await act(async () => { res = await result.current.crearPlan(datos) })

    expect(res.offline).toBe(true)
    expect(sb.rpcs).toHaveLength(0)
    const local = ultimoCache('cuotas_ventas') as unknown as ReturnType<typeof plan> & { _pendiente_sync: boolean }
    expect(local.id).toBe(res.id)
    expect(local._pendiente_sync).toBe(true)
    expect(local.cuota_pagos.map(c => c.fecha_venc)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30'])
    expect(local.cuota_pagos.every(c => c.estado === 'pendiente' && c.monto === 1000)).toBe(true)
  })

  /**
   * Las cuotas de un plan sin subir tienen ids locales que el servidor no va a
   * tener nunca: un cobro encolado contra ellos fallaría para siempre.
   */
  it('no deja cobrar una cuota de un plan que todavía no subió', async () => {
    sb.filas.cuotas_ventas = [plan({ _pendiente_sync: true })]
    const { result } = await montar(() => useCuotas())
    await act(async () => {
      await expect(result.current.cobrarCuota('cp2', 'plan1', 1000)).rejects.toThrow(/PLAN_SIN_SUBIR/)
    })
    expect(sb.rpcs).toHaveLength(0)
    expect(idb.encolarAccion).not.toHaveBeenCalled()
  })
})

// =============================================================================
describe('useVentas', () => {
  const venta = {
    cliente_nombre: 'Pedro', fecha: '2026-10-05', estado: 'cobrada' as const, metodo_pago: 'efectivo',
    subtotal: 500, descuento: 0, total: 500, notas: null,
  }
  const items = [{ producto_id: 'p1', producto_nombre: 'Remera', cantidad: 1, precio_unitario: 500 }]

  it('con conexión vende por la RPC, bloqueando si no hay stock', async () => {
    sb.rpcResp = { data: { id: 'srv1', nro_factura: 'FC-0007' } }
    const { result } = await montar(() => useVentas())
    let creada!: Awaited<ReturnType<typeof result.current.crearVenta>>
    await act(async () => { creada = await result.current.crearVenta(venta, items) })

    expect(sb.rpcs[0].nombre).toBe('crear_venta_segura')
    expect(sb.rpcs[0].args).toMatchObject({ p_permitir_sin_stock: false, p_venta_id: null, p_items: items })
    // La venta toma el id y el número que asignó el servidor.
    expect(creada).toMatchObject({ id: 'srv1', nro_factura: 'FC-0007' })
    expect(idb.saveLocal).not.toHaveBeenCalled()
  })

  it('traduce la falta de stock a un mensaje entendible', async () => {
    sb.rpcResp = { error: { message: 'STOCK_INSUFICIENTE:Remera' } }
    const { result } = await montar(() => useVentas())
    await act(async () => {
      await expect(result.current.crearVenta(venta, items)).rejects.toThrow('No hay stock suficiente de "Remera"')
    })
    expect(result.current.ventas).toHaveLength(0)
  })

  it('traduce la falta de permiso sin mostrar el prefijo técnico', async () => {
    sb.rpcResp = { error: { message: 'SIN_PERMISO: no tenés permiso para registrar ventas' } }
    const { result } = await montar(() => useVentas())
    await act(async () => {
      await expect(result.current.crearVenta(venta, items)).rejects.toThrow('No tenés permiso para registrar ventas.')
    })
  })

  it('sin conexión guarda la venta con sus items para subirla después', async () => {
    const { result } = await montar(() => useVentas())
    enLinea = false
    await act(async () => { await result.current.crearVenta(venta, items) })

    expect(sb.rpcs).toHaveLength(0)
    expect(idb.saveLocal).toHaveBeenCalledOnce()
    const [tabla, guardada, op] = idb.saveLocal.mock.calls[0] as unknown as [string, Record<string, unknown>, string]
    expect(tabla).toBe('ventas')
    expect(op).toBe('insert')
    expect(guardada.venta_items).toEqual(items)
    expect(result.current.ventas).toHaveLength(1)
  })

  it('anular exige conexión', async () => {
    const { result } = await montar(() => useVentas())
    enLinea = false
    await act(async () => {
      await expect(result.current.anularVenta('v1')).rejects.toThrow('Necesitás conexión')
    })
    expect(sb.rpcs).toHaveLength(0)
  })
})

// =============================================================================
describe('useStock: un error del servidor no se muestra como guardado', () => {
  it('si el insert falla, lanza y el producto NO aparece en la lista', async () => {
    const { result } = await montar(() => useStock())
    sb.errorPorTabla.productos = { message: 'duplicate key value violates unique constraint' }
    await act(async () => {
      await expect(result.current.addProducto({ nombre: 'Remera' })).rejects.toThrow(/duplicate key/)
    })
    expect(result.current.productos).toHaveLength(0)
  })

  it('sin conexión, editar encola el cambio', async () => {
    idb.getLocal.mockResolvedValue([{ id: 'p1', nombre: 'Remera', activo: true, cantidad: 3 }])
    enLinea = false
    const { result } = await montar(() => useStock())
    await act(async () => { await result.current.updateProducto('p1', { cantidad: 5 }) })

    expect(idb.saveLocal).toHaveBeenCalledWith('productos', expect.objectContaining({ id: 'p1', cantidad: 5 }), 'update')
    expect(result.current.productos[0].cantidad).toBe(5)
  })
})
