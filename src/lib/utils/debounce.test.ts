import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from './debounce'

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('llama la funcion solo una vez tras varias invocaciones rapidas', () => {
    const fn = vi.fn()
    const d = debounce(fn, 500)

    d(); d(); d()
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('pasa los argumentos de la ultima invocacion', () => {
    const fn = vi.fn()
    const d = debounce(fn as (...args: unknown[]) => void, 100)

    d('a'); d('b'); d('c')
    vi.advanceTimersByTime(100)

    expect(fn).toHaveBeenCalledWith('c')
  })

  it('llama dos veces si las invocaciones estan separadas por mas que el wait', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)

    d()
    vi.advanceTimersByTime(100)
    d()
    vi.advanceTimersByTime(100)

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('cancel() previene la ejecucion pendiente', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)

    d()
    d.cancel()
    vi.advanceTimersByTime(100)

    expect(fn).not.toHaveBeenCalled()
  })

  it('cancel() es seguro de llamar cuando no hay timer activo', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    expect(() => d.cancel()).not.toThrow()
  })
})
