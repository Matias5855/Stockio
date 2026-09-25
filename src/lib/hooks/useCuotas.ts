'use client'
/**
 * Planes de cuotas con lectura offline.
 *
 * Alcance a propósito acotado: este hook solo LEE. Cobrar una cuota y crear un
 * plan siguen siendo online, y no por falta de ganas:
 *
 *  · Las filas de `cuota_pagos` las genera el trigger generar_cuotas() en el
 *    servidor al insertar el plan. Offline habría que simularlas, y al
 *    sincronizar el servidor crearía las suyas con otros ids.
 *  · Cobrar son cuatro escrituras en tres tablas (cuota_pagos, cuotas_ventas,
 *    movimientos, ventas). La cola de sync las sube de a una y sin
 *    transacción: podría entrar el pago y no el ingreso en caja, que es
 *    exactamente el bug de db/rls_fase_c1_cuotas_caja.sql.
 *
 * Para eso hace falta una RPC transaccional e idempotente por id local, como
 * crear_venta_segura(). Mientras no exista, escribir offline sería peor que no
 * poder hacerlo: dejaría la plata descuadrada sin que nadie se enterara.
 *
 * Lo que sí resuelve: en el mostrador sin señal se puede ver quién debe,
 * cuánto y cuándo vence. Antes la pantalla quedaba vacía — la página llamaba a
 * Supabase sin mirar `navigator.onLine`, al revés de lo que pide CLAUDE.md.
 */
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

export function useCuotas() {
  const { data: cuotas, loading, refetch } = useTableSync<CuotaVenta>({
    table: 'cuotas_ventas',
    select: '*, cuota_pagos(*)',
    order: { column: 'created_at', ascending: false },
    localSort: (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  })

  return { cuotas, loading, refetch }
}
