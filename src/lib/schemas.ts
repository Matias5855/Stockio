/**
 * Schemas Zod para validacion en bordes (API routes + datos remotos).
 *
 * Uso:
 * - En API routes: ParseBody con safeParse, retornar 400 con mensaje claro
 * - En hooks: opcional, parsear data de Supabase para detectar drift de schema
 *
 * Los schemas usan .passthrough() donde corresponde para no romper si la DB
 * agrega columnas nuevas que el frontend aun no conoce.
 */
import { z } from 'zod'

// ── Auth ────────────────────────────────────────────────────────────
export const RegisterInputSchema = z.object({
  nombre: z.string().trim().min(2, 'Nombre minimo 2 caracteres').max(80),
  negocio: z.string().trim().min(2, 'Nombre del negocio minimo 2 caracteres').max(80),
  email: z.string().trim().toLowerCase().email('Email invalido'),
  password: z.string().min(6, 'Contrasena minimo 6 caracteres').max(72),
  plan: z.enum(['normal', 'premium']).default('normal'),
})
export type RegisterInput = z.infer<typeof RegisterInputSchema>

// ── Empleados ───────────────────────────────────────────────────────
export const EmpleadoRoleSchema = z.enum(['admin', 'vendedor', 'repositor'])
export type EmpleadoRole = z.infer<typeof EmpleadoRoleSchema>

export const InvitarEmpleadoInputSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email invalido'),
  token: z.string().min(16, 'Token invalido').max(128).regex(/^[A-Za-z0-9_-]+$/, 'Token con caracteres invalidos'),
  role: EmpleadoRoleSchema,
  org_name: z.string().trim().min(1).max(80),
})
export type InvitarEmpleadoInput = z.infer<typeof InvitarEmpleadoInputSchema>

// ── Producto ────────────────────────────────────────────────────────
export const ProductoSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  nombre: z.string().min(1).max(200),
  sku: z.string().min(1).max(80),
  talle: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  cantidad: z.number().int().nonnegative(),
  stock_minimo: z.number().int().nonnegative(),
  precio_venta: z.number().nonnegative(),
  costo: z.number().nonnegative(),
  activo: z.boolean(),
}).passthrough()
export type ProductoParsed = z.infer<typeof ProductoSchema>

// ── Venta ───────────────────────────────────────────────────────────
export const VentaEstadoSchema = z.enum(['cobrada', 'pendiente', 'cancelada'])

export const VentaItemSchema = z.object({
  producto_id: z.string().uuid().nullable(),
  producto_nombre: z.string().min(1).max(300),
  cantidad: z.number().int().positive(),
  precio_unitario: z.number().nonnegative(),
}).passthrough()

export const VentaSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid().optional(),
  nro_factura: z.string(),
  cliente_nombre: z.string().nullable(),
  fecha: z.string(),
  estado: VentaEstadoSchema,
  total: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
  descuento: z.number().nonnegative(),
  notas: z.string().nullable(),
  created_at: z.string(),
  venta_items: z.array(VentaItemSchema).optional(),
}).passthrough()
export type VentaParsed = z.infer<typeof VentaSchema>

// ── Movimiento ──────────────────────────────────────────────────────
export const MovimientoTipoSchema = z.enum(['ingreso', 'egreso'])

export const MovimientoSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid().optional(),
  descripcion: z.string().min(1).max(300),
  tipo: MovimientoTipoSchema,
  categoria_nombre: z.string().nullable(),
  monto: z.number(),
  fecha: z.string(),
  venta_id: z.string().uuid().nullable(),
  created_at: z.string(),
}).passthrough()
export type MovimientoParsed = z.infer<typeof MovimientoSchema>

// ── Mercado Pago / Cobros ───────────────────────────────────────────
export const QrRapidoInputSchema = z.object({
  monto: z.number().positive().max(10_000_000),
  descripcion: z.string().trim().min(1).max(200),
})
export type QrRapidoInput = z.infer<typeof QrRapidoInputSchema>

export const SuscripcionInputSchema = z.object({
  plan_id: z.enum(['pro', 'business']),
  // payer_email opcional: si no viene lo tomamos del user logueado
  payer_email: z.string().trim().toLowerCase().email().optional(),
})
export type SuscripcionInput = z.infer<typeof SuscripcionInputSchema>

export const LinkPagoInputSchema = z.object({
  cuota_venta_id: z.string().uuid(),
  cliente_email: z.string().trim().toLowerCase().email(),
  monto: z.number().positive().max(10_000_000),
  descripcion: z.string().trim().min(1).max(200),
})
export type LinkPagoInput = z.infer<typeof LinkPagoInputSchema>

export const FacturaInputSchema = z.object({
  venta_id: z.string().uuid(),
  email_cliente: z.string().trim().toLowerCase().email().optional(),
  usar_arca: z.boolean().optional().default(false),
})
export type FacturaInput = z.infer<typeof FacturaInputSchema>

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Valida que un string sea un UUID v4 razonable.
 * Util para sanear valores leidos de localStorage antes de mandarlos al backend.
 */
export function isValidUuid(s: unknown): s is string {
  if (typeof s !== 'string') return false
  // UUID v4 strict-ish: 8-4-4-4-12 hex
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

/**
 * Parsea body de API route, retorna tipo seguro o lanza con mensaje formateado.
 * Uso: const data = await parseBody(req, MySchema)
 */
export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const json = await req.json().catch(() => null)
  if (json === null) {
    throw new ValidationError('JSON invalido en el body')
  }
  const result = schema.safeParse(json)
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new ValidationError(issues)
  }
  return result.data
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Helper para escapar HTML en strings que van a templates de email.
 * Previene injection cuando el contenido viene del usuario.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
