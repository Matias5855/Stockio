'use client'
import { createClient } from '@/lib/supabase/client'

/**
 * Sesión única por cuenta (ver db/sesion_unica.sql).
 *
 * Cada dispositivo tiene un ID estable. Al entrar lo escribe en su fila de
 * `profiles` vía la RPC `reclamar_sesion`: el último login gana. Los demás
 * dispositivos escuchan esa fila por Realtime y, al ver un ID que no es el
 * suyo, quedan desplazados.
 *
 * El ID es por DISPOSITIVO y no se borra al cerrar sesión: si el usuario vuelve
 * a entrar acá, reclama con el mismo ID y desplaza al otro. Dos cuentas
 * distintas en el mismo equipo no chocan porque cada una tiene su propia fila.
 */

const DISPOSITIVO_KEY = 'stk_dispositivo_id'

// Cada cuánto re-verificar contra la base. Es la red de seguridad para cuando
// Realtime no llegó: pestaña dormida, sin conexión al momento del desplazo, o
// el websocket cortado. Sin esto, un dispositivo podría quedar creyendo que
// sigue siendo el activo indefinidamente.
const INTERVALO_CHEQUEO_MS = 60_000

export function getDispositivoId(): string {
  try {
    let id = localStorage.getItem(DISPOSITIVO_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DISPOSITIVO_KEY, id)
    }
    return id
  } catch {
    // Sin localStorage (modo privado estricto) el ID vive solo en memoria:
    // la sesión única sigue funcionando dentro de esta pestaña.
    return crypto.randomUUID()
  }
}

/** Marca este dispositivo como el dueño de la sesión. Desplaza a los demás. */
export async function reclamarSesion(): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.rpc('reclamar_sesion', { p_sesion_id: getDispositivoId() })
  if (error) {
    // No rompemos la app por esto: si la migración SQL todavía no se corrió,
    // la función no existe y el usuario debe poder seguir trabajando igual.
    console.warn('[SesionUnica] No se pudo reclamar la sesión:', error.message)
  }
}

/** Lee quién tiene la sesión ahora. null = no se pudo saber (no concluir nada). */
async function leerSesionActiva(userId: string): Promise<string | null | undefined> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('sesion_activa_id')
    .eq('id', userId)
    .single()
  if (error) return undefined
  return (data as { sesion_activa_id: string | null }).sesion_activa_id
}

/**
 * Vigila si otro dispositivo se quedó con la sesión.
 * Devuelve la función de limpieza.
 *
 * `onCambio(desplazada)` se llama cada vez que cambia el veredicto.
 */
export function vigilarSesion(userId: string, onCambio: (desplazada: boolean) => void): () => void {
  const supabase = createClient()
  const miId = getDispositivoId()
  let ultimo: boolean | null = null
  let vivo = true

  const evaluar = (activa: string | null | undefined) => {
    // undefined = no pudimos leer (sin red, error) -> no cambiamos el veredicto.
    // null = nadie reclamó todavía (fila vieja, SQL recién corrido) -> no es
    // desplazo: sería injusto bloquear a alguien porque falta el dato.
    if (activa === undefined || activa === null) return
    const desplazada = activa !== miId
    if (desplazada === ultimo) return
    ultimo = desplazada
    onCambio(desplazada)
  }

  const chequear = async () => {
    // Sin conexión no se chequea: no poder leer no significa estar desplazado.
    if (!vivo || (typeof navigator !== 'undefined' && !navigator.onLine)) return
    evaluar(await leerSesionActiva(userId))
  }

  // Corte rápido: Realtime avisa apenas otro dispositivo reclama la sesión.
  const canal = supabase
    .channel(`sesion-unica-${userId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
      payload => evaluar((payload.new as { sesion_activa_id?: string | null }).sesion_activa_id),
    )
    .subscribe()

  // Chequeo inicial: cubre el caso de haber sido desplazado mientras la app
  // estaba cerrada, que Realtime por definición no puede contar.
  chequear()

  const intervalo = setInterval(chequear, INTERVALO_CHEQUEO_MS)
  const alVolver = () => chequear()
  window.addEventListener('focus', alVolver)
  window.addEventListener('online', alVolver)

  return () => {
    vivo = false
    clearInterval(intervalo)
    window.removeEventListener('focus', alVolver)
    window.removeEventListener('online', alVolver)
    supabase.removeChannel(canal)
  }
}
