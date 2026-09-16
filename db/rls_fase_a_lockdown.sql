-- ============================================================================
-- Stockio — RLS Fase A: cerrar lo destructivo
--
-- Esta fase NO toca ninguna política de negocio. Solo saca privilegios que la
-- app nunca usa y borra políticas duplicadas que anulan a las buenas.
-- Por eso es la primera: es la de mayor impacto y menor riesgo de romper algo.
--
-- QUÉ ARREGLA
--
-- 1. TRUNCATE. Es el hallazgo grave. RLS filtra SELECT/INSERT/UPDATE/DELETE,
--    pero NO filtra TRUNCATE — eso se rige solo por el privilegio de tabla.
--    Hoy `authenticated` tiene TRUNCATE sobre todas las tablas, así que
--    CUALQUIER usuario logueado (un trial, un repositor) podía vaciar ventas,
--    productos o profiles de TODAS las organizaciones, no solo de la suya.
--    `anon` también lo tenía sobre historial, security_logs y venta_secuencia,
--    y la anon key viaja en el bundle del navegador.
--
-- 2. Storage. Las políticas `select_own_files` / `delete_own_files` usan
--    `auth.role() = 'authenticated'`, sin filtrar por organización. Como las
--    políticas PERMISSIVE se combinan con OR, anulaban a las buenas
--    (`stockio_archivos_*`, que sí filtran por carpeta de org): cualquier
--    usuario logueado podía leer y borrar archivos de otros negocios.
--
-- 3. Políticas legacy duplicadas en `archivos` e `historial`, que hacían lo
--    mismo: `archivos_delete` exige owner/admin, pero la vieja
--    "eliminar archivos de mi org" sólo exigía misma org, así que la
--    restricción de rol no servía para nada.
--
-- 4. Vistas v_* (v_stock_bajo, v_ventas_detalle, v_resumen_caja,
--    v_cuotas_resumen). Una vista corre con los privilegios de SU DUEÑO salvo
--    que tenga security_invoker, así que puede saltear el RLS de las tablas
--    que consulta. El código no usa ninguna: se les corta el acceso.
--
-- 5. `historial` pasa a ser append-only. Un log de auditoría que el auditado
--    puede editar o borrar no sirve como auditoría. La app sólo inserta y lee.
--
-- NO ROMPE NADA: se verificó en el código que ninguna página pública consulta
-- tablas (la de /invite usa service_role), que la app nunca usa TRUNCATE,
-- REFERENCES ni TRIGGER, que no escribe en vistas, y que no actualiza ni
-- borra historial.
--
-- Correr COMPLETO en Supabase → SQL Editor. Es idempotente.
-- ============================================================================

BEGIN;

-- 1. Sacar privilegios peligrosos que la app no usa --------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p')
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated',
      r.relname);
  END LOOP;
END $$;

-- 2. `anon` no necesita NADA de public --------------------------------------
-- Ningún flujo anónimo consulta la base: registro, aceptar invitación y la
-- página /invite usan service_role del lado del servidor.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- 3. Vistas: sin acceso -----------------------------------------------------
-- Ninguna se usa en el código, y pueden saltear el RLS de las tablas base.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', r.relname);
  END LOOP;
END $$;

-- 4. Tablas que el cliente no toca ------------------------------------------
-- venta_secuencia la maneja crear_venta_segura(), que es SECURITY DEFINER y
-- corre con los privilegios de su dueño: sigue funcionando igual.
REVOKE ALL ON public.venta_secuencia FROM authenticated;

-- categorias / clientes / proveedores: sin uso en el código y sin políticas.
REVOKE ALL ON public.categorias   FROM authenticated;
REVOKE ALL ON public.clientes     FROM authenticated;
REVOKE ALL ON public.proveedores  FROM authenticated;

-- security_logs: se lee (la política ya limita a owner), no se escribe desde
-- el cliente.
REVOKE INSERT, UPDATE, DELETE ON public.security_logs FROM authenticated;

-- pagos: los inserta el webhook de MP con service_role. El cliente solo lee.
REVOKE INSERT, UPDATE, DELETE ON public.pagos FROM authenticated;

-- historial: append-only.
REVOKE UPDATE, DELETE ON public.historial FROM authenticated;

-- 5. Borrar políticas legacy que anulan a las buenas ------------------------
-- archivos: las tres viejas sólo miran la org y dejan sin efecto la exigencia
-- de owner/admin para borrar. La de UPDATE se va sin reemplazo: la app nunca
-- actualiza un archivo.
DROP POLICY IF EXISTS "ver archivos de mi org"       ON public.archivos;
DROP POLICY IF EXISTS "insertar archivos en mi org"  ON public.archivos;
DROP POLICY IF EXISTS "eliminar archivos de mi org"  ON public.archivos;
DROP POLICY IF EXISTS "actualizar archivos de mi org" ON public.archivos;

-- historial: `historial_org` (ALL, misma org) ya cubre leer e insertar.
DROP POLICY IF EXISTS "ver historial de mi org" ON public.historial;
DROP POLICY IF EXISTS "insertar en mi org"      ON public.historial;

-- organizations: INSERT duplicado con CHECK true. Queda `org_insert`, que se
-- endurece en la Fase C junto con el cambio de código del registro.
DROP POLICY IF EXISTS organizations_service_role ON public.organizations;

-- 6. Storage: sacar las políticas sin filtro de organización ----------------
-- Quedan las stockio_archivos_*, que sí exigen que la carpeta raíz del objeto
-- sea el org_id del usuario.
DROP POLICY IF EXISTS "select_own_files 1pqbxcg_0" ON storage.objects;
DROP POLICY IF EXISTS "insert_own_files 1pqbxcg_0" ON storage.objects;
DROP POLICY IF EXISTS "delete_own_files 1pqbxcg_0" ON storage.objects;
DROP POLICY IF EXISTS "delete_own_files 1pqbxcg_1" ON storage.objects;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN — correr después y revisar que dé lo esperado.
-- ============================================================================

-- (a) Nadie debería tener TRUNCATE. Esperado: 0 filas.
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee IN ('anon', 'authenticated')
   AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER');

-- (b) `anon` no debería tener nada en public. Esperado: 0 filas.
SELECT table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND grantee = 'anon';

-- (c) Storage: deberían quedar sólo las tres stockio_archivos_*.
SELECT policyname, cmd FROM pg_policies
 WHERE schemaname = 'storage' ORDER BY policyname;
