// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * Arrancar sin conexión con los permisos correctos.
 *
 * Offline, getUser() falla. Sin el perfil cacheado el contexto quedaba con
 * role 'member' y permisos vacíos, y la app mostraba "No tenés permiso" en
 * todas las secciones — al dueño incluido. Nunca se notó porque el service
 * worker no estaba registrado y la app directamente no abría sin red.
 */

const auth = {
  sesionUserId: 'u1' as string | null,
  getUserFalla: false,
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => auth.getUserFalla
        ? { data: { user: null }, error: { message: 'TypeError: Failed to fetch' } }
        : { data: { user: { id: 'u1' } }, error: null },
      getSession: async () => ({
        data: { session: auth.sesionUserId ? { user: { id: auth.sesionUserId } } : null },
      }),
    },
    from: (tabla: string) => {
      const q = {
        select: () => q, eq: () => q,
        single: async () => tabla === 'profiles'
          ? { data: { org_id: 'org1', role: 'vendedor', permisos: { ver_ventas: true, crear_ventas: true } } }
          : { data: { plan_id: 'premium' } },
      }
      return q
    },
  }),
}))

const { AppProvider, useApp, borrarPerfilCacheado } = await import('./AppContext')

let enLinea = true
Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => enLinea })

const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>

async function leerContexto() {
  const r = renderHook(() => useApp(), { wrapper })
  await waitFor(() => expect(r.result.current.loading).toBe(false))
  return r.result.current
}

beforeEach(() => {
  localStorage.clear()
  enLinea = true
  auth.sesionUserId = 'u1'
  auth.getUserFalla = false
})

describe('AppContext sin conexión', () => {
  it('con conexión carga el perfil y lo guarda para después', async () => {
    const ctx = await leerContexto()
    expect(ctx.role).toBe('vendedor')
    expect(ctx.permisos.crear_ventas).toBe(true)
    expect(JSON.parse(localStorage.getItem('stk_perfil_cache')!).userId).toBe('u1')
  })

  it('sin conexión usa el último perfil conocido', async () => {
    await leerContexto()           // con conexión: guarda el perfil
    enLinea = false
    const ctx = await leerContexto()
    expect(ctx.role).toBe('vendedor')
    expect(ctx.permisos.ver_ventas).toBe(true)
    expect(ctx.plan).toBe('premium')
  })

  it('con wifi sin internet (getUser falla por red) también', async () => {
    await leerContexto()
    auth.getUserFalla = true
    const ctx = await leerContexto()
    expect(ctx.role).toBe('vendedor')
  })

  /** Otra cuenta en el mismo equipo no hereda los permisos de la anterior. */
  it('NO usa el perfil si la sesión local es de otro usuario', async () => {
    await leerContexto()
    enLinea = false
    auth.sesionUserId = 'otro-usuario'
    const ctx = await leerContexto()
    expect(ctx.role).toBe('member')
    expect(ctx.permisos).toEqual({})
  })

  it('NO usa el perfil si no hay sesión', async () => {
    await leerContexto()
    enLinea = false
    auth.sesionUserId = null
    const ctx = await leerContexto()
    expect(ctx.permisos).toEqual({})
  })

  it('al cerrar sesión el perfil se borra', async () => {
    await leerContexto()
    borrarPerfilCacheado()
    enLinea = false
    const ctx = await leerContexto()
    expect(ctx.permisos).toEqual({})
  })
})
