-- ============================================================================
-- Stockio — RLS Fase B2: suscripciones e invitaciones
--
-- PROBLEMA 1 — Suscripción gratis para siempre
--   suscripciones_update | USING (org_id = get_org_id()) | CHECK: (ninguno)
--   suscripciones_insert | CHECK (org_id = get_org_id())
-- Cualquier miembro de la organización podía hacer, desde la consola:
--   update suscripciones set estado='activa', trial_fin='2099-01-01'
-- y no pagar nunca más. El estado de la suscripción es lo único que separa a
-- un cliente que paga de uno que no: no puede ser escribible por el cliente.
--
-- PROBLEMA 2 — Invitarse a uno mismo con más privilegios
--   invitaciones_org | ALL | USING/CHECK (org_id = get_org_id())
-- `ALL` + solo mirar la organización significaba que cualquier empleado podía
-- insertar una invitación con role='admin' y aceptarla en /invite, volviendo
-- con una segunda cuenta de más nivel. Además podía LEER los tokens de todas
-- las invitaciones pendientes del negocio.
--
-- REQUIERE DEPLOY DEL CÓDIGO: las escrituras se movieron al servidor
--   - /api/suscripcion y /api/suscripcion/cancelar -> createAdminClient()
--   - /api/empleados/invitar -> ahora CREA la invitación (antes la creaba el
--     navegador y solo mandaba el mail)
-- service_role saltea RLS, así que esos endpoints siguen funcionando.
--
-- >>> ORDEN: correr este script DESPUÉS de deployar el código. Si se corre
-- >>> antes, invitar empleados y cancelar la suscripción fallan hasta el deploy.
--
-- Correr COMPLETO en Supabase → SQL Editor. Es idempotente.
-- ============================================================================

BEGIN;

-- 1. suscripciones: solo lectura para el cliente ----------------------------
DROP POLICY IF EXISTS suscripciones_update ON public.suscripciones;
DROP POLICY IF EXISTS suscripciones_insert ON public.suscripciones;

REVOKE INSERT, UPDATE, DELETE ON public.suscripciones FROM authenticated;

-- Queda suscripciones_select (org_id = get_org_id()), que es lo que necesitan
-- el paywall, el banner de trial y la pantalla de Configuración.

-- 2. invitaciones: solo quien gestiona usuarios, y solo leer/cancelar -------
DROP POLICY IF EXISTS invitaciones_org ON public.invitaciones;

-- Listar las pendientes en la pantalla de Empleados.
CREATE POLICY invitaciones_select ON public.invitaciones
  FOR SELECT
  USING (org_id = get_org_id() AND tiene_permiso('gestionar_usuarios'));

-- Cancelar una invitación pendiente.
CREATE POLICY invitaciones_delete ON public.invitaciones
  FOR DELETE
  USING (org_id = get_org_id() AND tiene_permiso('gestionar_usuarios'));

-- Sin política de INSERT ni UPDATE a propósito: las crea /api/empleados/invitar
-- con service_role, y las marca aceptadas /api/empleados/aceptar, también con
-- service_role. Ninguna de las dos pasa por RLS.
REVOKE INSERT, UPDATE ON public.invitaciones FROM authenticated;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN — esperado: una sola fila que diga OK.
-- ============================================================================

SELECT CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.role_table_grants
          WHERE table_schema = 'public'
            AND grantee = 'authenticated'
            AND ((table_name = 'suscripciones' AND privilege_type IN ('INSERT','UPDATE','DELETE'))
              OR (table_name = 'invitaciones'  AND privilege_type IN ('INSERT','UPDATE')))
       ) THEN 'FALLA: el cliente todavía puede escribir suscripciones o invitaciones'
         WHEN EXISTS (
         SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'invitaciones'
            AND policyname = 'invitaciones_org'
       ) THEN 'FALLA: sigue existiendo la política vieja invitaciones_org'
       ELSE 'OK: suscripciones de solo lectura e invitaciones acotadas'
  END AS resultado;
