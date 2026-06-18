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

type Tabla = 'productos' | 'ventas' | 'movimientos'

// Cada cuanto forzar full pull para limpiar registros borrados que el delta no detecta
const FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24h

class SyncManager {
  private supabase = createClient()
  private syncing = false
  private initialized = false

  init() {
    if (this.initialized || typeof window === 'undefined') return
    this.initialized = true
    window.addEventListener('online', () => this.sync())
    if (navigator.onLine) this.sync()
  }

  get isOnline() {
    return typeof navigator !== 'undefined' && navigator.onLine
  }

  async sync(opts?: { force?: boolean }): Promise<void> {
    if (this.syncing || !this.isOnline) return
    this.syncing = true
    try {
      await this.pushToSupabase()
      await this.pullFromSupabase({ force: opts?.force })
      window.dispatchEvent(new Event('syncCompleted'))
    } catch (err) {
      console.error('[SyncManager] Error:', err)
      window.dispatchEvent(new Event('syncCompleted'))
    } finally {
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
      const selectStr = tabla === 'ventas' ? '*, venta_items(*)' : '*'
      let q = this.supabase.from(tabla).select(selectStr).eq('org_id', orgId)
      if (tabla === 'productos') q = q.eq('activo', true)
      if (tabla === 'ventas') q = q.order('fecha', { ascending: false }).limit(100)
      if (tabla === 'movimientos') q = q.order('fecha', { ascending: false }).limit(200)
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
      const fullProductos = opts?.force || this.shouldFullSync('productos')
      const fullVentas = opts?.force || this.shouldFullSync('ventas')
      const fullMovimientos = opts?.force || this.shouldFullSync('movimientos')

      const [productos, ventas, movimientos] = await Promise.all([
        this.fetchDelta('productos', orgId, { full: fullProductos }),
        this.fetchDelta('ventas', orgId, { full: fullVentas }),
        this.fetchDelta('movimientos', orgId, { full: fullMovimientos }),
      ])

      // Si fue full pull → reemplazar todo. Si fue delta → solo actualizar lo modificado.
      const tx = db.transaction(['productos', 'ventas', 'movimientos'], 'readwrite')
      const ops: Promise<unknown>[] = []
      const prodStore = tx.objectStore('productos')
      const ventaStore = tx.objectStore('ventas')
      const movStore = tx.objectStore('movimientos')

      if (fullProductos) ops.push(prodStore.clear())
      if (fullVentas) ops.push(ventaStore.clear())
      if (fullMovimientos) ops.push(movStore.clear())

      for (const p of productos) ops.push(prodStore.put({ ...p, syncStatus: 'synced' }))
      for (const v of ventas) ops.push(ventaStore.put({ ...v, syncStatus: 'synced' }))
      for (const m of movimientos) ops.push(movStore.put({ ...m, syncStatus: 'synced' }))

      await Promise.all([...ops, tx.done])

      const totalDelta = productos.length + ventas.length + movimientos.length
      console.log(`[SyncManager] Pull OK — ${totalDelta} registros (full: p=${fullProductos} v=${fullVentas} m=${fullMovimientos})`)
    } catch (err) {
      console.error('[SyncManager] Error en pull:', err)
    }
  }

  private async pushToSupabase() {
    const pending = await getPendingSync() as PendingItem[]
    if (!pending.length) return

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

      if (item.operacion === 'delete') {
        await this.supabase.from(item.tabla).delete().eq('id', item.recordId)
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
        if (rpcErr) throw new Error(rpcErr.message)
      } else {
        await this.supabase.from(item.tabla).upsert({ ...cleanData, org_id: orgId })
      }

      await markSynced(item.tabla, item.recordId, item.id)
    } catch (err) {
      console.error(`[SyncManager] Error sincronizando ${item.tabla}:`, err)
    }
  }

  // Forzar full sync manualmente (util tras cerrar sesion / cambio de org)
  async fullResync() {
    return this.sync({ force: true })
  }

  // Limpiar timestamps de sync (al cerrar sesion)
  clearSyncState() {
    localStorage.removeItem(this.lastSyncKey('productos'))
    localStorage.removeItem(this.lastSyncKey('ventas'))
    localStorage.removeItem(this.lastSyncKey('movimientos'))
  }
}

export const syncManager = new SyncManager()
