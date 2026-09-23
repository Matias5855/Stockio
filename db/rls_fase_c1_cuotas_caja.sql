-- ============================================================================
-- Stockio — RLS Fase C1: alinear cuotas y caja con los permisos
--
-- EL PROBLEMA — plata cobrada que no llega a la caja
--
-- `registrarPago` (cuotas/page.tsx) hace cuatro escrituras seguidas:
--   1. cuota_pagos  -> pagada            (política: solo org)
--   2. cuotas_ventas -> total pagado     (política: solo org)
--   3. movimientos  -> ingreso en caja   (política: owner/admin)
--   4. ventas       -> cobrada           (política: owner/admin)
--
-- Para alguien que no sea owner ni admin, las dos últimas fallan. Y como
-- ninguna de las cuatro chequeaba el error, el resultado era: la cuota queda
-- marcada como pagada, pero la plata NUNCA aparece en Finanzas y la venta
-- vinculada queda pendiente. Sin ningún aviso.
--
-- Estaba latente mientras no hubiera empleados. El preset `vendedor` que se
-- agregó en 1.4.E incluye gestionar_cuotas — con el criterio de que en una
-- PyME argentina el del mostrador cobra cuotas — así que ahora el botón
-- "Cobrar" se le muestra a alguien que la base rechaza a mitad de camino.
--
-- EL OTRO PROBLEMA — el permiso de cuotas no existía en la base
--
-- cuotas_ventas y cuota_pagos tenían una sola política `ALL` con solo
-- `org_id = get_org_id()`. Cualquier empleado podía crear planes de pago y
-- cobrar cuotas llamando a la API directo: `gestionar_cuotas` solo escondía
-- botones en la interfaz.
--
-- QUÉ NO SE TOCA
-- movimientos_delete sigue siendo solo del dueño. Las políticas de productos,
-- ventas (salvo el update que necesita este flujo), venta_items, archivos e
-- historial quedan como están: hoy funcionan y se revisan aparte.
--
-- Efecto neto por rol (owner siempre pasa por el bypass de tiene_permiso):
--   admin     -> sin cambios (tiene ver_finanzas y editar_ventas)
--   vendedor  -> gana registrar el ingreso en caja al cobrar una cuota y
--                marcar una venta como cobrada. Es lo que arregla el bug.
--   repositor -> sin cambios (no tiene ninguna de las claves)
--
-- Requiere db/permisos_completos.sql ya corrido (las claves ver_cuotas,
-- gestionar_cuotas y editar_ventas tienen que existir en los profiles).
-- Va junto con el deploy del código que chequea los errores.
--
-- Correr COMPLETO en Supabase → SQL Editor. Es idempotente.
-- ============================================================================

BEGIN;

-- 1. movimientos -------------------------------------------------------------
DROP POLICY IF EXISTS movimientos_select ON public.movimientos;
CREATE POLICY movimientos_select ON public.movimientos
  FOR SELECT
  USING (org_id = get_org_id() AND tiene_permiso('ver_finanzas'));

-- El OR no es un descuido: un movimiento de caja se crea desde dos lugares
-- distintos, la pantalla de Finanzas y el cobro de una cuota, y cada uno
-- responde a un permiso propio.
DROP POLICY IF EXISTS movimientos_insert ON public.movimientos;
CREATE POLICY movimientos_insert ON public.movimientos
  FOR INSERT
  WITH CHECK (
    org_id = get_org_id()
    AND (tiene_permiso('ver_finanzas') OR tiene_permiso('gestionar_cuotas'))
  );

-- 2. ventas: marcar como cobrada --------------------------------------------
-- Antes exigía role owner/admin. Ahora usa la clave editar_ventas, que es la
-- que la interfaz ya usa para el botón de cambiar estado (1.4.E).
DROP POLICY IF EXISTS ventas_update ON public.ventas;
CREATE POLICY ventas_update ON public.ventas
  FOR UPDATE
  USING      (org_id = get_org_id() AND tiene_permiso('editar_ventas'))
  WITH CHECK (org_id = get_org_id() AND tiene_permiso('editar_ventas'));

