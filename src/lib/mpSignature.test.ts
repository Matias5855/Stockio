import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { verifyMpSignature } from './mpSignature'

function signManifest(secret: string, manifest: string): string {
  return crypto.createHmac('sha256', secret).update(manifest).digest('hex')
}

describe('verifyMpSignature', () => {
  const SECRET = 'super-secret'
  const dataId = '12345'
  const requestId = 'req-abc'

  function buildHeader(ts: number, v1: string): string {
    return `ts=${ts},v1=${v1}`
  }

  function manifest(ts: number) {
    return `id:${dataId};request-id:${requestId};ts:${ts};`
  }

  it('valida una firma correcta', () => {
    const ts = Math.floor(Date.now() / 1000)
    const v1 = signManifest(SECRET, manifest(ts))
    const r = verifyMpSignature({
      signatureHeader: buildHeader(ts, v1),
      requestId,
      dataId,
      secret: SECRET,
    })
    expect(r.ok).toBe(true)
  })

  it('rechaza firma incorrecta', () => {
    const ts = Math.floor(Date.now() / 1000)
    const r = verifyMpSignature({
      signatureHeader: buildHeader(ts, 'a'.repeat(64)),
      requestId,
      dataId,
      secret: SECRET,
    })
    expect(r.ok).toBe(false)
  })

  it('rechaza ts muy viejo (replay)', () => {
    const ts = Math.floor(Date.now() / 1000) - 1000 // 1000s atras
    const v1 = signManifest(SECRET, manifest(ts))
    const r = verifyMpSignature({
      signatureHeader: buildHeader(ts, v1),
      requestId,
      dataId,
      secret: SECRET,
      maxAgeSec: 300,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/replay|tolerancia/)
  })

  it('rechaza secret ausente', () => {
    const r = verifyMpSignature({
      signatureHeader: buildHeader(Date.now() / 1000, 'x'),
      requestId,
      dataId,
      secret: undefined,
    })
    expect(r.ok).toBe(false)
  })

  it('rechaza signatureHeader ausente', () => {
    const r = verifyMpSignature({
      signatureHeader: null,
      requestId,
      dataId,
      secret: SECRET,
    })
    expect(r.ok).toBe(false)
  })

  it('rechaza header mal formado', () => {
    const r = verifyMpSignature({
      signatureHeader: 'no-tiene-igual',
      requestId,
      dataId,
      secret: SECRET,
    })
    expect(r.ok).toBe(false)
  })

  it('rechaza dataId ausente', () => {
    const ts = Math.floor(Date.now() / 1000)
    const r = verifyMpSignature({
      signatureHeader: buildHeader(ts, 'x'),
      requestId,
      dataId: undefined,
      secret: SECRET,
    })
    expect(r.ok).toBe(false)
  })

  it('no acepta firma con longitud invalida (proteccion timingSafe)', () => {
    const ts = Math.floor(Date.now() / 1000)
    const r = verifyMpSignature({
      signatureHeader: buildHeader(ts, 'abcd'),
      requestId,
      dataId,
      secret: SECRET,
    })
    expect(r.ok).toBe(false)
  })
})
