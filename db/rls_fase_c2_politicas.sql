-- ============================================================================
-- Stockio — RLS Fase C2: las políticas miran `permisos`, no solo `role`
--
-- Hasta acá las políticas preguntaban por `get_user_role()`, o sea "owner /
-- admin / el resto". Las 14 claves de `profiles.permisos` solo escondían
-- botones. Esto las convierte en frontera real.
--
-- UN ARREGLO, NO SOLO ENDURECIMIENTO
--
-- productos_insert/update/delete exigen hoy role IN ('owner','admin'). El
-- preset `repositor` — cuyo trabajo ES el inventario — tiene editar_stock en
-- true y ve los botones, pero la base lo rechaza. Hoy un repositor no puede
-- cargar ni editar un producto. Esta fase lo arregla.
--
-- LO QUE NO ARREGLA (queda explícito)
--
-- `ventas_insert` es letra muerta para la app: las ventas se crean con
-- crear_venta_segura(), que es SECURITY DEFINER y saltea RLS. La RPC solo
-- valida que el usuario tenga organización, ningún permiso. Para que
-- `crear_ventas` valga de verdad, el chequeo va ADENTRO de esa función; se
-- trata aparte porque implica reescribir su cuerpo completo.
-- La política igual se endurece: cierra el acceso directo por API.
--
-- CAMBIOS DE COMPORTAMIENTO A REVISAR (no son efectos colaterales, son
-- consecuencia de los presets definidos en 1.4.E):
--   · repositor GANA editar productos            <- el arreglo
--   · borrar ventas queda SOLO para el dueño    <- preset: eliminar_ventas=false
--     en los tres roles invitables (ajuste del 2026-09-22)
--   · repositor PIERDE ver ventas                <- preset: ver_ventas false
--   · vendedor y repositor PIERDEN ver archivos  <- preset: ver_archivos false
--   · solo quien tenga ver_historial ve el historial (antes, toda la org)
--
-- historial: el INSERT queda abierto a cualquier miembro A PROPÓSITO.
-- logHistorial() corre en cada acción de cualquier usuario y su error se
-- ignora por diseño ("nice-to-have"). Si se gateara con ver_historial, el log
-- de auditoría pasaría a registrar solo lo que hace un admin, en silencio —
-- justo lo contrario de para qué existe.
--
-- Requiere db/permisos_completos.sql ya corrido.
-- Correr COMPLETO en Supabase → SQL Editor. Es idempotente: cada politica se
-- borra por nombre antes de crearse, asi que se puede re-correr sin error.
-- ============================================================================

BEGIN;

-- 1. productos ---------------------------------------------------------------
DROP POLICY IF EXISTS productos_select ON public.productos;
CREATE POLICY productos_select ON public.productos
  FOR SELECT USING (org_id = get_org_id() AND tiene_permiso('ver_stock'));

DROP POLICY IF EXISTS productos_insert ON public.productos;
CREATE POLICY productos_insert ON public.productos
  FOR INSERT WITH CHECK (org_id = get_org_id() AND tiene_permiso('editar_stock'));

-- El borrado de productos es lógico (activo = false), así que pasa por UPDATE.
DROP POLICY IF EXISTS productos_update ON public.productos;
CREATE POLICY productos_update ON public.productos
  FOR UPDATE
  USING      (org_id = get_org_id() AND tiene_permiso('editar_stock'))
  WITH CHECK (org_id = get_org_id() AND tiene_permiso('editar_stock'));

DROP POLICY IF EXISTS productos_delete ON public.productos;
CREATE POLICY productos_delete ON public.productos
  FOR DELETE USING (org_id = get_org_id() AND tiene_permiso('editar_stock'));

-- 2. ventas ------------------------------------------------------------------
-- ventas_update ya quedó con editar_ventas en la Fase C1; no se toca acá.
DROP POLICY IF EXISTS ventas_select ON public.ventas;
CREATE POLICY ventas_select ON public.ventas
  FOR SELECT USING (org_id = get_org_id() AND tiene_permiso('ver_ventas'));

