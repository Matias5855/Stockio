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
    try {
      await this.pushToSupabase()
      await this.pullFromSupabase()
    } catch (err) {
      console.error('[SyncManager] Error:', err)
    } finally {
      this.syncing = false
    }
  }

  private async pullFromSupabase() {
    const db = await getLocalDB()
    const [{ data: productos }, { data: ventas }, { data: movimientos }] = await Promise.all([
      this.supabase.from('productos').select('*').eq('activo', true),
      this.supabase.from('ventas').select('*, venta_items(*)').order('fecha', { ascending: false }).limit(100),
      this.supabase.from('movimientos').select('*').order('fecha', { ascending: false }).limit(200),
    ])

    const tx = db.transaction(['productos', 'ventas', 'movimientos'], 'readwrite')
    await Promise.all([
      ...(productos ?? []).map(p => tx.objectStore('productos').put({ ...p, syncStatus: 'synced' })),
      ...(ventas ?? []).map(v => tx.objectStore('ventas').put({ ...v, syncStatus: 'synced' })),
      ...(movimientos ?? []).map(m => tx.objectStore('movimientos').put({ ...m, syncStatus: 'synced' })),
      tx.done,
    ])
  }

  private async pushToSupabase() {
    const pending = await getPendingSync()
    if (!pending.length) return

    for (const item of pending) {
      try {
        if (item.operacion === 'insert' || item.operacion === 'update') {
          const { syncStatus, localTimestamp, ...cleanData } = item.data
          await this.supabase.from(item.tabla).upsert(cleanData)
        } else if (item.operacion === 'delete') {
          await this.supabase.from(item.tabla).delete().eq('id', item.recordId)
        }
        await markSynced(item.tabla, item.recordId, item.id)
      } catch (err) {
        console.error(`[SyncManager] Error sincronizando ${item.tabla}:`, err)
      }
    }
  }
}

export const syncManager = new SyncManager()