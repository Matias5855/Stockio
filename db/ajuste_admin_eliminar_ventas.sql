-- ============================================================================
-- Stockio — Corrección del preset admin: eliminar_ventas
--
-- Decisión del dueño (2026-09-22): borrar una venta queda como acto exclusivo
-- del dueño. Es la forma más directa de tapar un faltante de caja, así que ni
-- siquiera el admin debería poder hacerlo.
--
-- El preset ya se corrigió en src/lib/auth/permisos.ts, pero eso solo aplica a
-- invitaciones NUEVAS. Los admin que ya existen recibieron eliminar_ventas en
-- true cuando se corrió db/permisos_completos.sql, y ese script no pisa valores
-- ya cargados. Este los corrige.
--
-- Se aplica solo a role='admin'. El dueño no se toca: pasa por el bypass de
-- tiene_permiso() igual.
--
-- Correr en Supabase → SQL Editor. Es idempotente.
-- ============================================================================

UPDATE profiles
   SET permisos = permisos || jsonb_build_object('eliminar_ventas', false)
 WHERE role = 'admin'
   AND COALESCE((permisos ->> 'eliminar_ventas')::boolean, false) IS DISTINCT FROM false;

-- Verificación. Esperado: una fila 'OK'.
SELECT CASE WHEN EXISTS (
         SELECT 1 FROM profiles
          WHERE role <> 'owner'
            AND COALESCE((permisos ->> 'eliminar_ventas')::boolean, false) = true)
       THEN 'FALLA: algún empleado todavía puede eliminar ventas'
       ELSE 'OK: eliminar ventas quedó solo para el dueño' END AS resultado;
