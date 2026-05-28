import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rateLimit, getClientIp } from './rateLimit'

// En test env no hay UPSTASH_REDIS_REST_URL/TOKEN, asi que rateLimit cae al
// fallback in-memory. Estos tests validan esa capa (la critica para dev local).
describe('rateLimit (fallback in-memory)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('permite hasta max requests dentro de la ventana', async () => {
    // Usar keys unicas por test para evitar contaminacion entre runs
    const k = `test-allows-${Math.random()}`
    expect((await rateLimit(k, 3, 1000)).ok).toBe(true)
    expect((await rateLimit(k, 3, 1000)).ok).toBe(true)
    expect((await rateLimit(k, 3, 1000)).ok).toBe(true)
  })

  it('rechaza cuando se supera el max', async () => {
    const k = `test-rejects-${Math.random()}`
    await rateLimit(k, 2, 1000)
    await rateLimit(k, 2, 1000)
    const result = await rateLimit(k, 2, 1000)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.retryAfter).toBeGreaterThan(0)
    }
  })

  it('resetea despues de la ventana', async () => {
    const k = `test-reset-${Math.random()}`
    await rateLimit(k, 1, 1000)
    expect((await rateLimit(k, 1, 1000)).ok).toBe(false)

    vi.advanceTimersByTime(1001)
    expect((await rateLimit(k, 1, 1000)).ok).toBe(true)
  })

  it('keys distintas tienen buckets independientes', async () => {
    const k1 = `test-a-${Math.random()}`
    const k2 = `test-b-${Math.random()}`
    await rateLimit(k1, 1, 1000)
    expect((await rateLimit(k1, 1, 1000)).ok).toBe(false)
    expect((await rateLimit(k2, 1, 1000)).ok).toBe(true)
  })
})

describe('getClientIp', () => {
  it('lee x-forwarded-for y toma el primero', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(getClientIp(req)).toBe('1.2.3.4')
  })

  it('cae a x-real-ip si no hay x-forwarded-for', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-real-ip': '9.9.9.9' },
    })
    expect(getClientIp(req)).toBe('9.9.9.9')
  })

  it('cae a cf-connecting-ip', () => {
    const req = new Request('https://example.com', {
      headers: { 'cf-connecting-ip': '4.4.4.4' },
    })
    expect(getClientIp(req)).toBe('4.4.4.4')
  })

  it('retorna unknown sin headers', () => {
    const req = new Request('https://example.com')
    expect(getClientIp(req)).toBe('unknown')
  })
})
