import { openDB, IDBPDatabase } from 'idb'

export type SyncStatus = 'synced' | 'pending' | 'conflict'

let db: IDBPDatabase | null = null

export async function getLocalDB() {
  if (db) return db
  db = await openDB('stockflow-local', 1, {
    upgrade(db) {
      const productos = db.createObjectStore('productos', { keyPath: 'id' })
      productos.createIndex('orgId', 'org_id')
      productos.createIndex('syncStatus', 'syncStatus')

      const ventas = db.createObjectStore('ventas', { keyPath: 'id' })
      ventas.createIndex('orgId', 'org_id')
      ventas.createIndex('syncStatus', 'syncStatus')

      const movimientos = db.createObjectStore('movimientos', { keyPath: 'id' })
      movimientos.createIndex('orgId', 'org_id')

      const syncQueue = db.createObjectStore('sync_queue', { keyPath: 'id' })
      syncQueue.createIndex('timestamp', 'timestamp')
      syncQueue.createIndex('tabla', 'tabla')
    },
  })
  return db
}

export async function saveLocal(
  tabla: string,
  data: any,
  operacion: 'insert' | 'update' | 'delete' = 'insert'
) {
  const database = await getLocalDB()
  const record = { ...data, syncStatus: 'pending', localTimestamp: Date.now() }
  await database.put(tabla as any, record)
  await database.put('sync_queue', {
    id: `${tabla}_${data.id}_${Date.now()}`,
    tabla,
    recordId: data.id,
    operacion,
    data,
    timestamp: Date.now(),
  })
}

export async function getLocal(tabla: string, orgId: string) {
  const database = await getLocalDB()
  return database.getAllFromIndex(tabla as any, 'orgId', orgId)
}

export async function getPendingSync() {
  const database = await getLocalDB()
  return database.getAll('sync_queue')
}

export async function markSynced(tabla: string, id: string, syncQueueId: string) {
  const database = await getLocalDB()
  const record = await database.get(tabla as any, id)
  if (record) await database.put(tabla as any, { ...record, syncStatus: 'synced' })
  await database.delete('sync_queue', syncQueueId)
}

export async function clearLocalDB() {
  const database = await getLocalDB()
  await Promise.all([
    database.clear('productos'),
    database.clear('ventas'),
    database.clear('movimientos'),
    database.clear('sync_queue'),
  ])
}