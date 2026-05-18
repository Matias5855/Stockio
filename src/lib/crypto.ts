/**
 * Encriptacion simetrica AES-256-GCM para guardar secretos en la DB.
 *
 * Uso: certificados y claves privadas de AFIP/ARCA por organizacion.
 * NO usar para hashes de password (eso lo hace Supabase Auth).
 *
 * Requiere env var STOCKIO_ENCRYPTION_KEY:
 *   - 32 bytes (256 bits) en formato base64
 *   - Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Formato del cipher: base64(iv).base64(authTag).base64(ciphertext)
 */
import crypto from 'node:crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const raw = process.env.STOCKIO_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'STOCKIO_ENCRYPTION_KEY no esta configurada. Generala con: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    )
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('STOCKIO_ENCRYPTION_KEY debe ser 32 bytes (256 bits) en base64')
  }
  return key
}

export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${enc.toString('base64')}`
}

export function decryptSecret(payload: string): string {
  const key = getKey()
  const parts = payload.split('.')
  if (parts.length !== 3) throw new Error('Cipher format invalido')
  const [ivB64, tagB64, dataB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')

  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)
  const dec = Buffer.concat([decipher.update(data), decipher.final()])
  return dec.toString('utf8')
}

/**
 * Checkea si la key esta configurada — util para mostrar UI alternativa
 * cuando el setup no esta listo. NO lanza, solo retorna boolean.
 */
export function isEncryptionConfigured(): boolean {
  try {
    getKey()
    return true
  } catch {
    return false
  }
}
