'use client'
import { createClient } from '@/lib/supabase/client'
import { getPendingSync, markSynced, quitarDeCola, getLocalDB } from '@/lib/db/indexeddb'
import { reportarFalla } from '@/lib/reportarFalla'

type PendingItem = {
  id: string
  tabla: string
  recordId: string
  // 'rpc' no es una fila pendiente sino una llamada a repetir: la usa el cobro
  // de cuotas, que toca cuatro tablas y tiene que entrar atomico.
  operacion: 'insert' | 'update' | 'delete' | 'rpc'
  data: Record<string, unknown> & {
    venta_items?: unknown[]; syncStatus?: string; localTimestamp?: number
    _rpc?: string; args?: Record<string, unknown>
  }
  timestamp: number
}

/**
 * `cuotas_ventas` esta solo para BAJAR (pull). Subir cuotas creadas offline es
 * otro problema y no se resuelve con este mecanismo:
 *
 *  · Las filas de cuota_pagos las genera el trigger generar_cuotas() en el
 *    servidor al insertar el plan. Offline habria que simularlas, y al
 *    sincronizar el servidor crearia las suyas con otros ids.
 *  · Cobrar una cuota son cuatro escrituras en tres tablas. La cola las sube
 *    de a una y sin transaccion, asi que podria entrar el pago y no el ingreso
 *    en caja — el bug exacto que arreglamos en db/rls_fase_c1_cuotas_caja.sql.
 *
 * Eso necesita una RPC transaccional e idempotente por id local, como
 * crear_venta_segura(). Mientras no exista, cobrar y crear planes es online.
 */
type Tabla = 'productos' | 'ventas' | 'movimientos' | 'cuotas_ventas'

// Cada cuanto forzar full pull para limpiar registros borrados que el delta no detecta
const FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24h

// Bandera de "la sesion ya no sirve". Se da cuando Supabase revoca la sesion:
// tipicamente porque la misma cuenta se logueo en otro dispositivo y esta
// activo "Enforce single session per user". Se persiste en localStorage porque
// el aviso tiene que sobrevivir a un refresh: los datos siguen guardados en
// IndexedDB, pero todavia no llegaron al servidor y el usuario debe saberlo.
const AUTH_FLAG_KEY = 'stk_sync_requiere_reauth'

// Evento que escucha el layout para mostrar/ocultar el cartel de reautenticacion.
export const SYNC_AUTH_EVENT = 'syncAuthError'

/**
 * Distingue "se cayo la red" de "tu sesion no vale mas". Es la diferencia entre
 * reintentar en silencio y avisarle al usuario que tiene que volver a entrar.
 * PGRST301 = JWT invalido o vencido.
 *
 * 42501 NO cuenta, y antes contaba. Es "permiso denegado / RLS rechaza", y
 * desde que las politicas miran permisos (fases C1-C3) eso significa casi
 * siempre "tu rol no puede hacer esto", no "tu sesion murio". Tratarlo como
 * sesion caida prendia el cartel de reautenticacion en cada carga para
 * cualquiera con un item en la cola que la base rechazara — y como el item no
 * sube nunca, el cartel tampoco se iba nunca.
 */
function esErrorDeAuth(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  if (esErrorDePermiso(err)) return false   // falta de permiso no es sesion caida
  if (esErrorDeRed(err)) return false       // sin red no se puede concluir nada
  const e = err as { code?: string; status?: number; message?: string }
  // `status` solo lo traen los errores de Auth (GoTrue); los de PostgREST no.
  if (e.status === 401 || e.status === 403) return true
  if (e.code === 'PGRST301') return true
  return /jwt|refresh token|invalid token|session missing|unauthorized|not authenticated/i.test(e.message ?? '')
}

/**
 * No poder llegar al servidor no dice nada sobre la sesion. `navigator.onLine`
 * da true con wifi conectado y sin internet, asi que estos errores aparecen
 * aunque el chequeo de conexion haya pasado.
 */
function esErrorDeRed(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; status?: number; message?: string }
  if (e.name === 'AuthRetryableFetchError' || e.status === 0) return true
  return /failed to fetch|networkerror|network request failed|load failed/i.test(e.message ?? '')
}

/**
 * "No tenés permiso" es distinto de "tu sesion no vale mas", y confundirlos le
 * daria al usuario el mensaje equivocado: le pediriamos volver a iniciar sesion
 * para algo que no se arregla iniciando sesion.
 *
 * Pasa cuando a alguien le sacan `crear_ventas` mientras tenia ventas
 * encoladas sin subir: crear_venta_segura() las rechaza (ver
 * db/rls_fase_c3_crear_venta.sql). Las ventas YA se hicieron en el mostrador,
 * asi que no se descartan — quedan en la cola, y el reintento va a seguir
 * fallando hasta que el dueño le devuelva el permiso. Lo importante es que eso
 * NO pase inadvertido: sin este camino el error se reintentaba en silencio para
 * siempre y la venta no llegaba nunca al servidor.
 */
