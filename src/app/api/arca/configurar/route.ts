/**
 * POST /api/arca/configurar
 * Guarda las credenciales AFIP/ARCA de la organizacion del usuario,
 * encriptando el certificado y la clave privada antes de persistirlos.
 *
 * GET /api/arca/configurar
 * Devuelve el estado actual (sin las credenciales completas, solo metadata).
 *
 * Solo el OWNER puede configurar AFIP.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole, AuthError } from '@/lib/auth/requireUser'
import { parseBody, ValidationError } from '@/lib/schemas'
import { encryptSecret, isEncryptionConfigured } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

const ArcaConfigSchema = z.object({
  cuit: z.string().trim().regex(/^\d{2}-?\d{8}-?\d{1}$|^\d{11}$/, 'CUIT invalido'),
  punto_venta: z.string().trim().regex(/^\d{1,5}$/, 'Punto de venta debe ser numerico'),
  ambiente: z.enum(['testing', 'produccion']),
  cert_pem: z.string().min(100, 'Certificado invalido').max(20000),
  private_key_pem: z.string().min(100, 'Clave privada invalida').max(20000),
  activado: z.boolean(),
})

export async function GET() {
  try {
    const { supabase, profile } = await requireRole(['owner'])
    const { data: org } = await supabase
      .from('organizations')
      .select('arca_activado, arca_cuit, arca_punto_venta, arca_ambiente, arca_cert_pem_enc')
      .eq('id', profile.org_id)
      .single()

    return NextResponse.json({
      activado: org?.arca_activado === true,
      cuit: org?.arca_cuit ?? null,
      punto_venta: org?.arca_punto_venta ?? null,
      ambiente: org?.arca_ambiente ?? null,
      tiene_certificado: !!org?.arca_cert_pem_enc,
      encryption_ready: isEncryptionConfigured(),
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[ARCA configurar GET] Error:', err)
    return NextResponse.json({ error: 'Error obteniendo configuracion' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, profile } = await requireRole(['owner'])

    if (!isEncryptionConfigured()) {
      return NextResponse.json({
        error: 'El servidor no tiene configurada la encriptacion (STOCKFLOW_ENCRYPTION_KEY). Contactar al administrador.',
      }, { status: 503 })
    }

    const data = await parseBody(req, ArcaConfigSchema)

    // Validar que el PEM parezca PEM legitimo (begin/end)
    if (!data.cert_pem.includes('-----BEGIN CERTIFICATE-----')) {
      return NextResponse.json({
        error: 'El certificado no tiene formato PEM valido. Debe incluir "-----BEGIN CERTIFICATE-----".',
      }, { status: 400 })
    }
    if (!data.private_key_pem.includes('-----BEGIN') || !data.private_key_pem.includes('KEY-----')) {
      return NextResponse.json({
        error: 'La clave privada no tiene formato PEM valido. Debe incluir "-----BEGIN ... KEY-----".',
      }, { status: 400 })
    }

    const cuitLimpio = data.cuit.replace(/-/g, '')
    const certEnc = encryptSecret(data.cert_pem)
    const keyEnc = encryptSecret(data.private_key_pem)

    const { error } = await supabase
      .from('organizations')
      .update({
        arca_activado: data.activado,
        arca_cuit: cuitLimpio,
        arca_punto_venta: data.punto_venta.padStart(4, '0'),
        arca_ambiente: data.ambiente,
        arca_cert_pem_enc: certEnc,
        arca_private_key_pem_enc: keyEnc,
      })
      .eq('id', profile.org_id)

    if (error) {
      console.error('[ARCA configurar] Error de DB:', error)
      return NextResponse.json({ error: 'Error guardando configuracion' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[ARCA configurar POST] Error:', err)
    return NextResponse.json({ error: 'Error guardando configuracion' }, { status: 500 })
  }
}
