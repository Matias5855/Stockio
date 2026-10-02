'use client'
/**
 * Planes de cuotas: lectura offline y cobro offline.
 *
 * El cobro ya no son cuatro escrituras sueltas desde el navegador: va por
 * `registrar_pago_cuota()` (db/cuotas_cobro_seguro.sql), que las hace en una
 * transacción y es idempotente por el id de la cuota. Eso es lo que lo vuelve
 * seguro offline — un ítem de la cola se reintenta hasta que se confirma, y si
 * la cuota ya figuraba pagada la RPC no suma nada.
 *
 * CREAR UN PLAN sigue siendo online. Las filas de `cuota_pagos` las genera el
 * trigger generar_cuotas() en el servidor al insertar el plan: offline habría
 * que simularlas y al sincronizar el servidor crearía las suyas con otros ids.
 * Necesita su propia RPC, igual que el cobro.
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
}

const ES_ERROR_DE_RED = /failed to fetch|networkerror|network request failed|load failed/i

export type ResultadoCobro = {
  /** Se guardó local y se sube al reconectar. */
  offline: boolean
  /** La cuota ya figuraba pagada: no se cobró de nuevo. */
  yaEstaba: boolean
  cuotasPagadas?: number
  completada?: boolean
}

export function useCuotas() {
  const { data: cuotas, loading, orgId, refetch } = useTableSync<CuotaVenta>({
    table: 'cuotas_ventas',
    select: '*, cuota_pagos(*)',
    order: { column: 'created_at', ascending: false },
    localSort: (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  })

  const supabase = createClient()

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
    const movimientoId = crypto.randomUUID()
    const hoy = new Date().toISOString().split('T')[0]
    const args = {
      p_cuota_pago_id: cuotaPagoId,
      p_metodo: 'efectivo',
      p_fecha: hoy,
      p_movimiento_id: movimientoId,
    }

    // `navigator.onLine` da true con wifi conectado y sin internet. Si la
    // llamada muere por red se sigue por el camino offline en vez de fallar: es
    // seguro porque la RPC es idempotente — si el pedido llegó y lo que se
    // perdió fue la respuesta, el reintento devuelve `ya_estaba` y no cobra dos
    // veces, y el movimiento lleva el mismo id.
    if (navigator.onLine) {
      let data: unknown = null
      let mensajeError: string | null = null
      try {
        const r = await supabase.rpc('registrar_pago_cuota', args)
        data = r.data
        mensajeError = r.error ? (r.error.message ?? 'Error desconocido') : null
      } catch (e) {
        mensajeError = e instanceof Error ? e.message : String(e)
      }

      if (mensajeError === null) {
        const res = (data ?? {}) as {
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

      // Un error que NO es de red (permiso, cuota inexistente) es una respuesta
      // real del servidor: se muestra, no se encola.
      if (!ES_ERROR_DE_RED.test(mensajeError)) throw new Error(mensajeError)
    }

    // --- Offline ---------------------------------------------------------
    await encolarAccion('registrar_pago_cuota', args, cuotaPagoId)

    const plan = cuotas.find(c => c.id === cuotaVentaId)
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

  /** Solo para que la pantalla sepa si puede ofrecer crear un plan. */
  const puedeCrearPlan = typeof navigator === 'undefined' ? true : navigator.onLine

  return { cuotas, loading, orgId, refetch, cobrarCuota, puedeCrearPlan }
}

/** Expuesto para los tests y para quien necesite leer el cache sin el hook. */
export async function leerCuotasLocales(orgId: string) {
  return getLocal('cuotas_ventas', orgId) as Promise<CuotaVenta[]>
}
