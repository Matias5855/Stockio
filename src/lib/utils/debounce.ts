/**
 * Debounce trailing: agrupa multiples invocaciones rapidas en una sola
 * ejecucion al final del periodo de espera.
 *
 * Util para realtime: si llegan 10 eventos en 500ms, hace UN solo fetch
 * en vez de 10. Reduce drasticamente la carga al servidor.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  waitMs: number
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null

  const debounced = ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, waitMs)
  }) as T & { cancel: () => void }

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return debounced
}
