import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Tests del syncManager.
 *
 * Este archivo existe por lo que pasó, no por completitud: es la pieza donde
 * aparecieron los únicos bugs de todo el proyecto que PERDÍAN DATOS de verdad.
 *
 *  · `supabase-js` no lanza excepción, devuelve { error }. El upsert y el
 *    delete no lo miraban y llamaban markSynced() igual, borrando el ítem de
 *    la cola local como si hubiera subido. Los cambios offline de productos,
 *    movimientos y borrados se perdían.
 *  · La cola fantasma: useTableSync cacheaba con saveLocal (que SIEMPRE encola)
 *    lo que el servidor acababa de mandar.
 *
 * Por eso lo que se fija acá es una sola regla, mirada desde todos los ángulos:
 * **si la subida no se confirmó, el ítem NO se saca de la cola.** Mientras esté
 * en la cola se reintenta; si se sacó de más, la venta no existe en ningún lado.
 *
 * El entorno de vitest es `node`: no hay window, localStorage, navigator ni
 * IndexedDB. Se stubean los globales y se mockean los módulos de datos, así que
 * lo que se ejerce es la lógica de decisión del manager, que es donde estuvo el
 * problema.
 */

// --- Dobles de los módulos ---------------------------------------------------
// vi.mock se hoistea arriba del import, así que el singleton del syncManager se
// construye ya con el cliente falso.

const markSynced = vi.fn()
const quitarDeCola = vi.fn()
const getPendingSync = vi.fn()
const reportarFalla = vi.fn()

type Resultado = { data?: unknown; error?: unknown }

const estado = {
  /** Lo que devuelve auth.getUser() */
  usuario: { id: 'u1' } as unknown,
  errorDeSesion: null as unknown,
  /** Error a devolver en el próximo upsert/delete, por tabla */
  errorPorTabla: new Map<string, unknown>(),
  /** Error a devolver en la próxima rpc */
  errorRpc: null as unknown,
  llamadas: [] as Array<{ tipo: string; tabla?: string; args?: unknown }>,
}

/**
 * Consulta encadenable y "thenable", como la de supabase-js: cada método
 * devuelve this y el await resuelve { data, error }. No simula la base — solo
 * la forma de la API, que es lo que el manager consume.
 */
class ConsultaFalsa implements PromiseLike<Resultado> {
  private op = 'select'
  constructor(private tabla: string) {}

  select() { return this }
  eq() { return this }
  gt() { return this }
  order() { return this }
  limit() { return this }

  delete() { this.op = 'delete'; return this }
  upsert(valor: unknown) {
    this.op = 'upsert'
    estado.llamadas.push({ tipo: 'upsert', tabla: this.tabla, args: valor })
    return this
  }

  then<R1 = Resultado, R2 = never>(
    alResolver?: ((v: Resultado) => R1 | PromiseLike<R1>) | null,
    alFallar?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    if (this.op === 'delete') estado.llamadas.push({ tipo: 'delete', tabla: this.tabla })
    const error = this.op === 'select' ? null : (estado.errorPorTabla.get(this.tabla) ?? null)
    return Promise.resolve({ data: [], error }).then(alResolver, alFallar)
  }
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: estado.errorDeSesion ? null : estado.usuario },
        error: estado.errorDeSesion,
      }),
    },
    from: (tabla: string) => new ConsultaFalsa(tabla),
    rpc: async (nombre: string, args: unknown) => {
      estado.llamadas.push({ tipo: 'rpc', tabla: nombre, args })
      return { data: null, error: estado.errorRpc }
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  }),
}))

vi.mock('@/lib/db/indexeddb', () => ({
  getPendingSync: () => getPendingSync(),
  markSynced: (...a: unknown[]) => markSynced(...a),
  quitarDeCola: (...a: unknown[]) => quitarDeCola(...a),
  // El pull no es lo que se está probando: se le da una base que acepta todo.
  getLocalDB: async () => ({
    transaction: () => ({
      objectStore: () => ({ clear: async () => {}, put: async () => {} }),
      done: Promise.resolve(),
    }),
  }),
}))

vi.mock('@/lib/reportarFalla', () => ({
  reportarFalla: (...a: unknown[]) => reportarFalla(...a),
}))

// --- Globales que el manager da por sentados ---------------------------------
const almacen = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => almacen.get(k) ?? null,
  setItem: (k: string, v: string) => { almacen.set(k, v) },
  removeItem: (k: string) => { almacen.delete(k) },
})
vi.stubGlobal('navigator', { onLine: true })
vi.stubGlobal('window', {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
})

const { syncManager } = await import('./syncManager')

