'use client'
import { createClient } from '@/lib/supabase/client'
import { getPendingSync, markSynced, getLocalDB } from '@/lib/db/indexeddb'

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

  async sync() {
    if (this.syncing || !this.isOnline) return
    this.syncing = true
    console.log('[SyncManager] Iniciando sync...')
    try {
      await this.pushToSupabase()
      await this.pullFromSupabase()
      console.log('[SyncManager] Sync completo')
      // Notificar a la app que el sync terminó
      window.dispatchEvent(new Event('syncCompleted'))
    } catch (err) {
      console.error('[SyncManager] Error:', err)
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

      const tx = db.transaction(['productos', 'ventas', 'movimientos'], 'readwrite')
      await Promise.all([
        ...(productos ?? []).map(p => tx.objectStore('productos').put({ ...p, syncStatus: 'synced' })),
        ...(ventas ?? []).map(v => tx.objectStore('ventas').put({ ...v, syncStatus: 'synced' })),
        ...(movimientos ?? []).map(m => tx.objectStore('movimientos').put({ ...m, syncStatus: 'synced' })),
        tx.done,
      ])
    } catch (err) {
      console.error('[SyncManager] Error en pull:', err)
    }
  }

  private async pushToSupabase() {
    const pending = await getPendingSync()
    if (!pending.length) return

    const orgId = localStorage.getItem('sf_org_id')
    if (!orgId) return

    for (const item of pending) {
      try {
        const { syncStatus, localTimestamp, venta_items, ...cleanData } = item.data

        if (item.operacion === 'delete') {
          await this.supabase.from(item.tabla).delete().eq('id', item.recordId)
          await markSynced(item.tabla, item.recordId, item.id)
          continue
        }

        if (item.tabla === 'ventas') {
          // Manejo especial para ventas con items
          const ventaData = { ...cleanData, org_id: orgId }
          delete ventaData.venta_items

          // Obtener número de factura real
          const { count } = await this.supabase
            .from('ventas').select('*', { count: 'exact', head: true })
          const nroFinal = `FC-${String((count ?? 0) + 1).padStart(4, '0')}`
          ventaData.nro_factura = nroFinal

          const { data: ventaCreada, error: ventaErr } = await this.supabase
            .from('ventas').insert(ventaData).select().single()

          if (ventaErr) throw new Error(ventaErr.message)

          // Insertar items si existen
          if (venta_items?.length && ventaCreada) {
            await this.supabase.from('venta_items').insert(
              venta_items.map((i: any) => ({ ...i, venta_id: ventaCreada.id }))
            )
            // Registrar movimiento de caja
            await this.supabase.from('movimientos').insert({
              descripcion: `Venta ${nroFinal} — ${ventaData.cliente_nombre}`,
              tipo: 'ingreso',
              categoria_nombre: 'Ventas',
              monto: ventaData.total,
              fecha: ventaData.fecha,
              venta_id: ventaCreada.id,
              org_id: orgId,
            })
          }
        } else {
          // Resto de tablas (productos, movimientos, etc)
          await this.supabase.from(item.tabla).upsert({ ...cleanData, org_id: orgId })
        }

        await markSynced(item.tabla, item.recordId, item.id)
      } catch (err) {
        console.error(`[SyncManager] Error sincronizando ${item.tabla}:`, err)
      }
    }
  }
}

export const syncManager = new SyncManager()