function esErrorDePermiso(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  // 42501 = la base rechazo la escritura por privilegio o por RLS. Mismo caso
  // que SIN_PERMISO pero dicho por Postgres en vez de por una RPC nuestra.
  return e.code === '42501' || /SIN_PERMISO/i.test(e.message ?? '')
}

class SyncManager {
  private supabase = createClient()
  private syncing = false
  private initialized = false
  private authError = false

  init() {
    if (this.initialized || typeof window === 'undefined') return
    this.initialized = true
    window.addEventListener('online', () => this.sync())
    if (navigator.onLine) this.sync()
  }

  get isOnline() {
    return typeof navigator !== 'undefined' && navigator.onLine
  }

  // true = hay que volver a iniciar sesion para poder sincronizar.
  get requiereReautenticacion(): boolean {
    try { return localStorage.getItem(AUTH_FLAG_KEY) === '1' } catch { return false }
  }

  // Cuantos cambios locales estan esperando subir (para el texto del aviso).
  async contarPendientes(): Promise<number> {
    try { return (await getPendingSync()).length } catch { return 0 }
  }

  private marcarAuth(requiere: boolean) {
    try {
      if (requiere) localStorage.setItem(AUTH_FLAG_KEY, '1')
      else localStorage.removeItem(AUTH_FLAG_KEY)
    } catch {}
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_AUTH_EVENT))
  }

  async sync(opts?: { force?: boolean }): Promise<void> {
    if (this.syncing || !this.isOnline) return
    this.syncing = true
    // Se recalcula en cada intento: si esta vez anduvo, el cartel desaparece solo.
    this.authError = false
    try {
      await this.pushToSupabase()
      await this.pullFromSupabase({ force: opts?.force })
      window.dispatchEvent(new Event('syncCompleted'))
    } catch (err) {
      if (esErrorDeAuth(err)) this.authError = true
      console.error('[SyncManager] Error:', err)
      window.dispatchEvent(new Event('syncCompleted'))
    } finally {
      this.marcarAuth(this.authError)
      this.syncing = false
    }
  }

  private lastSyncKey(tabla: Tabla) {
    return `sf_last_sync_${tabla}`
  }

  private getLastSync(tabla: Tabla): string | null {
    return localStorage.getItem(this.lastSyncKey(tabla))
  }

  private setLastSync(tabla: Tabla, iso: string) {
    localStorage.setItem(this.lastSyncKey(tabla), iso)
  }

  private shouldFullSync(tabla: Tabla): boolean {
    const last = this.getLastSync(tabla)
    if (!last) return true
    return Date.now() - new Date(last).getTime() > FULL_SYNC_INTERVAL_MS
  }

  // Trae solo registros modificados desde el ultimo sync (delta).
  // Si la tabla no tiene updated_at, hace fallback al full pull automaticamente.
  private async fetchDelta(tabla: Tabla, orgId: string, opts: { full: boolean }): Promise<Array<Record<string, unknown>>> {
    const since = opts.full ? null : this.getLastSync(tabla)
    const now = new Date().toISOString()

    const buildSelect = () => {
      const selectStr =
        tabla === 'ventas' ? '*, venta_items(*)'
        : tabla === 'cuotas_ventas' ? '*, cuota_pagos(*)'
        : '*'
      let q = this.supabase.from(tabla).select(selectStr).eq('org_id', orgId)
      if (tabla === 'productos') q = q.eq('activo', true)
      if (tabla === 'ventas') q = q.order('fecha', { ascending: false }).limit(100)
      if (tabla === 'movimientos') q = q.order('fecha', { ascending: false }).limit(200)
      if (tabla === 'cuotas_ventas') q = q.order('created_at', { ascending: false }).limit(100)
      return q
    }

    // Intento 1: delta con updated_at
    if (since) {
      const { data, error } = await buildSelect().gt('updated_at', since)
      if (!error) {
        this.setLastSync(tabla, now)
        return (data ?? []) as unknown as Array<Record<string, unknown>>
      }
      // Si la columna updated_at no existe, hacer full pull
      if (error.code === '42703' || /updated_at/i.test(error.message)) {
        console.warn(`[SyncManager] ${tabla} sin updated_at, fallback a full pull`)
      } else {
        console.warn(`[SyncManager] Delta ${tabla} fallo:`, error.message)
      }
    }

    // Intento 2: full pull
    const { data, error } = await buildSelect()
    if (error) {
      // Tambien miramos auth aca: si no hay nada pendiente que subir, el pull
      // es el unico lugar donde se nota que la sesion dejo de valer.
      if (esErrorDeAuth(error)) this.authError = true
      console.error(`[SyncManager] Full pull ${tabla} fallo:`, error.message)
      return []
    }
    this.setLastSync(tabla, now)
    return (data ?? []) as unknown as Array<Record<string, unknown>>
  }

  private async pullFromSupabase(opts?: { force?: boolean }) {
    try {
      const db = await getLocalDB()
      const orgId = localStorage.getItem('stk_org_id')
      if (!orgId) return

      // Full pull cada 24h para limpiar fantasmas (registros borrados en servidor)
      const tablas: Tabla[] = ['productos', 'ventas', 'movimientos', 'cuotas_ventas']
      const full = new Map(tablas.map(t => [t, Boolean(opts?.force) || this.shouldFullSync(t)]))

      const resultados = await Promise.all(
        tablas.map(t => this.fetchDelta(t, orgId, { full: full.get(t)! }))
      )

      // Si fue full pull → reemplazar todo. Si fue delta → solo actualizar lo modificado.
      const tx = db.transaction(tablas, 'readwrite')
      const ops: Promise<unknown>[] = []

      tablas.forEach((t, i) => {
        const store = tx.objectStore(t)
        if (full.get(t)) ops.push(store.clear())
        for (const fila of resultados[i]) ops.push(store.put({ ...fila, syncStatus: 'synced' }))
      })

      await Promise.all([...ops, tx.done])

      const totalDelta = resultados.reduce((n, r) => n + r.length, 0)
      const detalle = tablas.map(t => `${t}=${full.get(t)}`).join(' ')
      console.log(`[SyncManager] Pull OK — ${totalDelta} registros (full: ${detalle})`)
    } catch (err) {
      console.error('[SyncManager] Error en pull:', err)
    }
  }

  private async pushToSupabase() {
    const enCola = await getPendingSync() as PendingItem[]

    // Limpieza de fantasmas. Hasta el commit 27a66bb, useTableSync cacheaba con
    // saveLocal cada fila que venia del servidor, y saveLocal siempre encola:
    // cada apertura de Finanzas dejaba un 'update' por movimiento. Los de
    // productos y ventas se fueron solos (suben sin problema), pero los de
    // movimientos NO: la base rechaza el UPDATE por RLS, asi que quedaron
    // trabados para siempre — en produccion habia ~100, todos del 23/9.
    //
    // Se pueden borrar sin mirar el contenido porque NINGUN camino legitimo
    // encola un 'update' de movimientos: la app solo los crea ('insert') y los
    // borra ('delete'). Si algun dia se agrega editar movimientos, esto se va.
    const fantasmas = enCola.filter(p => p.tabla === 'movimientos' && p.operacion === 'update')
    if (fantasmas.length) {
      await Promise.all(fantasmas.map(f => quitarDeCola(f.id)))
      console.warn(`[SyncManager] ${fantasmas.length} items fantasma de movimientos descartados`)
    }

    const pending = enCola.filter(p => !fantasmas.includes(p))
    if (!pending.length) return

    // Antes de intentar subir nada, confirmar que la sesion sigue viva. Si la
    // revocaron, cada push fallaria por RLS y el error se leeria como un
    // problema de red cualquiera. Preguntando primero damos el aviso correcto
    // y, sobre todo, no tocamos la cola local: los cambios siguen ahi.
    const { data: { user }, error: authErr } = await this.supabase.auth.getUser()
    if (authErr || !user) {
      // Si getUser fallo por red no se sabe nada de la sesion: no se sube (la
      // cola queda intacta) pero tampoco se le pide al usuario que reingrese.
      // Antes cualquier error aca prendia el cartel de reautenticacion.
      if (!esErrorDeRed(authErr)) this.authError = true
      console.warn('[SyncManager] No se pudo confirmar la sesion — la cola local queda intacta')
      return
    }

    const orgId = localStorage.getItem('stk_org_id')
    if (!orgId) return

    // El orden importa, en tres tandas:
    //
    //  1. Filas sueltas (productos, movimientos), en paralelo. Van primero
    //     porque una venta hecha offline puede usar un producto también creado
    //     offline: si la venta llegara antes, crear_venta_segura la rechazaría
    //     con PRODUCTO_INVALIDO.
    //  2. Ventas, de a una: el número de factura es correlativo.
    //  3. Acciones de RPC (cobro y alta de planes de cuotas), de a una y en el
    //     orden en que se hicieron. Van al final porque un plan armado al vender
    //     en cuotas apunta a su venta por venta_id: si llegara antes que ella,
    //     crear_plan_cuotas() respondería VENTA_INEXISTENTE.
    const porFecha = (a: PendingItem, b: PendingItem) => a.timestamp - b.timestamp
    const ventaItems = pending.filter(p => p.tabla === 'ventas').sort(porFecha)
    const accionItems = pending.filter(p => p.operacion === 'rpc').sort(porFecha)
    const filaItems = pending.filter(p => p.tabla !== 'ventas' && p.operacion !== 'rpc')

    await Promise.all(filaItems.map(item => this.pushItem(item, orgId)))

    for (const item of ventaItems) {
      await this.pushItem(item, orgId)
    }

    for (const item of accionItems) {
      await this.pushItem(item, orgId)
    }
  }

  private async pushItem(item: PendingItem, orgId: string) {
    try {
      const { syncStatus, localTimestamp, venta_items, ...cleanData } = item.data

      // Ojo: supabase-js NO tira excepcion, devuelve { error }. Si no lo
      // miramos, markSynced borra el item de la cola como si hubiera subido
      // y el cambio se pierde. Por eso cada operacion revisa su error.

      // Accion encolada (una llamada a RPC, no una fila). Hoy la usa el cobro
      // de cuotas. Sale por quitarDeCola y NO por markSynced: markSynced abre
      // una transaccion sobre el store de la tabla, y acá `tabla` es el nombre
      // de la RPC, que no tiene store.
      if (item.operacion === 'rpc') {
        const nombre = item.data._rpc
        if (!nombre) throw new Error('Accion encolada sin nombre de RPC')
        const { error } = await this.supabase.rpc(nombre, item.data.args ?? {})
        if (error) throw error
        await quitarDeCola(item.id)
        return
      }

      if (item.operacion === 'delete') {
        const { error } = await this.supabase.from(item.tabla).delete().eq('id', item.recordId)
        if (error) throw error
        await markSynced(item.tabla, item.recordId, item.id)
        return
      }

      if (item.tabla === 'ventas') {
        const v = cleanData as Record<string, unknown>
        const items = Array.isArray(venta_items) ? venta_items : []

        // Misma RPC transaccional que online, pero con p_permitir_sin_stock=true:
        // una venta YA hecha en el mostrador (offline) no se puede rechazar por
        // falta de stock. Se registra igual (puede dejar stock en negativo) y el
        // front lo detecta para alertar. p_venta_id = id local => idempotente:
        // si el item se re-sincroniza, la RPC no duplica la venta.
        const { error: rpcErr } = await this.supabase.rpc('crear_venta_segura', {
          p_venta: {
            cliente_nombre: v.cliente_nombre,
            fecha: v.fecha,
            estado: v.estado,
            subtotal: v.subtotal,
            descuento: v.descuento,
            total: v.total,
            notas: v.notas,
          },
          p_items: items,
          p_permitir_sin_stock: true,
          p_venta_id: String(item.recordId),
        })
        if (rpcErr) throw rpcErr
      } else {
        const { error } = await this.supabase.from(item.tabla).upsert({ ...cleanData, org_id: orgId })
        if (error) throw error
      }

      await markSynced(item.tabla, item.recordId, item.id)
    } catch (err) {
      // No se llama a markSynced: el item queda en la cola y se reintenta en
      // el proximo sync. Si el motivo fue la sesion, se avisa al usuario.
      if (esErrorDeAuth(err)) this.authError = true

      // Falta de permiso: el reintento no lo va a arreglar nunca, asi que se
      // reporta con contexto en vez de quedar como un error de consola mas
      // entre miles. El item NO se descarta: la venta se hizo de verdad.
      if (esErrorDePermiso(err)) {
        reportarFalla('sync/sin-permiso', err, {
          tabla: item.tabla,
          recordId: item.recordId,
          encoladoEn: new Date(item.timestamp).toISOString(),
        })
        return
      }

      console.error(`[SyncManager] Error sincronizando ${item.tabla}:`, err)
    }
  }

  // Forzar full sync manualmente (util tras cerrar sesion / cambio de org)
  async fullResync() {
    return this.sync({ force: true })
  }

  // Limpiar timestamps de sync (al cerrar sesion)
  clearSyncState() {
    for (const t of ['productos', 'ventas', 'movimientos', 'cuotas_ventas'] as Tabla[]) {
      localStorage.removeItem(this.lastSyncKey(t))
    }
    this.authError = false
    localStorage.removeItem(AUTH_FLAG_KEY)
  }
}

export const syncManager = new SyncManager()