/** Un ítem de la cola, con lo mínimo que mira pushItem. */
function enCola(over: Partial<{
  id: string; tabla: string; recordId: string
  operacion: 'insert' | 'update' | 'delete'
  data: Record<string, unknown>
}> = {}) {
  return {
    id: 'cola_1',
    tabla: 'productos',
    recordId: 'p1',
    operacion: 'update' as const,
    data: { id: 'p1', nombre: 'Remera' },
    timestamp: Date.now(),
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  almacen.clear()
  almacen.set('stk_org_id', 'org1')
  estado.usuario = { id: 'u1' }
  estado.errorDeSesion = null
  estado.errorPorTabla.clear()
  estado.errorRpc = null
  estado.llamadas = []
  getPendingSync.mockResolvedValue([])
})

describe('lo que NO se puede perder: la cola', () => {
  it('saca el item de la cola cuando la subida salió bien', async () => {
    getPendingSync.mockResolvedValue([enCola()])
    await syncManager.sync()
    expect(markSynced).toHaveBeenCalledWith('productos', 'p1', 'cola_1')
  })

  /**
   * ESTE es el bug que perdía datos. supabase-js no lanza: devuelve { error }.
   * Si nadie lo mira, markSynced borra el item y el cambio no existe más.
   */
  it('NO saca el item si el upsert devolvió error', async () => {
    estado.errorPorTabla.set('productos', { message: 'duplicate key' })
    getPendingSync.mockResolvedValue([enCola()])
    await syncManager.sync()
    expect(markSynced).not.toHaveBeenCalled()
  })

  it('NO saca el item si el delete devolvió error', async () => {
    estado.errorPorTabla.set('movimientos', { message: 'violates foreign key' })
    getPendingSync.mockResolvedValue([
      enCola({ tabla: 'movimientos', recordId: 'm1', operacion: 'delete' }),
    ])
    await syncManager.sync()
    expect(markSynced).not.toHaveBeenCalled()
  })

  it('NO saca la venta si crear_venta_segura devolvió error', async () => {
    estado.errorRpc = { message: 'STOCK_INSUFICIENTE:Remera' }
    getPendingSync.mockResolvedValue([
      enCola({ tabla: 'ventas', recordId: 'v1', operacion: 'insert' }),
    ])
    await syncManager.sync()
    expect(markSynced).not.toHaveBeenCalled()
  })

  /**
   * Si la sesión no vale, cada push fallaría por RLS y el error se leería como
   * un problema de red. Preguntando primero se da el aviso correcto y, sobre
   * todo, no se toca la cola.
   */
  it('con la sesión caída no intenta subir nada y la cola queda intacta', async () => {
    estado.errorDeSesion = { message: 'JWT expired' }
    getPendingSync.mockResolvedValue([enCola()])
    await syncManager.sync()
    expect(markSynced).not.toHaveBeenCalled()
    expect(estado.llamadas.filter(l => l.tipo === 'upsert')).toHaveLength(0)
    expect(syncManager.requiereReautenticacion).toBe(true)
  })
})

describe('las ventas van por la RPC transaccional, no por upsert', () => {
  it('usa crear_venta_segura con el id local, para que re-sincronizar no duplique', async () => {
    getPendingSync.mockResolvedValue([
      enCola({
        tabla: 'ventas', recordId: 'v1', operacion: 'insert',
        data: { id: 'v1', total: 1000, venta_items: [{ producto_id: 'p1', cantidad: 1 }] },
      }),
    ])
    await syncManager.sync()

    const rpc = estado.llamadas.find(l => l.tipo === 'rpc')
    expect(rpc, 'la venta no pasó por la RPC').toBeTruthy()
    expect(rpc!.tabla).toBe('crear_venta_segura')

    const args = rpc!.args as Record<string, unknown>
    // p_venta_id = id local => idempotente: si el item se re-sincroniza, la RPC
    // no crea una segunda venta.
    expect(args.p_venta_id).toBe('v1')
    // Una venta YA hecha en el mostrador no se puede rechazar por falta de
    // stock: se registra igual y el front avisa del faltante.
    expect(args.p_permitir_sin_stock).toBe(true)
    expect(args.p_items).toEqual([{ producto_id: 'p1', cantidad: 1 }])
  })

  it('no manda a la base los campos internos de IndexedDB', async () => {
    getPendingSync.mockResolvedValue([
      enCola({ data: { id: 'p1', nombre: 'Remera', syncStatus: 'pending', localTimestamp: 123 } }),
    ])
    await syncManager.sync()

    const subido = estado.llamadas.find(l => l.tipo === 'upsert')!.args as Record<string, unknown>
    expect(subido.syncStatus).toBeUndefined()
    expect(subido.localTimestamp).toBeUndefined()
    expect(subido.org_id).toBe('org1')
  })
})

