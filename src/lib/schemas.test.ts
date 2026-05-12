import { describe, it, expect } from 'vitest'
import {
  RegisterInputSchema,
  InvitarEmpleadoInputSchema,
  ProductoSchema,
  VentaSchema,
  MovimientoSchema,
  escapeHtml,
  parseBody,
  ValidationError,
} from './schemas'

describe('escapeHtml', () => {
  it('escapa caracteres peligrosos', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    )
  })

  it('escapa ampersands y comillas', () => {
    expect(escapeHtml(`Don't & "co"`)).toBe('Don&#39;t &amp; &quot;co&quot;')
  })

  it('deja strings normales intactos', () => {
    expect(escapeHtml('Hola Mundo')).toBe('Hola Mundo')
  })

  it('maneja strings vacios', () => {
    expect(escapeHtml('')).toBe('')
  })
})

describe('RegisterInputSchema', () => {
  const valido = {
    nombre: 'Matias Pipp',
    negocio: 'Matineta',
    email: 'matias@example.com',
    password: 'secreto123',
    plan: 'normal' as const,
  }

  it('acepta input valido', () => {
    expect(RegisterInputSchema.safeParse(valido).success).toBe(true)
  })

  it('rechaza email invalido', () => {
    const r = RegisterInputSchema.safeParse({ ...valido, email: 'no-es-email' })
    expect(r.success).toBe(false)
  })

  it('rechaza password corta', () => {
    const r = RegisterInputSchema.safeParse({ ...valido, password: '123' })
    expect(r.success).toBe(false)
  })

  it('rechaza plan que no es normal/premium', () => {
    const r = RegisterInputSchema.safeParse({ ...valido, plan: 'enterprise' })
    expect(r.success).toBe(false)
  })

  it('default plan = normal si no viene', () => {
    const { plan, ...sinPlan } = valido
    void plan
    const r = RegisterInputSchema.safeParse(sinPlan)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.plan).toBe('normal')
  })

  it('lowerCase del email', () => {
    const r = RegisterInputSchema.safeParse({ ...valido, email: 'MATIAS@EXAMPLE.COM' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.email).toBe('matias@example.com')
  })

  it('trim de nombre y negocio', () => {
    const r = RegisterInputSchema.safeParse({ ...valido, nombre: '  Matias  ', negocio: '  Matineta  ' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.nombre).toBe('Matias')
      expect(r.data.negocio).toBe('Matineta')
    }
  })
})

describe('InvitarEmpleadoInputSchema', () => {
  const valido = {
    email: 'empleado@example.com',
    token: 'a'.repeat(32),
    role: 'vendedor' as const,
    org_name: 'Matineta',
  }

  it('acepta los 3 roles validos', () => {
    for (const role of ['admin', 'vendedor', 'repositor'] as const) {
      expect(InvitarEmpleadoInputSchema.safeParse({ ...valido, role }).success).toBe(true)
    }
  })

  it('rechaza rol no listado (whitelist)', () => {
    const r = InvitarEmpleadoInputSchema.safeParse({ ...valido, role: 'owner' })
    expect(r.success).toBe(false)
  })

  it('rechaza token con caracteres invalidos (potencial XSS)', () => {
    const r = InvitarEmpleadoInputSchema.safeParse({
      ...valido,
      token: '<script>alert(1)</script>aaaaaaaaaaaaaaaaa',
    })
    expect(r.success).toBe(false)
  })

  it('rechaza token corto', () => {
    const r = InvitarEmpleadoInputSchema.safeParse({ ...valido, token: 'abc' })
    expect(r.success).toBe(false)
  })
})

describe('ProductoSchema', () => {
  const producto = {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    org_id: 'a1b2c3d4-e5f6-4789-9abc-def012345678',
    nombre: 'Camisa',
    sku: 'CAM-01',
    talle: 'M',
    color: 'Azul',
    cantidad: 10,
    stock_minimo: 2,
    precio_venta: 5000,
    costo: 2500,
    activo: true,
  }

  it('acepta producto valido', () => {
    expect(ProductoSchema.safeParse(producto).success).toBe(true)
  })

  it('acepta talle y color nulos', () => {
    expect(ProductoSchema.safeParse({ ...producto, talle: null, color: null }).success).toBe(true)
  })

  it('rechaza cantidad negativa', () => {
    expect(ProductoSchema.safeParse({ ...producto, cantidad: -1 }).success).toBe(false)
  })

  it('rechaza id no UUID', () => {
    expect(ProductoSchema.safeParse({ ...producto, id: 'abc' }).success).toBe(false)
  })

  it('passthrough: tolera columnas extra desconocidas', () => {
    const r = ProductoSchema.safeParse({ ...producto, columna_nueva: 'valor' })
    expect(r.success).toBe(true)
  })
})

describe('VentaSchema', () => {
  const venta = {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nro_factura: 'FC-0001',
    cliente_nombre: 'Juan',
    fecha: '2026-05-12',
    estado: 'cobrada',
    total: 5000,
    subtotal: 5000,
    descuento: 0,
    notas: null,
    created_at: '2026-05-12T10:00:00Z',
  }

  it('acepta venta valida', () => {
    expect(VentaSchema.safeParse(venta).success).toBe(true)
  })

  it('rechaza estado fuera de enum', () => {
    expect(VentaSchema.safeParse({ ...venta, estado: 'cobrado' }).success).toBe(false)
  })
})

describe('MovimientoSchema', () => {
  const m = {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    descripcion: 'Venta FC-0001',
    tipo: 'ingreso',
    categoria_nombre: 'Ventas',
    monto: 5000,
    fecha: '2026-05-12',
    venta_id: null,
    created_at: '2026-05-12T10:00:00Z',
  }

  it('acepta ingreso y egreso', () => {
    expect(MovimientoSchema.safeParse(m).success).toBe(true)
    expect(MovimientoSchema.safeParse({ ...m, tipo: 'egreso' }).success).toBe(true)
  })

  it('rechaza tipo invalido', () => {
    expect(MovimientoSchema.safeParse({ ...m, tipo: 'transferencia' }).success).toBe(false)
  })
})

describe('parseBody', () => {
  function mockReq(body: unknown): Request {
    return { json: async () => body } as unknown as Request
  }
  function mockReqInvalidJson(): Request {
    return { json: async () => { throw new Error('invalid') } } as unknown as Request
  }

  it('retorna el data parseado si es valido', async () => {
    const req = mockReq({
      nombre: 'Test',
      negocio: 'Negocio',
      email: 'test@example.com',
      password: 'secreto123',
    })
    const data = await parseBody(req, RegisterInputSchema)
    expect(data.nombre).toBe('Test')
  })

  it('tira ValidationError si el body es invalido', async () => {
    const req = mockReq({ nombre: '', negocio: '', email: 'no', password: '123' })
    await expect(parseBody(req, RegisterInputSchema)).rejects.toThrow(ValidationError)
  })

  it('tira ValidationError si el JSON es invalido', async () => {
    const req = mockReqInvalidJson()
    await expect(parseBody(req, RegisterInputSchema)).rejects.toThrow(ValidationError)
  })
})
