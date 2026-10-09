'use client'
/**
 * Planes de cuotas: leer, cobrar y crear, con y sin conexión.
 *
 * Las dos escrituras van por RPC transaccionales e idempotentes:
 *  · registrar_pago_cuota() (db/cuotas_cobro_seguro.sql) — cobra una cuota.
 *  · crear_plan_cuotas()    (db/cuotas_crear_plan.sql)   — crea el plan y su venta.
 * Ser idempotentes es lo que las vuelve seguras offline: un ítem de la cola se
 * reintenta hasta que se confirma, y repetirlo no duplica nada.
 *
 * UN PLAN CREADO SIN CONEXIÓN NO SE PUEDE COBRAR HASTA QUE SUBA. Sus cuotas las
 * genera el trigger generar_cuotas() en el servidor, con ids que el navegador no
 * puede conocer. Lo que se ve mientras tanto es una simulación con ids locales,
 * y un cobro encolado contra esos ids fallaría para siempre. Decisión del dueño
 * (2026-10-05); la alternativa era cambiar el trigger para que los ids fueran
 * predecibles.
 */
import { createClient } from '@/lib/supabase/client'
import { cacheLocal, encolarAccion, getLocal } from '@/lib/db/indexeddb'
import { useTableSync } from './useTableSync'

export type CuotaPago = {
  id: string
  nro_cuota: number
  monto: number
  fecha_venc: string
  fecha_pago: string | null
  estado: 'pendiente' | 'pagada' | 'vencida'
  metodo_pago: string
  mp_payment_id: string | null
}

export type CuotaVenta = {
  id: string
  cliente_nombre: string
  cliente_email: string | null
  cliente_tel: string | null
  monto_total: number
  monto_pagado: number
  cantidad_cuotas: number
  cuotas_pagadas: number
  monto_cuota: number
  interes_pct: number
  frecuencia: string
  estado: string
  proximo_venc: string | null
  mp_link_pago: string | null
  created_at?: string
  /** Las cuotas vienen anidadas, igual que venta_items en ventas. */
  cuota_pagos?: CuotaPago[]
  /**
   * Solo existe en la base LOCAL: el plan se creó sin conexión y todavía no
   * subió. Mientras esté, sus cuotas no se pueden cobrar (ver arriba). Cuando el
   * servidor devuelve el plan real, esa fila pisa a esta y la marca desaparece.
   */
  _pendiente_sync?: boolean
}

const ES_ERROR_DE_RED = /failed to fetch|networkerror|network request failed|load failed/i

export type DatosPlan = {
  cliente_nombre: string
  cliente_email: string
  cliente_tel: string
  monto_total: number
  monto_cuota: number
  cantidad_cuotas: number
  interes_pct: number
  frecuencia: string
  fecha_inicio: string
  /** Texto de la venta CTA asociada. Lo arma la pantalla, que formatea los montos. */
  notas_venta: string
  /**
   * Plan de una venta que YA existe (alta de venta en cuotas, pantalla de
   * Ventas). La RPC engancha el plan a esa venta y no crea la CTA.
   */
  venta_id?: string
}

export type ResultadoPlan = { id: string; offline: boolean }

/**
 * Vencimiento de la cuota número `n`, replicando EXACTAMENTE al trigger
 * generar_cuotas(): fecha_inicio + intervalo * n.
 *
 *  · La primera cuota vence un intervalo DESPUÉS de fecha_inicio.
 *  · 'semanal' = 7 días, 'quincenal' = 15, cualquier otro valor = 1 mes.
 *  · Mes = aritmética de Postgres: se suman meses y el día se recorta al último
 *    del mes destino (31/1 + 1 mes = 28/2). Cada cuota se calcula desde
 *    fecha_inicio, no desde la anterior: 31/1 + 2 meses = 31/3, no 28/3.
 *
 * Solo se usa para mostrar un plan creado sin conexión. Cuando sube, manda lo
 * que generó el servidor.
 */