describe('falta de permiso no es sesión caída', () => {
  /**
   * Pasa cuando a alguien le sacan `crear_ventas` con ventas encoladas
   * (db/rls_fase_c3_crear_venta.sql). Confundirlo con un problema de sesión le
   * pediría al usuario volver a iniciar sesión para algo que eso no arregla.
   */
  it('no pide reautenticar cuando el error es SIN_PERMISO', async () => {
    estado.errorRpc = { message: 'SIN_PERMISO: no tenés permiso para registrar ventas' }
    getPendingSync.mockResolvedValue([
      enCola({ tabla: 'ventas', recordId: 'v1', operacion: 'insert' }),
    ])
    await syncManager.sync()
    expect(syncManager.requiereReautenticacion).toBe(false)
  })

  it('lo reporta con el id de la venta en vez de reintentar en silencio', async () => {
    estado.errorRpc = { message: 'SIN_PERMISO: no tenés permiso para registrar ventas' }
    getPendingSync.mockResolvedValue([
      enCola({ tabla: 'ventas', recordId: 'v1', operacion: 'insert' }),
    ])
    await syncManager.sync()

    expect(reportarFalla).toHaveBeenCalledOnce()
    const [contexto, , datos] = reportarFalla.mock.calls[0]
    expect(contexto).toBe('sync/sin-permiso')
    expect((datos as Record<string, unknown>).recordId).toBe('v1')
  })

  /**
   * El caso que la guarda de esErrorDeAuth realmente protege.
   *
   * Hoy la RPC lanza P0001 a propósito: 42501 (insufficient_privilege) sería el
   * código semánticamente correcto, pero cae justo en la heurística de "error
   * de autenticación". Si alguien más adelante lo cambia a 42501 — que es lo
   * que uno haría leyendo solo el SQL — sin la guarda el usuario vería "tu
   * sesión se cerró en otro dispositivo" y se pondría a reloguear para algo que
   * eso no arregla. Ver db/rls_fase_c3_crear_venta.sql.
   */
  it('aunque el error venga con código 42501, sigue siendo falta de permiso', async () => {
    estado.errorRpc = { code: '42501', message: 'SIN_PERMISO: no tenés permiso para registrar ventas' }
    getPendingSync.mockResolvedValue([
      enCola({ tabla: 'ventas', recordId: 'v1', operacion: 'insert' }),
    ])
    await syncManager.sync()
    expect(syncManager.requiereReautenticacion, 'se confundió con sesión caída').toBe(false)
    expect(reportarFalla).toHaveBeenCalledOnce()
  })

  it('la venta rechazada por permiso TAMPOCO se saca de la cola', async () => {
    estado.errorRpc = { message: 'SIN_PERMISO: ...' }
    getPendingSync.mockResolvedValue([
      enCola({ tabla: 'ventas', recordId: 'v1', operacion: 'insert' }),
    ])
    await syncManager.sync()
    expect(markSynced).not.toHaveBeenCalled()
  })
})

/**
 * El cartel "iniciá sesión de nuevo" aparecía en cada recarga sin que la sesión
 * tuviera nada. Dos causas, las dos por tratar como sesión caída algo que no lo
 * es. Como el ítem rechazado no sube nunca, el cartel tampoco se iba nunca.
 */
describe('falsos positivos del aviso de reautenticación', () => {
  it('un rechazo de RLS (42501) sobre una fila común no pide reautenticar', async () => {
    estado.errorPorTabla.set('productos', {
      code: '42501', message: 'new row violates row-level security policy for table "productos"',
    })
    getPendingSync.mockResolvedValue([enCola()])
    await syncManager.sync()
    expect(syncManager.requiereReautenticacion).toBe(false)
    // Pero no pasa en silencio: no va a subir nunca por más que se reintente.
    expect(reportarFalla).toHaveBeenCalledOnce()
    expect(markSynced).not.toHaveBeenCalled()
  })

  /**
   * Lo que había en producción: ~100 'update' de movimientos del 23/9, restos
   * de cuando useTableSync cacheaba con saveLocal. La base los rechazaba por
   * RLS en cada sync. Ningún camino legítimo encola un 'update' de movimientos
   * (solo se crean y se borran), así que se descartan sin subirlos.
   */
  it('descarta los update fantasma de movimientos sin intentar subirlos', async () => {
    getPendingSync.mockResolvedValue([
      enCola({ id: 'f1', tabla: 'movimientos', recordId: 'm1', operacion: 'update' }),
      enCola({ id: 'f2', tabla: 'movimientos', recordId: 'm1', operacion: 'update' }),
    ])
    await syncManager.sync()
    expect(quitarDeCola).toHaveBeenCalledWith('f1')
    expect(quitarDeCola).toHaveBeenCalledWith('f2')
    expect(estado.llamadas.filter(l => l.tipo === 'upsert')).toHaveLength(0)
  })

  it('pero un insert o un delete de movimientos NO es fantasma: se sube', async () => {
    getPendingSync.mockResolvedValue([
      enCola({ id: 'real', tabla: 'movimientos', recordId: 'm2', operacion: 'insert' }),
    ])
    await syncManager.sync()
    expect(quitarDeCola).not.toHaveBeenCalled()
    expect(markSynced).toHaveBeenCalledWith('movimientos', 'm2', 'real')
  })

  it('que getUser falle por red no pide reautenticar, y la cola queda intacta', async () => {
    estado.errorDeSesion = { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }
    getPendingSync.mockResolvedValue([enCola()])
    await syncManager.sync()
    expect(syncManager.requiereReautenticacion).toBe(false)
    expect(markSynced).not.toHaveBeenCalled()
    expect(estado.llamadas.filter(l => l.tipo === 'upsert')).toHaveLength(0)
  })

  it('un JWT vencido sí lo pide', async () => {
    estado.errorPorTabla.set('productos', { code: 'PGRST301', message: 'JWT expired' })
    getPendingSync.mockResolvedValue([enCola()])
    await syncManager.sync()
    expect(syncManager.requiereReautenticacion).toBe(true)
  })
})

