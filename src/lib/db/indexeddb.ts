import { openDB, IDBPDatabase } from 'idb'

export type SyncStatus = 'synced' | 'pending' | 'conflict'

let dbPromise: Promise<IDBPDatabase> | null = null

/**
 * Stores de datos, todos con la misma forma: clave `id` e indice por `org_id`
 * (que es lo que usa getLocal). Tenerlos en una lista en vez de sueltos evita
 * el olvido tipico: agregar un store y no sumarlo a clearLocalDB, dejando
 * datos del negocio anterior despues de cerrar sesion.
 *
 * `cuotas_ventas` guarda cada plan con sus cuotas anidadas (`cuota_pagos`),
 * igual que `ventas` guarda sus `venta_items`: no necesita store propio.
 */
const STORES_DATOS = ['productos', 'ventas', 'movimientos', 'cuotas_ventas'] as const

/**
 * Version 2: se agrego el store de cuotas_ventas.
 *
 * OJO al subir de version: el upgrade tiene que ser idempotente. Hasta la v1
 * llamaba createObjectStore sin condicion, y eso funciona unicamente en una
 * instalacion nueva. Al subir la version el navegador vuelve a correr
 * upgrade() sobre una base que YA tiene los stores, y createObjectStore tira
 * ConstraintError: la base local no abre y el offline se rompe para todo el
 * que ya venia usando la app — no para los nuevos, que es justo por que no se
 * ve probando en desarrollo.
 *
 * Y es una puerta de una sola direccion: IndexedDB no baja de version. Si se
 * publica la v2 y despues se revierte el codigo a la v1, a quien ya abrio la
 * v2 le falla la apertura.
 */
const DB_VERSION = 2

export function getLocalDB(): Promise<IDBPDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = openDB('stockflow-local', DB_VERSION, {
    upgrade(db) {
      const crear = (nombre: string, indices: Array<[string, string]>) => {
        if (db.objectStoreNames.contains(nombre)) return
        const store = db.createObjectStore(nombre, { keyPath: 'id' })
        for (const [nombreIndice, campo] of indices) store.createIndex(nombreIndice, campo)
      }

      for (const nombre of STORES_DATOS) {
        crear(nombre, [['orgId', 'org_id'], ['syncStatus', 'syncStatus']])
      }

      crear('sync_queue', [['timestamp', 'timestamp'], ['tabla', 'tabla']])
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

/**
 * Guarda una fila que VINO del servidor, sin encolarla para subir.
 *
 * saveLocal() siempre escribe en sync_queue, porque asume que el cambio lo
 * hizo el usuario. Para cachear lo que ya esta en el servidor eso esta mal:
 * agenda devolverle al servidor lo que el mismo acaba de mandar. Como el id
 * de la cola lleva Date.now(), cada fetch creaba entradas NUEVAS y la cola
 * crecia sin limite (de ahi los "N cambios sin sincronizar" fantasma).
 */
export async function cacheLocal(tabla: string, data: { id: string; [k: string]: unknown }) {
  const database = await getLocalDB()
  await database.put(tabla, { ...data, syncStatus: 'synced' })
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
    ...STORES_DATOS.map(s => database.clear(s)),
    database.clear('sync_queue'),
  ])
}