export function vencimientoCuota(fechaInicio: string, frecuencia: string, n: number): string {
  const [a, m, d] = fechaInicio.split('-').map(Number)
  if (frecuencia === 'semanal' || frecuencia === 'quincenal') {
    const dias = (frecuencia === 'semanal' ? 7 : 15) * n
    return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
  }
  const mesesTotales = (m - 1) + n
  const anio = a + Math.floor(mesesTotales / 12)
  const mes = mesesTotales % 12
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()
  return new Date(Date.UTC(anio, mes, Math.min(d, ultimoDia))).toISOString().slice(0, 10)
}

export type ResultadoCobro = {
  /** Se guardó local y se sube al reconectar. */
  offline: boolean
  /** La cuota ya figuraba pagada: no se cobró de nuevo. */
  yaEstaba: boolean
  cuotasPagadas?: number
  completada?: boolean
}

/**
 * Intenta la RPC; si no hay red, avisa para que el que llama encole.
 *
 * `navigator.onLine` da true con wifi conectado y sin internet, así que se
 * intenta igual y, si la llamada muere por red, se sigue por el camino
 * offline en vez de fallar. Es seguro porque las dos RPC son idempotentes: si
 * el pedido llegó y lo que se perdió fue la respuesta, el reintento no
 * duplica nada. Un error que NO es de red (permiso, datos inválidos) es una
 * respuesta real del servidor: se lanza, no se encola.
 */
async function intentarOnline(
  rpc: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false }> {
  if (!navigator.onLine) return { ok: false }
  let data: unknown = null
  let mensajeError: string | null = null
  try {
    const r = await createClient().rpc(rpc, args)
    data = r.data
    mensajeError = r.error ? (r.error.message ?? 'Error desconocido') : null
  } catch (e) {
    mensajeError = e instanceof Error ? e.message : String(e)
  }
  if (mensajeError === null) return { ok: true, data }
  if (!ES_ERROR_DE_RED.test(mensajeError)) throw new Error(mensajeError)
  return { ok: false }
}

/**
 * Crea un plan de cuotas con su venta. Online por la RPC; offline queda
 * encolado y se muestra con cuotas simuladas hasta que suba.
 *
 * El id del plan lo genera el cliente y viaja a la RPC, que es idempotente
 * por ese id: reintentar desde la cola no crea dos planes.
 *
 * Es una función suelta y no parte del hook para que la pantalla de Ventas la
 * use al vender en cuotas sin montar la lista entera de planes.
 */
export async function crearPlanCuotas(datos: DatosPlan, orgId: string | null): Promise<ResultadoPlan> {
  const planId = crypto.randomUUID()
  const args = { p_plan: datos, p_plan_id: planId }

  const online = await intentarOnline('crear_plan_cuotas', args)
  if (online.ok) return { id: planId, offline: false }

  // --- Offline ---------------------------------------------------------
  await encolarAccion('crear_plan_cuotas', args, planId)

  if (orgId) {
    const cuotaPagos: CuotaPago[] = Array.from({ length: datos.cantidad_cuotas }, (_, i) => ({
      id: `local-${planId}-${i + 1}`,
      nro_cuota: i + 1,
      monto: datos.monto_cuota,
      fecha_venc: vencimientoCuota(datos.fecha_inicio, datos.frecuencia, i + 1),
      fecha_pago: null,
      estado: 'pendiente',
      metodo_pago: '',
      mp_payment_id: null,
    }))

    await cacheLocal('cuotas_ventas', {
      id: planId,
      org_id: orgId,
      cliente_nombre: datos.cliente_nombre,
      cliente_email: datos.cliente_email || null,
      cliente_tel: datos.cliente_tel || null,
      monto_total: datos.monto_total,
      monto_pagado: 0,
      cantidad_cuotas: datos.cantidad_cuotas,
      cuotas_pagadas: 0,
      monto_cuota: datos.monto_cuota,
      interes_pct: datos.interes_pct,
      frecuencia: datos.frecuencia,
      estado: 'activa',
      proximo_venc: cuotaPagos[0]?.fecha_venc ?? null,
      mp_link_pago: null,
      created_at: new Date().toISOString(),
      cuota_pagos: cuotaPagos,
      _pendiente_sync: true,
    })
  }

  return { id: planId, offline: true }
}

