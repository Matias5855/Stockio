'use client'
import { useApp } from '@/lib/context/AppContext'
import { tienePermiso } from '@/lib/auth/permisos'

/**
 * Hook para gatear acciones dentro de una página.
 *
 * Va separado de permisos.ts porque ese módulo es puro y lo importan también
 * las rutas de API del servidor, donde un hook de React no tiene sentido.
 *
 * Mientras los permisos cargan devuelve false — se elige el lado seguro: es
 * mejor que un botón aparezca un instante tarde a que alguien alcance a
 * clickearlo sin tener el permiso. En la práctica casi no pasa: el layout no
 * monta las páginas que exigen un permiso hasta terminar de cargarlos.
 */
export function usePermiso(clave: string): boolean {
  const { permisos, role, loading } = useApp()
  if (loading) return false
  return tienePermiso(permisos, role, clave)
}
