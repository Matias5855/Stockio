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

  async sync(): Promise<void> {
    if (this.syncing || !this.isOnline) return
    this.syncing = true
    try {
      // pushFirst → asegura que la cola local se vacie antes de pull
      await this.pushToSupabase()
      await this.pullFromSupabase()
      window.dispatchEvent(new Event('syncCompleted'))
    } catch (err) {
      console.error('[SyncManager] Error:', err)
      // Emitir igualmente para que listeners no queden colgados
      window.dispatchEvent(new Event('syncCompleted'))
    } finally {
      this.syncing = false
    }
  }

  private async pullFromSupabase() {
    try {
      const db = await getLocalDB()
      const orgId = localStorage.getItem('sf_org_id')
      if (!orgId) return

      const [{ data: productos }, { data: ventas }, { data: movimientos }] = await Promise.all([
        this.supabase.from('productos').select('*').eq('org_id', orgId).eq('activo', true),
        this.supabase.from('ventas').select('*, venta_items(*)').eq('org_id', orgId).order('fecha', { ascending: false }).limit(100),
        this.supabase.from('movimientos').select('*').eq('org_id', orgId).order('fecha', { ascending: false }).limit(200),
      ])

      // Transaccion unica + escritura paralela
      const tx = db.transaction(['productos', 'ventas', 'movimientos'], 'readwrite')
      const ops: Promise<unknown>[] = []
      const prodStore = tx.objectStore('productos')
      const ventaStore = tx.objectStore('ventas')
      const movStore = tx.objectStore('movimientos')

      for (const p of productos ?? []) ops.push(prodStore.put({ ...p, syncStatus: 'synced' }))
      for (const v of ventas ?? []) ops.push(ventaStore.put({ ...v, syncStatus: 'synced' }))
      for (const m of movimientos ?? []) ops.push(movStore.put({ ...m, syncStatus: 'synced' }))

      await Promise.all([...ops, tx.done])
    } catch (err) {
      console.error('[SyncManager] Error en pull:', err)
    }
  }

  private async pushToSupabase() {
    const pending = await getPendingSync() as PendingItem[]
    if (!pending.length) return

    const orgId = localStorage.getItem('sf_org_id')
    if (!orgId) return

    // Separar ventas (necesitan secuencia por nro_factura) del resto (paralelizables)
    const ventaItems = pending.filter(p => p.tabla === 'ventas')
    const otrosItems = pending.filter(p => p.tabla !== 'ventas')

    // Paralelizar items que no son ventas
    await Promise.all(otrosItems.map(item => this.pushItem(item, orgId)))

    // Ventas en serie (para mantener correlativo de nro_factura)
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
        const ventaData = { ...cleanData, org_id: orgId } as Record<string, unknown>
        delete ventaData.venta_items

        const { count } = await this.supabase
          .from('ventas').select('*', { count: 'exact', head: true })
        const nroFinal = `FC-${String((count ?? 0) + 1).padStart(4, '0')}`
        ventaData.nro_factura = nroFinal

        const { data: ventaCreada, error: ventaErr } = await this.supabase
          .from('ventas').upsert(ventaData, { onConflict: 'id', ignoreDuplicates: true }).select().single()
        if (ventaErr) throw new Error(ventaErr.message)

        if (Array.isArray(venta_items) && venta_items.length && ventaCreada) {
          const items = venta_items as Array<Record<string, unknown>>
          // Items y movimiento en paralelo
          await Promise.all([
            this.supabase.from('venta_items').insert(
              items.map(i => ({ ...i, venta_id: ventaCreada.id }))
            ),
            this.supabase.from('movimientos').insert({
              descripcion: `Venta ${nroFinal} — ${ventaData.cliente_nombre}`,
              tipo: 'ingreso',
              categoria_nombre: 'Ventas',
              monto: ventaData.total,
              fecha: ventaData.fecha,
              venta_id: ventaCreada.id,
              org_id: orgId,
            }),
          ])
        }
      } else {
        await this.supabase.from(item.tabla).upsert({ ...cleanData, org_id: orgId })
      }

      await markSynced(item.tabla, item.recordId, item.id)
    } catch (err) {
      console.error(`[SyncManager] Error sincronizando ${item.tabla}:`, err)
    }
  }
}

export const syncManager = new SyncManager()
