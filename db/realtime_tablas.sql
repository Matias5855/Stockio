-- ============================================================================
-- Stockio — Publicar las tablas que la app escucha por Realtime
--
-- EL HALLAZGO
--
-- La publicación `supabase_realtime` tenía UNA sola tabla: `profiles`, la que
-- se agregó para la sesión única. Ninguna otra.
--
-- Pero `useTableSync` abre una suscripción `postgres_changes` para cada tabla
-- que maneja — productos, ventas y movimientos — y ninguna recibía nada. Las
-- suscripciones se creaban, el canal quedaba abierto, y no llegaba un solo
-- evento. Realtime nunca funcionó en esta app.
--
-- QUÉ SE ROMPÍA POR ESTO
--
--  · Las listas no se refrescaban solas. Después de vender, el desplegable de
--    productos seguía mostrando el stock anterior (por eso parecía que el
--    stock no se descontaba, cuando en la base sí bajaba).
--  · Dos personas con la app abierta no veían los cambios de la otra hasta
--    recargar.
--  · La confirmación automática del cobro por QR NO podía funcionar: la
--    pantalla espera que Realtime avise cuando el webhook marca la venta
--    cobrada. Sin publicación, esa señal nunca llega.
--
-- POR QUÉ NO SE NOTABA
--
-- `useTableSync` hace un fetch al montar, así que las listas se veían bien al
-- entrar a cada pantalla. Lo que faltaba era la actualización EN VIVO, que
-- solo se nota cuando algo cambia mientras estás mirando.
--
-- SOBRE LA RLS: publicar una tabla no expone nada. Cada cliente recibe
-- únicamente los cambios de las filas que ya podría leer con un SELECT —
-- las políticas siguen aplicando sobre el stream.
--
-- Correr en Supabase → SQL Editor. Es idempotente.
-- ============================================================================

DO $$
DECLARE
  t text;
  -- Las tres que suscribe useTableSync. `profiles` ya está (sesión única).
  tablas text[] := ARRAY['productos', 'ventas', 'movimientos'];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Publicada: %', t;
    ELSE
      RAISE NOTICE 'Ya estaba publicada: %', t;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- VERIFICACIÓN — esperado: 'OK', y abajo las cuatro tablas.
-- ============================================================================

SELECT CASE WHEN (
         SELECT count(*) FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
            AND tablename IN ('productos', 'ventas', 'movimientos', 'profiles')
       ) = 4
       THEN 'OK: las cuatro tablas publican cambios en vivo'
       ELSE 'FALLA: falta publicar alguna tabla' END AS resultado;

SELECT tablename FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
 ORDER BY tablename;