export function useCuotas() {
  const { data: cuotas, loading, orgId, refetch } = useTableSync<CuotaVenta>({
    table: 'cuotas_ventas',
    select: '*, cuota_pagos(*)',
    order: { column: 'created_at', ascending: false },
    localSort: (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  })

  /**
   * Cobra una cuota. Online llama a la RPC; offline la deja encolada y refleja
   * el cobro en la base local para que el mostrador vea el estado correcto.
   *
   * El id del movimiento se genera ACÁ incluso offline y viaja a la RPC: así el
   * ingreso que se muestra localmente y el que crea el servidor son la misma
   * fila. Sin eso quedaría un movimiento fantasma que el servidor no tiene, y
   * Finanzas contaría la plata dos veces hasta el próximo full pull.
   */
  const cobrarCuota = async (
    cuotaPagoId: string,
    cuotaVentaId: string,
    monto: number,
  ): Promise<ResultadoCobro> => {
    const plan = cuotas.find(c => c.id === cuotaVentaId)

    // Cuotas simuladas de un plan que todavía no subió: su id no existe en el
    // servidor y el cobro no entraría nunca. Ver la nota de arriba del archivo.
    if (plan?._pendiente_sync) {
      throw new Error('PLAN_SIN_SUBIR: este plan se creó sin conexión. Vas a poder cobrarlo cuando termine de subir.')
    }

    const movimientoId = crypto.randomUUID()
    const hoy = new Date().toISOString().split('T')[0]
    const args = {
      p_cuota_pago_id: cuotaPagoId,
      p_metodo: 'efectivo',
      p_fecha: hoy,
      p_movimiento_id: movimientoId,
    }

    const online = await intentarOnline('registrar_pago_cuota', args)
    if (online.ok) {
      const res = (online.data ?? {}) as {
        ya_estaba?: boolean; cuotas_pagadas?: number; completada?: boolean
      }
      await refetch()
      return {
        offline: false,
        yaEstaba: Boolean(res.ya_estaba),
        cuotasPagadas: res.cuotas_pagadas,
        completada: res.completada,
      }
    }

    // --- Offline ---------------------------------------------------------
    await encolarAccion('registrar_pago_cuota', args, cuotaPagoId)

    const pagadas = (plan?.cuotas_pagadas ?? 0) + 1
    const completada = Boolean(plan && pagadas >= plan.cantidad_cuotas)

    if (plan && orgId) {
      // Se escribe con cacheLocal (que NO encola): lo que hay que subir ya está
      // encolado como la llamada a la RPC. Con saveLocal se subiría además la
      // fila suelta y se duplicaría el trabajo del servidor.
      await cacheLocal('cuotas_ventas', {
        ...plan,
        monto_pagado: (plan.monto_pagado ?? 0) + monto,
        cuotas_pagadas: pagadas,
        estado: completada ? 'completada' : 'activa',
        cuota_pagos: (plan.cuota_pagos ?? []).map(cp =>
          cp.id === cuotaPagoId
            ? { ...cp, estado: 'pagada' as const, fecha_pago: hoy, metodo_pago: 'efectivo' }
            : cp
        ),
      })

      await cacheLocal('movimientos', {
        id: movimientoId,
        org_id: orgId,
        descripcion: `Cobro cuota ${plan.cliente_nombre} (${pagadas}/${plan.cantidad_cuotas})`,
        tipo: 'ingreso',
        categoria_nombre: 'Cuotas',
        monto,
        fecha: hoy,
        venta_id: null,
        created_at: new Date().toISOString(),
      })

      // Releer de la base local para que la pantalla muestre lo recién escrito.
      await refetch()
    }

    return { offline: true, yaEstaba: false, cuotasPagadas: pagadas, completada }
  }

  /** Crea un plan y refresca la lista. La lógica vive en crearPlanCuotas(). */
  const crearPlan = async (datos: DatosPlan): Promise<ResultadoPlan> => {
    const res = await crearPlanCuotas(datos, orgId)
    await refetch()
    return res
  }

  return { cuotas, loading, orgId, refetch, cobrarCuota, crearPlan }
}

/** Expuesto para los tests y para quien necesite leer el cache sin el hook. */
export async function leerCuotasLocales(orgId: string) {
  return getLocal('cuotas_ventas', orgId) as Promise<CuotaVenta[]>
}
