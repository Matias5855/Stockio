import { describe, it, expect } from 'vitest'
import {
  PERMISOS_LABELS,
  CLAVES_PERMISOS,
  PERMISOS_OWNER,
  ROLES_PRESET,
  tienePermiso,
} from './permisos'

/**
 * Estos tests existen por un motivo concreto: esta tabla estaba duplicada en
 * tres archivos y se podía desincronizar en silencio (un preset otorgando una
 * clave que ya no existía, o una clave nueva que ningún preset contemplaba, y
 * nadie se enteraba hasta que un empleado no podía entrar a algo).
 */

describe('catálogo de permisos', () => {
  it('cada preset de rol cubre TODAS las claves del catálogo', () => {
    for (const [rol, permisos] of Object.entries(ROLES_PRESET)) {
      const faltantes = CLAVES_PERMISOS.filter(k => !(k in permisos))
      expect(faltantes, `al rol "${rol}" le faltan claves`).toEqual([])
    }
  })

  it('ningún preset otorga una clave que no esté en el catálogo', () => {
    for (const [rol, permisos] of Object.entries(ROLES_PRESET)) {
      const sobrantes = Object.keys(permisos).filter(k => !CLAVES_PERMISOS.includes(k))
      expect(sobrantes, `el rol "${rol}" tiene claves desconocidas`).toEqual([])
    }
  })

  it('el dueño tiene todas las claves en true', () => {
    expect(Object.keys(PERMISOS_OWNER).sort()).toEqual([...CLAVES_PERMISOS].sort())
    expect(Object.values(PERMISOS_OWNER).every(v => v === true)).toBe(true)
  })

  it('toda clave del catálogo tiene etiqueta visible', () => {
    for (const clave of CLAVES_PERMISOS) {
      expect(PERMISOS_LABELS[clave]?.length, `"${clave}" sin etiqueta`).toBeGreaterThan(0)
    }
  })

  it('ningún rol invitable puede gestionar usuarios ni ver Configuración', () => {
    // Son las dos llaves del negocio: dar de alta gente y tocar el cobro /
    // los datos fiscales. Quedan solo para el dueño.
    for (const [rol, permisos] of Object.entries(ROLES_PRESET)) {
      expect(permisos.gestionar_usuarios, `"${rol}" no debería gestionar usuarios`).toBe(false)
      expect(permisos.ver_configuracion, `"${rol}" no debería ver Configuración`).toBe(false)
    }
  })

  it('el vendedor puede registrar ventas pero no eliminarlas', () => {
    // Control contra el faltante: quien cobra en el mostrador no debería poder
    // borrar la venta después.
    expect(ROLES_PRESET.vendedor.crear_ventas).toBe(true)
    expect(ROLES_PRESET.vendedor.eliminar_ventas).toBe(false)
  })
})

describe('tienePermiso', () => {
  it('sin clave requerida, deja pasar', () => {
    expect(tienePermiso({}, 'vendedor')).toBe(true)
  })

  it('el dueño pasa aunque tenga los permisos vacíos', () => {
    expect(tienePermiso({}, 'owner', 'ver_finanzas')).toBe(true)
  })

  it('una clave ausente NO se interpreta como permitida', () => {
    expect(tienePermiso({}, 'vendedor', 'ver_finanzas')).toBe(false)
  })

  it('solo el true explícito habilita', () => {
    expect(tienePermiso({ ver_finanzas: true }, 'vendedor', 'ver_finanzas')).toBe(true)
    expect(tienePermiso({ ver_finanzas: false }, 'vendedor', 'ver_finanzas')).toBe(false)
  })
})
