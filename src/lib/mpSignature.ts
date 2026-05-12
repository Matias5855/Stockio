/**
 * Validacion de la firma HMAC del webhook de Mercado Pago.
 *
 * MP envia un header `x-signature` con formato:
 *   ts=1704028800,v1=hex-sha256-hmac
 *
 * Y un header `x-request-id`.
 *
 * El manifest a firmar es:
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * El HMAC se hace con SHA-256 y el secret se obtiene en
 * MP Dashboard → Tus integraciones → Webhooks → Configurar notificaciones → "Clave secreta".
 *
 * Doc oficial:
 * https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks#editor_5
 */
import crypto from 'node:crypto'

export type MpSignatureCheck =
  | { ok: true }
  | { ok: false; reason: string }

export function verifyMpSignature(opts: {
  signatureHeader: string | null
  requestId: string | null
  dataId: string | undefined
  secret: string | undefined
  /** Tolerancia para evitar ataques de replay. Default 5 minutos. */
  maxAgeSec?: number
}): MpSignatureCheck {
  const { signatureHeader, requestId, dataId, secret } = opts
  const maxAgeSec = opts.maxAgeSec ?? 300

  if (!secret) return { ok: false, reason: 'MP_WEBHOOK_SECRET no configurado' }
  if (!signatureHeader) return { ok: false, reason: 'x-signature ausente' }
  if (!requestId) return { ok: false, reason: 'x-request-id ausente' }
  if (!dataId) return { ok: false, reason: 'data.id ausente' }

  // Parsear "ts=1234,v1=abc..."
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, ...rest] = p.split('=')
      return [k.trim(), rest.join('=').trim()]
    })
  )
  const ts = parts['ts']
  const v1 = parts['v1']
  if (!ts || !v1) return { ok: false, reason: 'x-signature mal formado' }

  // Anti-replay: ts en segundos, rechazar > maxAgeSec
  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return { ok: false, reason: 'ts invalido' }
  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - tsNum) > maxAgeSec) {
    return { ok: false, reason: 'ts fuera de tolerancia (posible replay)' }
  }

  // Manifest segun MP: id:<dataId>;request-id:<reqId>;ts:<ts>;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

  // Comparacion timing-safe
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(v1, 'hex')
  if (a.length !== b.length) return { ok: false, reason: 'firma con longitud invalida' }
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'firma no coincide' }

  return { ok: true }
}