-- 3. cuotas_ventas -----------------------------------------------------------
DROP POLICY IF EXISTS cuotas_ventas_policy ON public.cuotas_ventas;

DROP POLICY IF EXISTS cuotas_ventas_select ON public.cuotas_ventas;
CREATE POLICY cuotas_ventas_select ON public.cuotas_ventas
  FOR SELECT USING (org_id = get_org_id() AND tiene_permiso('ver_cuotas'));

DROP POLICY IF EXISTS cuotas_ventas_insert ON public.cuotas_ventas;
CREATE POLICY cuotas_ventas_insert ON public.cuotas_ventas
  FOR INSERT WITH CHECK (org_id = get_org_id() AND tiene_permiso('gestionar_cuotas'));

DROP POLICY IF EXISTS cuotas_ventas_update ON public.cuotas_ventas;
CREATE POLICY cuotas_ventas_update ON public.cuotas_ventas
  FOR UPDATE
  USING      (org_id = get_org_id() AND tiene_permiso('gestionar_cuotas'))
  WITH CHECK (org_id = get_org_id() AND tiene_permiso('gestionar_cuotas'));

DROP POLICY IF EXISTS cuotas_ventas_delete ON public.cuotas_ventas;
CREATE POLICY cuotas_ventas_delete ON public.cuotas_ventas
  FOR DELETE USING (org_id = get_org_id() AND tiene_permiso('gestionar_cuotas'));

-- 4. cuota_pagos -------------------------------------------------------------
-- Ojo: las filas de cuota_pagos las crea el trigger generar_cuotas() al
-- insertar un plan. Ese trigger es SECURITY INVOKER, así que el INSERT corre
-- con los permisos de quien creó el plan — y quien crea planes tiene
-- gestionar_cuotas, que es justo lo que pide la política de abajo.
DROP POLICY IF EXISTS cuota_pagos_policy ON public.cuota_pagos;

DROP POLICY IF EXISTS cuota_pagos_select ON public.cuota_pagos;
CREATE POLICY cuota_pagos_select ON public.cuota_pagos
  FOR SELECT USING (org_id = get_org_id() AND tiene_permiso('ver_cuotas'));

DROP POLICY IF EXISTS cuota_pagos_insert ON public.cuota_pagos;
CREATE POLICY cuota_pagos_insert ON public.cuota_pagos
  FOR INSERT WITH CHECK (org_id = get_org_id() AND tiene_permiso('gestionar_cuotas'));

DROP POLICY IF EXISTS cuota_pagos_update ON public.cuota_pagos;
CREATE POLICY cuota_pagos_update ON public.cuota_pagos
  FOR UPDATE
  USING      (org_id = get_org_id() AND tiene_permiso('gestionar_cuotas'))
  WITH CHECK (org_id = get_org_id() AND tiene_permiso('gestionar_cuotas'));

DROP POLICY IF EXISTS cuota_pagos_delete ON public.cuota_pagos;
CREATE POLICY cuota_pagos_delete ON public.cuota_pagos
  FOR DELETE USING (org_id = get_org_id() AND tiene_permiso('gestionar_cuotas'));

COMMIT;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- (a) Esperado: una fila 'OK'.
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                AND policyname IN ('cuotas_ventas_policy','cuota_pagos_policy'))
    THEN 'FALLA: siguen las políticas viejas ALL de cuotas'
  WHEN (SELECT count(*) FROM pg_policies WHERE schemaname='public'
         AND tablename IN ('cuotas_ventas','cuota_pagos')) <> 8
    THEN 'FALLA: no quedaron las 8 políticas de cuotas'
  ELSE 'OK: cuotas y caja alineadas con los permisos'
END AS resultado;

-- (b) Como owner, todo esto tiene que dar true.
SELECT tiene_permiso('ver_finanzas')     AS finanzas,
       tiene_permiso('gestionar_cuotas') AS cuotas,
       tiene_permiso('editar_ventas')    AS ventas;

-- (c) Repaso de las políticas que quedaron en las tablas tocadas.
SELECT tablename, policyname, cmd FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN ('movimientos','ventas','cuotas_ventas','cuota_pagos')
 ORDER BY tablename, cmd, policyname;