DROP POLICY IF EXISTS ventas_insert ON public.ventas;
CREATE POLICY ventas_insert ON public.ventas
  FOR INSERT WITH CHECK (org_id = get_org_id() AND tiene_permiso('crear_ventas'));

DROP POLICY IF EXISTS ventas_delete ON public.ventas;
CREATE POLICY ventas_delete ON public.ventas
  FOR DELETE USING (org_id = get_org_id() AND tiene_permiso('eliminar_ventas'));

-- 3. venta_items -------------------------------------------------------------
-- No tiene org_id: se aísla por la venta a la que pertenece.
DROP POLICY IF EXISTS venta_items_select ON public.venta_items;
CREATE POLICY venta_items_select ON public.venta_items
  FOR SELECT USING (
    venta_id IN (SELECT id FROM ventas WHERE org_id = get_org_id())
    AND tiene_permiso('ver_ventas'));

DROP POLICY IF EXISTS venta_items_insert ON public.venta_items;
CREATE POLICY venta_items_insert ON public.venta_items
  FOR INSERT WITH CHECK (
    venta_id IN (SELECT id FROM ventas WHERE org_id = get_org_id())
    AND tiene_permiso('crear_ventas'));

DROP POLICY IF EXISTS venta_items_delete ON public.venta_items;
CREATE POLICY venta_items_delete ON public.venta_items
  FOR DELETE USING (
    venta_id IN (SELECT id FROM ventas WHERE org_id = get_org_id())
    AND tiene_permiso('eliminar_ventas'));

-- 4. archivos ----------------------------------------------------------------
DROP POLICY IF EXISTS archivos_select ON public.archivos;
CREATE POLICY archivos_select ON public.archivos
  FOR SELECT USING (org_id = get_org_id() AND tiene_permiso('ver_archivos'));

DROP POLICY IF EXISTS archivos_insert ON public.archivos;
CREATE POLICY archivos_insert ON public.archivos
  FOR INSERT WITH CHECK (org_id = get_org_id() AND tiene_permiso('ver_archivos'));

DROP POLICY IF EXISTS archivos_delete ON public.archivos;
CREATE POLICY archivos_delete ON public.archivos
  FOR DELETE USING (org_id = get_org_id() AND tiene_permiso('ver_archivos'));

-- 5. historial ---------------------------------------------------------------
DROP POLICY IF EXISTS historial_org ON public.historial;

DROP POLICY IF EXISTS historial_select ON public.historial;
CREATE POLICY historial_select ON public.historial
  FOR SELECT USING (org_id = get_org_id() AND tiene_permiso('ver_historial'));

-- Sin chequeo de permiso, a propósito (ver el comentario del encabezado).
DROP POLICY IF EXISTS historial_insert ON public.historial;
CREATE POLICY historial_insert ON public.historial
  FOR INSERT WITH CHECK (org_id = get_org_id());

-- Sin UPDATE ni DELETE: el historial quedó append-only en la Fase A.

COMMIT;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- (a) Esperado: una fila 'OK'.
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                AND policyname = 'historial_org')
    THEN 'FALLA: sigue la política vieja historial_org'
  WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                AND tablename IN ('productos','ventas','venta_items','archivos','historial')
                AND qual LIKE '%get_user_role%')
    THEN 'FALLA: quedó alguna política mirando role en vez de permisos'
  WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                AND tablename='historial' AND cmd IN ('UPDATE','DELETE'))
    THEN 'FALLA: el historial dejó de ser append-only'
  ELSE 'OK: las políticas miran permisos'
END AS resultado;

-- (b) Como owner, todo true.
SELECT tiene_permiso('ver_stock')    AS ver_stock,
       tiene_permiso('editar_stock') AS editar_stock,
       tiene_permiso('ver_ventas')   AS ver_ventas,
       tiene_permiso('ver_archivos') AS ver_archivos,
       tiene_permiso('ver_historial') AS ver_historial;

-- (c) Prueba de humo: esto tiene que devolver filas si tenés productos.
SELECT count(*) AS productos_visibles FROM productos;