describe('el aviso de reautenticación', () => {
  it('se enciende con un error de sesión y se apaga solo cuando vuelve a andar', async () => {
    estado.errorDeSesion = { message: 'JWT expired' }
    getPendingSync.mockResolvedValue([enCola()])
    await syncManager.sync()
    expect(syncManager.requiereReautenticacion).toBe(true)

    // Mismo manager, sesión recuperada: el cartel no debe quedar pegado.
    estado.errorDeSesion = null
    await syncManager.sync()
    expect(syncManager.requiereReautenticacion).toBe(false)
  })

  it('sin nada pendiente no molesta', async () => {
    getPendingSync.mockResolvedValue([])
    await syncManager.sync()
    expect(syncManager.requiereReautenticacion).toBe(false)
  })
})

/**
 * El cobro de cuotas offline no encola una fila sino una LLAMADA: toca cuatro
 * tablas y tiene que entrar atómico, así que lo que se repite al reconectar es
 * registrar_pago_cuota(), no un upsert.
 */
describe('acciones encoladas (cobro de cuotas offline)', () => {
  function cobroEnCola(over: Record<string, unknown> = {}) {
    return {
      id: 'rpc_1',
      tabla: 'registrar_pago_cuota',
      recordId: 'cp1',
      operacion: 'rpc' as const,
      data: {
        _rpc: 'registrar_pago_cuota',
        args: { p_cuota_pago_id: 'cp1', p_metodo: 'efectivo', p_movimiento_id: 'mov1' },
      },
      timestamp: Date.now(),
      ...over,
    }
  }

  it('llama a la RPC con los argumentos que se guardaron', async () => {
    getPendingSync.mockResolvedValue([cobroEnCola()])
    await syncManager.sync()

    const rpc = estado.llamadas.find(l => l.tipo === 'rpc')
    expect(rpc!.tabla).toBe('registrar_pago_cuota')
    expect((rpc!.args as Record<string, unknown>).p_cuota_pago_id).toBe('cp1')
    // El id del movimiento se genera offline y viaja: el ingreso que ya se
    // mostró local y el que crea el servidor tienen que ser la MISMA fila, si
    // no Finanzas cuenta la plata dos veces.
    expect((rpc!.args as Record<string, unknown>).p_movimiento_id).toBe('mov1')
  })

  /**
   * markSynced abre una transacción sobre el store de la tabla del ítem, y acá
   * `tabla` es el nombre de una RPC, que no tiene store. Usarlo reventaría.
   */
  it('sale de la cola por quitarDeCola, no por markSynced', async () => {
    getPendingSync.mockResolvedValue([cobroEnCola()])
    await syncManager.sync()
    expect(quitarDeCola).toHaveBeenCalledWith('rpc_1')
    expect(markSynced).not.toHaveBeenCalled()
  })

  it('si la RPC falla, el cobro NO se saca de la cola', async () => {
    estado.errorRpc = { message: 'deadlock detected' }
    getPendingSync.mockResolvedValue([cobroEnCola()])
    await syncManager.sync()
    expect(quitarDeCola).not.toHaveBeenCalled()
  })

  it('un item de rpc sin nombre no se descarta en silencio', async () => {
    getPendingSync.mockResolvedValue([cobroEnCola({ data: { args: {} } })])
    await syncManager.sync()
    expect(quitarDeCola).not.toHaveBeenCalled()
    expect(estado.llamadas.filter(l => l.tipo === 'rpc')).toHaveLength(0)
  })
})

describe('sin conexión', () => {
  it('no intenta nada estando offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    getPendingSync.mockResolvedValue([enCola()])
    await syncManager.sync()
    expect(markSynced).not.toHaveBeenCalled()
    expect(estado.llamadas).toHaveLength(0)
    vi.stubGlobal('navigator', { onLine: true })
  })
})
