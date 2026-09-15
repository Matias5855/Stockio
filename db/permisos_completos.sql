-- ============================================================================
-- Stockio — Backfill de los permisos nuevos
--
-- El catálogo pasó de 8 a 14 claves (src/lib/auth/permisos.ts). Las nuevas son:
--   editar_ventas, eliminar_ventas, ver_cuotas, gestionar_cuotas,
--   ver_historial, ver_configuracion
--
-- Los profiles que ya existen NO las tienen. Como el chequeo es `=== true`,
-- una clave ausente se lee como "no tiene permiso": sin este backfill, al
-- deployar los empleados actuales perderían Cuotas, Historial y Configuración
-- de un día para el otro.
--
-- Esto agrega SOLO las claves que falten, según el rol. Los valores que ya
-- estén cargados NO se pisan: el `||` va con los permisos existentes a la
-- DERECHA, así que ganan ellos.
--
-- Correr en Supabase → SQL Editor DESPUÉS de deployar (o antes, da igual: la
-- app vieja ignora las claves que no conoce). Es idempotente.
-- ============================================================================

-- Dueños: todo en true.
UPDATE profiles
   SET permisos = jsonb_build_object(
         'ver_dashboard', true, 'ver_stock', true, 'editar_stock', true,
         'ver_ventas', true, 'crear_ventas', true, 'editar_ventas', true,
         'eliminar_ventas', true, 'ver_finanzas', true,
         'ver_cuotas', true, 'gestionar_cuotas', true,
         'ver_archivos', true, 'ver_historial', true,
         'ver_configuracion', true, 'gestionar_usuarios', true
       ) || COALESCE(permisos, '{}'::jsonb)
 WHERE role = 'owner';

-- Admin: todo menos Configuración y alta de usuarios.
UPDATE profiles
   SET permisos = jsonb_build_object(
         'editar_ventas', true, 'eliminar_ventas', true,
         'ver_cuotas', true, 'gestionar_cuotas', true,
         'ver_historial', true, 'ver_configuracion', false
       ) || COALESCE(permisos, '{}'::jsonb)
 WHERE role = 'admin';

-- Vendedor: cobra ventas y cuotas, pero NO puede eliminar una venta
-- (control contra el faltante: quien registra no debería poder borrar).
UPDATE profiles
   SET permisos = jsonb_build_object(
         'editar_ventas', true, 'eliminar_ventas', false,
         'ver_cuotas', true, 'gestionar_cuotas', true,
         'ver_historial', false, 'ver_configuracion', false
       ) || COALESCE(permisos, '{}'::jsonb)
 WHERE role = 'vendedor';

-- Repositor: mercadería, no plata.
UPDATE profiles
   SET permisos = jsonb_build_object(
         'editar_ventas', false, 'eliminar_ventas', false,
         'ver_cuotas', false, 'gestionar_cuotas', false,
         'ver_historial', false, 'ver_configuracion', false
       ) || COALESCE(permisos, '{}'::jsonb)
 WHERE role = 'repositor';

-- Verificación: debería devolver 0 filas. Si devuelve alguna, ese profile
-- tiene un role fuera de los cuatro previstos y hay que revisarlo a mano.
-- SELECT id, role FROM profiles
--  WHERE role NOT IN ('owner', 'admin', 'vendedor', 'repositor');
