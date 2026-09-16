-- ============================================================================
-- Stockio — RLS Fase B1: cerrar la escalada a dueño
--
-- EL PROBLEMA
--
-- La política actual es:
--   profiles_update | USING ((id = auth.uid()) OR ((org_id = get_org_id())
--                             AND (get_user_role() = ANY (ARRAY['owner','admin']))))
--                   | WITH CHECK: (ninguno)
--
-- Dos fallas que se suman:
--   a) `id = auth.uid()` deja que CUALQUIER usuario actualice su propia fila.
--   b) Sin WITH CHECK, Postgres reusa la expresión de USING para validar la
--      fila nueva. Como `id = auth.uid()` sigue siendo cierto después del
--      cambio, la validación pasa.
--
-- Resultado: cualquier empleado podía ejecutar desde la consola del navegador
--   update profiles set role='owner', permisos='{...todo true}' where id=auth.uid()
-- y quedarse con el negocio. Todo el sistema de roles y permisos era decorativo.
--
-- LA SOLUCIÓN
--
-- Se le saca al cliente el privilegio de UPDATE e INSERT sobre profiles. La
-- única operación legítima que hacía (el dueño editando los permisos de un
-- empleado) pasa por una función acotada que no puede tocar `role` ni `org_id`.
--
-- Nota sobre profiles_insert: su CHECK era `(id = auth.uid())`, sin mirar
-- org_id. Un usuario de Supabase Auth sin perfil podía insertarse uno con el
-- org_id de cualquier negocio y entrar. Los perfiles reales los crean
-- /api/auth/register y /api/empleados/aceptar con service_role, que saltea RLS
-- y no necesita este privilegio.
--
-- Correr COMPLETO en Supabase → SQL Editor. Es idempotente.
-- Requiere haber corrido antes rls_fase_a_lockdown.sql.
-- ============================================================================

BEGIN;

-- 1. Fijar search_path en las funciones de las que cuelga la seguridad -------
-- Una función SECURITY DEFINER sin search_path fijo puede ser redirigida a
-- objetos falsos por quien pueda crear esquemas. Son las tres funciones que
-- deciden de quién son los datos, así que van primero.
-- (El resto del hardening de funciones queda para la Fase D.)
ALTER FUNCTION public.get_org_id()    SET search_path = public;
ALTER FUNCTION public.get_user_role() SET search_path = public;
ALTER FUNCTION public.get_org_plan()  SET search_path = public;

-- 2. Helper de permisos ------------------------------------------------------
-- Hasta ahora las políticas solo miraban `role`. Esta función permite mirar
-- las claves de `profiles.permisos`, que es lo que la interfaz ya usa.
-- Va SECURITY DEFINER para poder leer `profiles` sin disparar la RLS de
-- `profiles` (una política sobre profiles que consulte profiles entra en
-- recursión infinita).
CREATE OR REPLACE FUNCTION public.tiene_permiso(p_clave text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- El dueño siempre puede. Si la clave no existe, (permisos->>clave)::boolean
  -- da NULL y el COALESCE lo resuelve como "no tiene permiso".
  SELECT COALESCE(
    (SELECT role = 'owner' OR (permisos ->> p_clave)::boolean
       FROM profiles WHERE id = auth.uid() LIMIT 1),
    false);
$$;

REVOKE ALL ON FUNCTION public.tiene_permiso(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tiene_permiso(text) TO authenticated;

-- 3. Cambiar permisos de un empleado, de forma acotada -----------------------
-- Reemplaza al UPDATE directo desde el navegador. Solo escribe `permisos`:
-- ni `role`, ni `org_id`, ni `id`. Y solo sobre empleados de la propia
-- organización, nunca sobre uno mismo.
CREATE OR REPLACE FUNCTION public.actualizar_permisos_empleado(
  p_empleado_id uuid,
  p_permisos    jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := get_org_id();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT tiene_permiso('gestionar_usuarios') THEN
    RAISE EXCEPTION 'No tenés permiso para cambiar permisos';
  END IF;

  -- Nadie se edita a sí mismo: es justamente el camino de la escalada.
  IF p_empleado_id = auth.uid() THEN
    RAISE EXCEPTION 'No podés cambiar tus propios permisos';
  END IF;

  IF jsonb_typeof(p_permisos) <> 'object' THEN
    RAISE EXCEPTION 'permisos debe ser un objeto';
  END IF;

  UPDATE profiles
     SET permisos = p_permisos
   WHERE id = p_empleado_id
     AND org_id = v_org_id      -- no se puede tocar gente de otro negocio
     AND role <> 'owner';       -- ni degradar al dueño

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empleado no encontrado en tu negocio';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_permisos_empleado(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_permisos_empleado(uuid, jsonb) TO authenticated;

-- 4. Sacarle al cliente UPDATE e INSERT sobre profiles -----------------------
-- reclamar_sesion() y actualizar_permisos_empleado() son SECURITY DEFINER:
-- corren con los privilegios de su dueño y siguen funcionando igual.
DROP POLICY IF EXISTS profiles_update ON public.profiles;
DROP POLICY IF EXISTS profiles_insert ON public.profiles;

REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;

-- SELECT y DELETE quedan como estaban: profiles_select (uno mismo o la propia
-- org) y profiles_delete (solo el dueño, y nunca a sí mismo) ya son correctas.

COMMIT;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- (a) Esperado: una fila 'OK'.
SELECT CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.role_table_grants
          WHERE table_schema='public' AND table_name='profiles'
            AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE'))
       THEN 'FALLA: authenticated todavía puede escribir profiles'
       ELSE 'OK: profiles no es escribible desde el cliente' END AS resultado;

-- (b) Las funciones de seguridad siguen respondiendo. Esperado: tu org y 'owner'.
SELECT get_org_id() AS mi_org, get_user_role() AS mi_rol,
       tiene_permiso('gestionar_usuarios') AS puedo_gestionar;

-- (c) Políticas que quedan en profiles. Esperado: solo select y delete.
SELECT policyname, cmd FROM pg_policies
 WHERE schemaname='public' AND tablename='profiles' ORDER BY policyname;
