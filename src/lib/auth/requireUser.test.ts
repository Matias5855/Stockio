import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { exigirPermiso, AuthError, type Profile } from './requireUser'
import { CLAVES_PERMISOS, ROLES_PRESET, PERMISOS_OWNER } from './permisos'

/**
 * Las rutas de API venian mirando solo `role`, nunca `permisos`. Las acciones
 * que 1.4.E gateo por permiso (emitir CAE, cobrar por QR, generar link de
 * cuotas) se cumplian unicamente en la interfaz: con un POST a mano se
 * salteaban. Estos tests fijan las dos cosas que pueden volver a romperse.
 */

function perfil(role: string, permisos: Record<string, boolean>): Profile {
  return { id: 'u1', org_id: 'o1', role, permisos }
}

describe('exigirPermiso', () => {
  it('deja pasar cuando la clave esta en true', () => {
    expect(() => exigirPermiso(perfil('vendedor', { editar_ventas: true }), 'editar_ventas')).not.toThrow()
  })

  it('corta con 403 cuando la clave esta en false', () => {
    try {
      exigirPermiso(perfil('vendedor', { editar_ventas: false }), 'editar_ventas')
      expect.unreachable('tendria que haber lanzado')
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError)
      expect((e as AuthError).status).toBe(403)
    }
  })

  it('corta con 403 cuando la clave no esta', () => {
    expect(() => exigirPermiso(perfil('vendedor', {}), 'editar_ventas')).toThrow(AuthError)
  })

  /**
   * Un profile viejo que db/permisos_completos.sql no haya alcanzado puede
   * traer `permisos` en null. Tiene que fallar cerrado, no abrirse.
   */
  it('falla cerrado si permisos viene null', () => {
    const p = { id: 'u1', org_id: 'o1', role: 'vendedor', permisos: null } as unknown as Profile
    expect(() => exigirPermiso(p, 'editar_ventas')).toThrow(AuthError)
  })

  it('el owner pasa siempre, incluso con permisos vacios o en false', () => {
    expect(() => exigirPermiso(perfil('owner', {}), 'editar_ventas')).not.toThrow()
    expect(() => exigirPermiso(perfil('owner', { editar_ventas: false }), 'editar_ventas')).not.toThrow()
    for (const clave of CLAVES_PERMISOS) {
      expect(() => exigirPermiso(perfil('owner', {}), clave)).not.toThrow()
    }
  })
})

/**
 * La clave es un string suelto en cada ruta, asi que un typo
 * (`'editar_venta'`) no lo agarra el compilador: pasaria a rechazar a TODO el
 * mundo menos al owner, y solo se notaria cuando un empleado se queje. Este
 * test recorre las rutas y valida las claves que usan contra el catalogo.
 */
describe('claves de permiso usadas en las rutas de API', () => {
  const rutasDir = path.resolve(__dirname, '../../app/api')

  function archivosDeRuta(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entrada => {
      const completo = path.join(dir, entrada.name)
      if (entrada.isDirectory()) return archivosDeRuta(completo)
      return entrada.name === 'route.ts' ? [completo] : []
    })
  }

  it('todas existen en el catalogo', () => {
    const usos: { archivo: string; clave: string }[] = []

    for (const archivo of archivosDeRuta(rutasDir)) {
      const codigo = readFileSync(archivo, 'utf8')
      const re = /(?:requirePermiso|exigirPermiso)\([^)]*?'([^']+)'\)/g
      for (const m of codigo.matchAll(re)) {
        usos.push({ archivo: path.relative(rutasDir, archivo), clave: m[1] })
      }
    }

    // Si esto queda en 0 es que el regex dejo de matchear, no que no haya usos.
    expect(usos.length).toBeGreaterThan(0)

    const invalidas = usos.filter(u => !CLAVES_PERMISOS.includes(u.clave))
    expect(invalidas, 'claves que no estan en PERMISOS_LABELS').toEqual([])
  })
})

/**
 * Cada clave que se exige en el servidor tiene que ser otorgable: si ningun
 * preset la da y el owner tampoco, la accion queda muerta para todos.
 */
describe('coherencia con los presets', () => {
  it('editar_ventas y gestionar_cuotas las otorga algun rol invitable', () => {
    for (const clave of ['editar_ventas', 'gestionar_cuotas']) {
      const roles = Object.entries(ROLES_PRESET).filter(([, p]) => p[clave] === true)
      expect(roles.length, `ningun preset otorga ${clave}`).toBeGreaterThan(0)
    }
  })

  it('el owner tiene todas las claves que el servidor puede exigir', () => {
    for (const clave of CLAVES_PERMISOS) {
      expect(PERMISOS_OWNER[clave], clave).toBe(true)
    }
  })
})
