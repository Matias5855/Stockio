-- ============================================================================
-- Stockio — Publicar cuotas_ventas en Realtime
--
-- POR QUÉ
--
-- La pantalla de Cuotas pasó a leer por `useTableSync`, que además de cachear
-- en IndexedDB abre una suscripción `postgres_changes` sobre la tabla. Si la
-- tabla no está en la publicación `supabase_realtime`, esa suscripción se crea,
-- el canal queda abierto y NO llega un solo evento — exactamente lo que pasaba
-- con productos, ventas y movimientos antes de db/realtime_tablas.sql.
--
-- Sin esto, la lista de planes no se refresca cuando el webhook de Mercado Pago
-- marca una cuota como pagada: el cobro entra, la base se actualiza y la
-- pantalla sigue mostrando la cuota pendiente hasta que se recargue a mano.
--
-- `cuota_pagos` NO se publica: sus filas viajan anidadas dentro de
-- cuotas_ventas (igual que venta_items dentro de ventas), y la app no suscribe
-- esa tabla. Cuando el trigger actualiza un pago también toca el plan, así que
-- el evento del plan alcanza para disparar el refetch.
--
-- SOBRE LA RLS: publicar una tabla no expone nada. Cada cliente recibe
-- únicamente los cambios de las filas que ya podría leer con un SELECT — las
-- políticas de db/rls_fase_c1_cuotas_caja.sql siguen aplicando sobre el stream.
--
-- Correr en Supabase → SQL Editor. Es idempotente.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'cuotas_ventas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cuotas_ventas;
    RAISE NOTICE 'Publicada: cuotas_ventas';
  ELSE
    RAISE NOTICE 'Ya estaba publicada: cuotas_ventas';
  END IF;
END $$;

-- ============================================================================
-- VERIFICACIÓN — esperado: 'OK', y abajo las cinco tablas publicadas.
-- ============================================================================

SELECT CASE WHEN EXISTS (
         SELECT 1 FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
            AND tablename = 'cuotas_ventas')
       THEN 'OK: cuotas_ventas publica cambios en vivo'
       ELSE 'FALLA: cuotas_ventas sigue sin publicar' END AS resultado;

SELECT tablename FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
 ORDER BY tablename;
