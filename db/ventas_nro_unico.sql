-- ============================================================================
-- Stockio — Número de factura único por organización
--
-- EL PROBLEMA
--
-- Aparecieron dos ventas reales con el MISMO número de factura (FC-3004),
-- mismo cliente y mismo total, creadas con 98 milisegundos de diferencia.
--
-- Causa inmediata: el botón "Guardar venta" no se deshabilitaba mientras
-- guardaba y `save()` no tenía guarda de reentrada, así que dos clics
-- disparaban dos llamadas a crear_venta_segura(). Eso ya se arregló en el
-- código (guarda por ref + botón deshabilitado).
--
-- Pero el código no puede ser la única defensa: un número de factura repetido
-- es un problema fiscal, no cosmético. Esto lo vuelve imposible a nivel de
-- base, que es donde corresponde.
--
-- NO BORRA NADA. Si encuentra duplicados, aborta y te los muestra para que
-- decidas vos cuál conservar: son datos de ventas, no los toca un script.
--
-- Correr en Supabase → SQL Editor. Es idempotente.
-- ============================================================================

-- PASO 1 — ¿Hay duplicados? Esta consulta los lista.
-- Si devuelve filas, resolvelos antes de seguir al paso 2.
SELECT org_id,
       nro_factura,
       count(*)                          AS cuantas,
       array_agg(id ORDER BY created_at) AS ids_por_antiguedad,
       array_agg(created_at ORDER BY created_at) AS fechas
  FROM ventas
 GROUP BY org_id, nro_factura
HAVING count(*) > 1;

-- PASO 2 — Borrar el duplicado MÁS NUEVO de cada número repetido.
--
-- Está comentado a propósito: leé primero el resultado del paso 1 y confirmá
-- que las filas son de verdad la misma venta cargada dos veces (mismo cliente,
-- mismo total, segundos de diferencia). Recién ahí descomentá y corré.
--
-- Borrar la venta dispara el trigger que devuelve el stock, así que las
-- unidades que descontó de más vuelven al inventario. Eso es lo correcto: esa
-- venta nunca existió.
--
-- DELETE FROM ventas v
--  WHERE v.id IN (
--    SELECT id FROM (
--      SELECT id, row_number() OVER (PARTITION BY org_id, nro_factura
--                                    ORDER BY created_at) AS n
--        FROM ventas
--    ) t WHERE t.n > 1
--  );

-- PASO 3 — El candado. Correr recién cuando el paso 1 no devuelva nada.
-- Si todavía hay duplicados, esto falla con un error claro y no rompe nada.
CREATE UNIQUE INDEX IF NOT EXISTS ventas_org_nro_factura_key
  ON public.ventas (org_id, nro_factura);

-- Verificación. Esperado: una fila 'OK'.
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND indexname = 'ventas_org_nro_factura_key')
    THEN 'FALLA: no se creó el índice único (¿quedan duplicados?)'
  ELSE 'OK: un número de factura no se puede repetir dentro de una organización'
END AS resultado;
