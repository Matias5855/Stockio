'use client'
import { createClient } from '@/lib/supabase/client'
import { getPendingSync, markSynced, getLocalDB } from '@/lib/db/indexeddb'

type PendingItem = {
  id: string
  tabla: string
  recordId: string
  operacion: 'insert' | 'update' | 'delete'
  data: Record<string, unknown> & { venta_items?: unknown[]; syncStatus?: string; localTimestamp?: number }
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
 * PGRST301 = JWT invalido o vencido · 42501 = RLS rechaza (sin identidad valida).
 */
function esErrorDeAuth(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; status?: number; message?: string }
  if (e.status === 401 || e.status === 403) return true
  if (e.code === 'PGRST301' || e.code === '42501') return true
  return /jwt|token|refresh|unauthorized|not authenticated/i.test(e.message ?? '')
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
    const pending = await getPendingSync() as PendingItem[]
    if (!pending.length) return

    // Antes de intentar subir nada, confirmar que la sesion sigue viva. Si la
    // revocaron, cada push fallaria por RLS y el error se leeria como un
    // problema de red cualquiera. Preguntando primero damos el aviso correcto
    // y, sobre todo, no tocamos la cola local: los cambios siguen ahi.
    const { data: { user }, error: authErr } = await this.supabase.auth.getUser()
    if (authErr || !user) {
      this.authError = true
      console.warn('[SyncManager] Sesion invalida — la cola local queda intacta')
      return
    }

    const orgId = localStorage.getItem('stk_org_id')
    if (!orgId) return

    // Ventas necesitan correlativo de nro_factura → serie. Resto → paralelo.
    const ventaItems = pending.filter(p => p.tabla === 'ventas')
    const otrosItems = pending.filter(p => p.tabla !== 'ventas')

    await Promise.all(otrosItems.map(item => this.pushItem(item, orgId)))

    for (const item of ventaItems) {
      await this.pushItem(item, orgId)
    }
  }

  private async pushItem(item: PendingItem, orgId: string) {
    try {
      const { syncStatus, localTimestamp, venta_items, ...cleanData } = item.data

      // Ojo: supabase-js NO tira excepcion, devuelve { error }. Si no lo
      // miramos, markSynced borra el item de la cola como si hubiera subido
      // y el cambio se pierde. Por eso cada operacion revisa su error.
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
