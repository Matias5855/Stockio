/**
 * Catálogo de permisos — FUENTE ÚNICA.
 *
 * Antes esta misma tabla estaba copiada en tres lugares (register/route.ts,
 * empleados/aceptar/route.ts y empleados/page.tsx). Agregar una clave obligaba
 * a tocar los tres y podían quedar desincronizados sin que nadie se entere:
 * el form mostraba un permiso que el servidor nunca asignaba, o al revés.
 *
 * Este módulo es PURO a propósito (sin 'use client', sin React): lo importan
 * tanto las rutas de API del servidor como las páginas del cliente. El hook
 * para usarlo en componentes vive aparte, en usePermiso.ts.
 *
 * Hay dos niveles de permiso y conviene no confundirlos:
 *   - ver_*      -> entrar a la sección. Lo aplica el layout: filtra el menú y
 *                   bloquea la pantalla si alguien llega por otro camino.
 *   - crear_/editar_/eliminar_/gestionar_ -> hacer cosas adentro de una
 *                   sección que igual podés ver. Lo aplica cada página.
 *
 * OJO: esto es capa de interfaz. Esconder un botón no impide que alguien llame
 * a la API por su cuenta — esa barrera es RLS, y va aparte.
 */

export type Permisos = Record<string, boolean>

/** Clave -> etiqueta que ve el dueño al invitar. El orden acá es el orden en pantalla. */
export const PERMISOS_LABELS: Record<string, string> = {
  ver_dashboard:       'Ver Dashboard',
  ver_stock:           'Ver Inventario',
  editar_stock:        'Editar Inventario',
  ver_ventas:          'Ver Ventas',
  crear_ventas:        'Registrar Ventas',
  editar_ventas:       'Cobrar / Facturar Ventas',
  eliminar_ventas:     'Eliminar Ventas',
  ver_finanzas:        'Ver Finanzas',
  ver_cuotas:          'Ver Cuotas',
  gestionar_cuotas:    'Cobrar Cuotas',
  ver_archivos:        'Ver Archivos',
  ver_historial:       'Ver Historial',
  ver_configuracion:   'Ver Configuración',
  gestionar_usuarios:  'Gestionar Usuarios',
}

export const CLAVES_PERMISOS = Object.keys(PERMISOS_LABELS)

/** Todo en true. Es lo que recibe el dueño al registrarse. */
export const PERMISOS_OWNER: Permisos =
  Object.fromEntries(CLAVES_PERMISOS.map(k => [k, true]))

/**
 * Presets por rol. Hoy el form de invitar NO deja tocar permisos sueltos: el
 * dueño elige un rol y ve qué otorga. Por eso estos tres presets son la única
 * palanca real y conviene que representen roles de negocio de verdad.
 */
export const ROLES_PRESET: Record<string, Permisos> = {
  // Mano derecha del dueño. Todo menos la plata de la suscripción y el alta de
  // gente: Configuración guarda el token de Mercado Pago y los datos fiscales.
  admin: {
    ver_dashboard: true, ver_stock: true, editar_stock: true,
    ver_ventas: true, crear_ventas: true, editar_ventas: true, eliminar_ventas: true,
    ver_finanzas: true,
    ver_cuotas: true, gestionar_cuotas: true,
    ver_archivos: true, ver_historial: true,
    ver_configuracion: false, gestionar_usuarios: false,
  },
  // Mostrador: vende y cobra cuotas (lo normal en una PyME que vende en cuotas),
  // pero NO puede eliminar una venta. Es el control clásico contra el faltante:
  // quien registra la venta no debería poder borrarla después.
  vendedor: {
    ver_dashboard: true, ver_stock: true, editar_stock: false,
    ver_ventas: true, crear_ventas: true, editar_ventas: true, eliminar_ventas: false,
    ver_finanzas: false,
    ver_cuotas: true, gestionar_cuotas: true,
    ver_archivos: false, ver_historial: false,
    ver_configuracion: false, gestionar_usuarios: false,
  },
  // Depósito: toca mercadería, no toca plata.
  repositor: {
    ver_dashboard: true, ver_stock: true, editar_stock: true,
    ver_ventas: false, crear_ventas: false, editar_ventas: false, eliminar_ventas: false,
    ver_finanzas: false,
    ver_cuotas: false, gestionar_cuotas: false,
    ver_archivos: false, ver_historial: false,
    ver_configuracion: false, gestionar_usuarios: false,
  },
}

export const ROLES_INVITABLES = Object.keys(ROLES_PRESET)

/**
 * El dueño (role 'owner') siempre puede todo: al registrarse se le crean todos
 * los permisos en true, pero el bypass explícito evita que quede encerrado
 * fuera de su propio negocio si ese dato faltara o llegara mal.
 */
export function tienePermiso(permisos: Permisos, role: string, clave?: string): boolean {
  if (!clave) return true
  if (role === 'owner') return true
  return permisos?.[clave] === true
}
