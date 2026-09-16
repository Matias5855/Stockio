-- ============================================================================
-- Stockio — RLS Fase B3: sacar los secretos del navegador
--
-- EL PROBLEMA
--
-- La tabla `organizations` guarda, además de los datos del negocio:
--   mp_access_token            -> token de Mercado Pago, EN CLARO
--   arca_cert_pem_enc          -> certificado fiscal (cifrado)
--   arca_private_key_pem_enc   -> clave privada fiscal (cifrada)
--
-- La política `org_select USING (id = get_org_id())` es correcta a nivel de
-- FILA, pero RLS no distingue columnas. Y el código hacía `select('*')` en
-- cuatro lugares, así que el token de Mercado Pago se descargaba al navegador
-- de cualquier empleado. Con ese token se puede operar sobre la cuenta de MP
-- del negocio; no está cifrado como los de ARCA.
--
-- LA SOLUCIÓN
--
-- El cliente deja de poder leer `organizations`. En su lugar lee la vista
-- `mi_organizacion`, que expone todas las columnas MENOS los secretos.
--
-- La vista NO usa security_invoker a propósito: como se le revoca el SELECT
-- sobre la tabla al rol `authenticated`, una vista con security_invoker
-- fallaría igual. Corre con los privilegios de su dueño y hace el filtrado
-- ella misma con `WHERE id = get_org_id()`. No hay forma de pedirle filas de
-- otro negocio: el filtro está adentro, no lo pone quien consulta.
--
-- Se conserva GRANT SELECT sobre la columna `id` porque Postgres exige
-- privilegio de lectura sobre las columnas que aparecen en el WHERE de un
-- UPDATE, y la pantalla de Configuración actualiza con `.eq('id', ...)`.
--
-- REQUIERE DEPLOY DEL CÓDIGO. Se movieron a service_role las rutas que sí
-- necesitan los secretos y que hoy usan el cliente del usuario:
--   api/cuotas/link-pago · api/mp/qr-rapido · api/mp/callback
--   api/factura · api/arca/configurar
-- Y las lecturas del cliente pasaron a la vista.
--
-- >>> ORDEN: correr DESPUÉS de deployar el código, igual que la Fase B2.
-- >>> Si se corre antes, se rompen la facturación, el QR y Configuración.
--
-- Correr COMPLETO en Supabase → SQL Editor. Es idempotente.
-- ============================================================================

BEGIN;

-- 1. Vista sin secretos ------------------------------------------------------
-- La lista de columnas se arma sola: así, si mañana se agrega una columna
-- nueva al negocio, aparece en la vista sin tener que tocar este script.
-- Los secretos se excluyen por nombre Y por patrón, para que una columna
-- futura que se llame *_token o *_secret quede afuera por defecto.
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'organizations'
     AND column_name NOT IN ('mp_access_token', 'mp_refresh_token',
                             'arca_cert_pem_enc', 'arca_private_key_pem_enc')
     AND column_name NOT LIKE '%token%'
     AND column_name NOT LIKE '%secret%'
     AND column_name NOT LIKE '%_pem%'
     AND column_name NOT LIKE '%private_key%';

  IF cols IS NULL THEN
    RAISE EXCEPTION 'No se pudo armar la lista de columnas de organizations';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.mi_organizacion AS
       SELECT %s FROM public.organizations WHERE id = get_org_id()', cols);
END $$;

GRANT SELECT ON public.mi_organizacion TO authenticated;
REVOKE ALL ON public.mi_organizacion FROM anon;

-- 2. Sacarle al cliente la lectura de la tabla ------------------------------
-- Solo queda `id`, que hace falta para el WHERE de los UPDATE.
REVOKE SELECT ON public.organizations FROM authenticated;
GRANT  SELECT (id) ON public.organizations TO authenticated;

-- 3. Endurecer las políticas de organizations -------------------------------
-- org_insert tenía CHECK true: cualquier usuario podía crear organizaciones.
-- Las crea /api/auth/register con service_role, que no pasa por RLS.
DROP POLICY IF EXISTS org_insert ON public.organizations;
REVOKE INSERT ON public.organizations FROM authenticated;

-- org_update solo pedía misma organización, así que cualquier empleado podía
-- reescribir el CUIT, el nombre o pisar el token de MP. Ahora, solo el dueño.
DROP POLICY IF EXISTS org_update ON public.organizations;
CREATE POLICY org_update ON public.organizations
  FOR UPDATE
  USING      (id = get_org_id() AND get_user_role() = 'owner')
  WITH CHECK (id = get_org_id() AND get_user_role() = 'owner');

-- org_select se conserva: la vista corre como su dueño, pero la política sigue
-- protegiendo cualquier acceso futuro del cliente a la tabla.

COMMIT;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- (a) Esperado: una fila 'OK'.
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM information_schema.column_privileges
                WHERE table_schema='public' AND table_name='organizations'
                  AND grantee='authenticated' AND privilege_type='SELECT'
                  AND column_name <> 'id')
    THEN 'FALLA: authenticated todavía lee columnas de organizations además de id'
  WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='mi_organizacion')
    THEN 'FALLA: no se creó la vista mi_organizacion'
  WHEN EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='mi_organizacion'
                  AND (column_name LIKE '%token%' OR column_name LIKE '%_pem%'))
    THEN 'FALLA: la vista expone un secreto'
  ELSE 'OK: los secretos del negocio ya no son legibles desde el cliente'
END AS resultado;

-- (b) Qué columnas quedaron expuestas en la vista. Revisar que no haya nada
--     sensible que no hayan atrapado los patrones.
SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) AS columnas_visibles
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'mi_organizacion';
