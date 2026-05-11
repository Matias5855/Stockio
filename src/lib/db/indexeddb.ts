import { openDB, IDBPDatabase } from 'idb'

export type SyncStatus = 'synced' | 'pending' | 'conflict'

let dbPromise: Promise<IDBPDatabase> | null = null

export function getLocalDB(): Promise<IDBPDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = openDB('stockflow-local', 1, {
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
  return dbPromise
}

export async function saveLocal(
  tabla: string,
  data: { id: string; [k: string]: unknown },
  operacion: 'insert' | 'update' | 'delete' = 'insert'
) {
  const database = await getLocalDB()
  const record = { ...data, syncStatus: 'pending', localTimestamp: Date.now() }

  // Una sola transaccion para ambos stores en lugar de dos puts secuenciales
  const tx = database.transaction([tabla, 'sync_queue'], 'readwrite')
  await Promise.all([
    tx.objectStore(tabla).put(record),
    tx.objectStore('sync_queue').put({
      id: `${tabla}_${data.id}_${Date.now()}`,
      tabla,
      recordId: data.id,
      operacion,
      data,
      timestamp: Date.now(),
    }),
    tx.done,
  ])
}

export async function getLocal(tabla: string, orgId: string) {
  const database = await getLocalDB()
  return database.getAllFromIndex(tabla, 'orgId', orgId)
}

export async function getPendingSync() {
  const database = await getLocalDB()
  return database.getAll('sync_queue')
}

export async function markSynced(tabla: string, id: string, syncQueueId: string) {
  const database = await getLocalDB()
  const tx = database.transaction([tabla, 'sync_queue'], 'readwrite')
  const record = await tx.objectStore(tabla).get(id)
  if (record) await tx.objectStore(tabla).put({ ...record, syncStatus: 'synced' })
  await tx.objectStore('sync_queue').delete(syncQueueId)
  await tx.done
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
