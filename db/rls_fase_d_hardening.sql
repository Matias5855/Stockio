-- ============================================================================
-- Stockio — RLS Fase D: que el agujero no se vuelva a abrir solo
--
-- EL PROBLEMA QUE PREVIENE
--
-- El hallazgo más grave del diagnóstico fue que `authenticated` y `anon` tenían
-- TRUNCATE sobre todas las tablas: RLS no filtra TRUNCATE, así que cualquier
-- usuario logueado podía vaciar las tablas de TODAS las organizaciones. La
-- Fase A lo revocó sobre las tablas que existían en ese momento.
--
-- Pero eso no impide que vuelva a pasar. Esos privilegios no los puso nadie a
-- mano: vienen de los privilegios POR DEFECTO del esquema. Cada tabla nueva
-- que se cree desde el dashboard nace con ellos otra vez. Sin esta fase, el
-- agujero se reabre solo la próxima vez que agregues una tabla.
--
-- QUÉ HACE
--
-- 1. Cambia los privilegios por defecto de `public` para que las tablas nuevas
--    no nazcan con TRUNCATE / REFERENCES / TRIGGER para anon ni authenticated,
--    ni con nada para anon.
-- 2. Deja un diagnóstico al final para revisar qué funciones siguen sin
--    search_path fijado (ver la nota más abajo).
--
-- QUÉ NO HACE, Y POR QUÉ
--
-- No toca el search_path de las funciones que quedan. Las que importaban —
-- get_org_id, get_user_role, get_org_plan — son SECURITY DEFINER y ya se
-- fijaron en la Fase B1; crear_venta_segura, reclamar_sesion, tiene_permiso y
-- actualizar_permisos_empleado nacieron con él. Las que quedan sin fijar son
-- todas SECURITY INVOKER (triggers de stock, cuotas, suscripción): corren con
-- los privilegios de quien las llama, así que no son vector de escalada.
-- Fijarles el search_path es higiene, pero implica tocar nueve funciones que
-- hoy andan bien, y si alguna referenciara un objeto de otro esquema sin
-- calificar, se rompería. Queda diagnosticado, no aplicado.
--
-- Tampoco toca el auto-enable de RLS: el proyecto ya tiene un event trigger
-- `rls_auto_enable()` que prende RLS en cada tabla nueva. Por eso categorias,
-- clientes y proveedores aparecieron con RLS activo y sin políticas.
--
-- Correr COMPLETO en Supabase → SQL Editor. Es idempotente.
-- No requiere deploy de código: no cambia nada del comportamiento actual.
-- ============================================================================

BEGIN;

-- 1. Privilegios por defecto para TABLAS nuevas ------------------------------
-- Los defaults están asociados al rol que crea el objeto, así que hay que
-- tocarlos para cada rol que ya tenga defaults configurados en el esquema.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT pg_get_userbyid(defaclrole) AS rol
      FROM pg_default_acl
     WHERE defaclnamespace = 'public'::regnamespace
       AND defaclobjtype = 'r'
  LOOP
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
         REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated',
      r.rol);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
         REVOKE ALL ON TABLES FROM anon',
      r.rol);
  END LOOP;
END $$;

-- Y para el rol con el que se está corriendo esto, por si todavía no tiene
-- una entrada propia en pg_default_acl.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- (a) Privilegios por defecto que quedaron. Revisar que en ninguna línea
--     aparezca anon, ni la letra D (TRUNCATE) para authenticated.
--     Las letras son: r=SELECT a=INSERT w=UPDATE d=DELETE D=TRUNCATE
--                     x=REFERENCES t=TRIGGER
SELECT pg_get_userbyid(defaclrole) AS rol_creador,
       defaclobjtype               AS tipo,
       defaclacl::text             AS privilegios_por_defecto
  FROM pg_default_acl
 WHERE defaclnamespace = 'public'::regnamespace;

-- (b) Confirmación de que lo de la Fase A sigue en pie. Esperado: 'OK'.
SELECT CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.role_table_grants
          WHERE table_schema = 'public'
            AND ((grantee IN ('anon','authenticated') AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER'))
              OR grantee = 'anon'))
       THEN 'FALLA: reaparecieron privilegios peligrosos en tablas existentes'
       ELSE 'OK: tablas existentes limpias y defaults corregidos' END AS resultado;

-- (c) DIAGNÓSTICO, no acción: funciones que siguen sin search_path fijado.
--     Las SECURITY DEFINER de esta lista habría que atenderlas; las invoker
--     son higiene. Hoy la lista debería ser solo invoker.
SELECT p.proname,
       CASE WHEN p.prosecdef THEN 'SECURITY DEFINER  <-- revisar' ELSE 'invoker' END AS tipo
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proconfig IS NULL
 ORDER BY p.prosecdef DESC, p.proname;
